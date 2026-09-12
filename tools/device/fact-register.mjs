#!/usr/bin/env node
// Which producer answers each semantic fact, and which consumer believes it.
//
// The repository is rich in written knowledge and poor in REACHABLE knowledge.
// Five times on 2026-09-11 a decision was made in one place while the fact that
// governed it sat in another: a measurement in a comment, a band table a tool
// already computed, a negative recorded in PROGRESS, a gate in a lane CI never
// runs, and -- the one this file exists for -- a better classifier for a fact
// the executor was answering with a worse one.
//
// `tools/device/intersection-state-gate.mjs` consumes the Cue Helper's native
// button downstroke scores and states its discipline plainly: "fitted grid
// anchors are a diagnostic fallback only" and "a missing stroke score is a
// refusal, never a luma fallback". `apps/device/src/modern-campaign-ports.js`
// answers the same maskOn question from the 20x9 grid and, when that returns
// null, falls back to exactly the luma refutation the other file forbids. Both
// were in the tree for weeks. Nothing compared them, because nothing was
// looking at facts -- only at files.
//
// So this registers the FACT, not the file: every producer of a semantic state,
// the evidence each decides on, and every consumer. `test-fact-register.mjs`
// then refuses a fact whose consumers disagree about which producer to trust.
// That disagreement is the signature of gold sitting under the project's nose.
//
//   node tools/device/fact-register.mjs [--json] [--out FILE]
//   node tools/device/fact-register.mjs --anchor-aim WINNER_HASH   (prints the aim, exit 3 if none)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'device-fact-register-v1';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '../..'));

// A fact is a semantic state some part of the system decides. `evidence` names
// what a producer actually looks at, because that is what separates a strong
// producer from a weak one -- not the file it lives in.
export const FACTS = Object.freeze({
  maskOn: {
    question: 'is the mask fully on?',
    evidenceRanking: ['native-stroke', 'native-explicit', 'grid-anchor', 'grid-luma-fallback'],
    detect: [
      { evidence: 'native-stroke', match: /mask_button_downstroke|maskStroke|maskButtonDownstroke|buttonStrokeState/ },
      { evidence: 'grid-anchor', match: /measureMaskOn|parseMaskRule/ },
      { evidence: 'grid-luma-fallback', match: /MASK_OFF_GRID_LUMA_FLOOR|refutesMaskOn|grid-luma-refutation/ },
    ],
  },
  // DELEGATED, so not ranked against actuating callers. The explicit helper
  // fact is read inside `packages/adapters/src/monitor-rule.js`, and every
  // actuating caller reaches it through `measureMonitorUp`. At file
  // granularity this register cannot tell a producer from a caller that
  // delegates to one, and flagging the callers would be a false positive
  // dressed as a finding. Sharpening this needs call-level provenance, not a
  // wider regex.
  monitorUp: {
    authorityFixedByCharter: true,
    delegated: true,
    question: 'is the monitor raised?',
    evidenceRanking: ['native-explicit', 'native-stroke', 'grid-anchor'],
    detect: [
      { evidence: 'native-stroke', match: /monitor_button_downstroke|monitorStroke/ },
      { evidence: 'native-explicit', match: /fields\.monitorUp|explicitMonitor/ },
      { evidence: 'grid-anchor', match: /measureMonitorUp|parseMonitorRule/ },
    ],
  },
  // CLAUDE.md fixes the authority here: screenstate.py decides whether a night
  // is running, and "a detector which knows one way to be dead must never be
  // what says you are alive". So this fact is REPORTED and never gated on
  // "use the strongest" -- the strongest signal is not the authority.
  screenIdentity: {
    authorityFixedByCharter: true,
    question: 'which screen is on the display?',
    evidenceRanking: ['native-screen', 'python-classifier'],
    detect: [
      { evidence: 'native-screen', match: /FNAF2_NIGHT|frame\.screen|screen-identity/ },
      { evidence: 'python-classifier', match: /screenstate\.py|lifecycle-observe\.py/ },
    ],
  },
  // Same: the Python classifier is the authority that a night is running. The
  // native reads may only SHARPEN the timestamp inside the bracket the authority
  // established: `origin.refined` (adb-device-local-executor.js) and, since
  // 2026-09-12, the helper's NightOnsetLatch, which places the RELEASE at the
  // first held FNAF2_NIGHT frame + the registered aim (see ANCHOR_AIMS). The
  // latch never authorises actuation -- lifecycle's state=night still does --
  // and every anchor refusal releases as before (origin.anchor: unavailable).
  nightOrigin: {
    authorityFixedByCharter: true,
    question: 'when did the night actually start?',
    evidenceRanking: ['native-onset-latch', 'native-screen', 'python-classifier', 'intro-handoff'],
    detect: [
      { evidence: 'native-onset-latch', match: /nightOnsetImageNs|latchedNightOnsetMs|origin\.anchor|nightOnsetFromFrames/ },
      { evidence: 'native-screen', match: /NATIVE_NIGHT_SCREEN|nativeNightAt/ },
      { evidence: 'python-classifier', match: /'lifecycle'|lifecycle\(bridge/ },
      { evidence: 'intro-handoff', match: /intro-handoff/ },
    ],
  },
});

// Where the anchored release aims, PER BINDING. The aim is a number the
// executor acts on, so it lives here with the evidence that derived it, not
// as a flag default with a comment (mistake register 9: a measurement in a
// comment is not a gate). A binding without an entry gets no anchor:
// night5-run.sh asks `--anchor-aim <winnerHash>` and releases the old way
// when this refuses. test-fact-register.mjs checks that every entry's
// evidence names the same binding, that the aim sits inside one of that
// evidence's winning bands with margin, that its 3000-seed confirmations are
// clean, and that the binding the newest Night 5 qualification binds HAS an
// entry -- so a rebinding cannot inherit an aim priced for another policy.
export const ANCHOR_AIMS = Object.freeze({
  'fnv1a-81b5e51c': Object.freeze({
    night: 5,
    aimMs: 233,
    periodMs: 1000,
    // k = whole seconds added to the aim. 0-2 are 3000/3000; 3 and 4 lose ~11%
    // to Balloon Boy (the response is not periodic past ~2.2 s), measured on
    // the first anchored run, which delivered k=3.
    maxK: 2,
    evidence: 'docs/evidence/night5-anchor-aim-20260912.json',
    reason: 'centre of the winning band [166.67, 300]: every model row there is 5 mask ticks and 3000/3000; k is free (233/1233/2233 all 3000/3000)',
  }),
});

/** Minimum distance, in ms, an aim must keep from both edges of its band. */
export const ANCHOR_AIM_MIN_MARGIN_MS = 50;

/**
 * The registered aim for a binding, with its evidence read and checked, or a
 * refusal naming why. Never guesses: an unknown binding is `null`.
 * @param {string} winnerHash
 */
export function anchorAimFor(winnerHash) {
  const entry = ANCHOR_AIMS[winnerHash];
  if (!entry) return { ok: false, reason: `no anchor aim registered for binding ${winnerHash}` };
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(join(ROOT, entry.evidence), 'utf8'));
  } catch (error) {
    return { ok: false, reason: `anchor aim evidence ${entry.evidence} unreadable: ${error.message}` };
  }
  if (evidence.binding !== winnerHash)
    return { ok: false, reason: `anchor aim evidence ${entry.evidence} is for binding ${evidence.binding}, not ${winnerHash}` };
  if (evidence.night !== entry.night || evidence.aimMs !== entry.aimMs)
    return { ok: false, reason: `anchor aim evidence ${entry.evidence} disagrees with the register (night ${evidence.night}, aim ${evidence.aimMs})` };
  const band = (evidence.winningBands ?? []).find(b => b.fromMs + ANCHOR_AIM_MIN_MARGIN_MS <= entry.aimMs &&
    entry.aimMs <= b.toMs - ANCHOR_AIM_MIN_MARGIN_MS);
  if (!band)
    return { ok: false, reason: `aim ${entry.aimMs} ms is not inside a winning band of ${entry.evidence} with ${ANCHOR_AIM_MIN_MARGIN_MS} ms margin` };
  const unclean = (evidence.confirmations3000 ?? []).filter(c => c.wins !== c.seeds);
  if (!evidence.confirmations3000?.length || unclean.length)
    return { ok: false, reason: `3000-seed confirmations in ${entry.evidence} are missing or not clean` };
  if (entry.maxK !== undefined) {
    const covered = evidence.confirmations3000.filter(c => c.wins === c.seeds)
      .map(c => Math.floor((c.epochMs - entry.aimMs + 1) / entry.periodMs));
    for (let k = 0; k <= entry.maxK; k += 1)
      if (!covered.includes(k))
        return { ok: false, reason: `k=${k} is allowed by the register but ${entry.evidence} has no clean 3000-seed row for aim + ${k} s` };
    if ((evidence.kLimit?.maxK ?? entry.maxK) !== entry.maxK)
      return { ok: false, reason: `${entry.evidence} limits k to ${evidence.kLimit?.maxK}, the register says ${entry.maxK}` };
  }
  return { ok: true, ...entry, band, winnerHash };
}

const SEARCH_DIRS = ['tools/device', 'apps/device/src', 'packages/adapters/src'];
const SKIP = /^(test-|_)|\.test\.js$|fact-register/;

function sources() {
  const out = [];
  const walk = dir => {
    let entries;
    try { entries = readdirSync(join(ROOT, dir)); } catch { return; }
    for (const name of entries) {
      const rel = join(dir, name);
      const full = join(ROOT, rel);
      if (statSync(full).isDirectory()) { walk(rel); continue; }
      if (!/\.(mjs|js)$/.test(name) || SKIP.test(name)) continue;
      out.push({ path: rel, text: readFileSync(full, 'utf8') });
    }
  };
  for (const dir of SEARCH_DIRS) walk(dir);
  return out;
}

export function build(files = sources()) {
  const facts = {};
  for (const [fact, spec] of Object.entries(FACTS)) {
    const producers = [];
    for (const file of files) {
      const evidence = spec.detect.filter(rule => rule.match.test(file.text))
        .map(rule => rule.evidence);
      if (evidence.length) producers.push({ file: file.path, evidence });
    }
    const used = [...new Set(producers.flatMap(p => p.evidence))]
      .sort((a, b) => spec.evidenceRanking.indexOf(a) - spec.evidenceRanking.indexOf(b));
    facts[fact] = {
      question: spec.question,
      authorityFixedByCharter: spec.authorityFixedByCharter === true,
      evidenceRanking: spec.evidenceRanking,
      strongestAvailable: used[0] ?? null,
      weakestInUse: used.at(-1) ?? null,
      producers: producers.sort((a, b) => a.file.localeCompare(b.file)),
    };
  }
  return { schema: SCHEMA, generatedFrom: SEARCH_DIRS, facts };
}

export function render(value) {
  const lines = [];
  for (const [fact, info] of Object.entries(value.facts)) {
    lines.push(`${fact} -- ${info.question}`);
    lines.push(`  ranking:  ${info.evidenceRanking.join(' > ')}`);
    lines.push(`  in use:   strongest ${info.strongestAvailable ?? 'none'}` +
      `, weakest ${info.weakestInUse ?? 'none'}`);
    for (const p of info.producers)
      lines.push(`    ${p.evidence.join(', ').padEnd(38)} ${p.file}`);
    lines.push('');
  }
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const aimIndex = process.argv.indexOf('--anchor-aim');
  if (aimIndex >= 0) {
    // `--anchor-aim WINNER_HASH`: print the registered aim (ms) and exit 0, or
    // print the refusal and exit 3, so a shell caller can fall back loudly.
    const found = anchorAimFor(process.argv[aimIndex + 1] ?? '');
    if (found.ok) { process.stdout.write(`${found.aimMs}\n`); process.exit(0); }
    process.stderr.write(`fact register: ${found.reason}\n`);
    process.exit(3);
  }
  const value = build();
  const index = process.argv.indexOf('--out');
  if (index >= 0 && process.argv[index + 1]) {
    writeFileSync(process.argv[index + 1], `${JSON.stringify(value, null, 2)}\n`);
  }
  process.stdout.write(process.argv.includes('--json')
    ? `${JSON.stringify(value, null, 2)}\n` : `${render(value)}\n`);
}
