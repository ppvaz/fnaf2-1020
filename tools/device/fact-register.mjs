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
  // native read may only SHARPEN the timestamp inside the bracket the authority
  // established (adb-device-local-executor.js, origin.refined).
  nightOrigin: {
    authorityFixedByCharter: true,
    question: 'when did the night actually start?',
    evidenceRanking: ['native-screen', 'python-classifier', 'intro-handoff'],
    detect: [
      { evidence: 'native-screen', match: /NATIVE_NIGHT_SCREEN|nativeNightAt/ },
      { evidence: 'python-classifier', match: /'lifecycle'|lifecycle\(bridge/ },
      { evidence: 'intro-handoff', match: /intro-handoff/ },
    ],
  },
});

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
  const value = build();
  const index = process.argv.indexOf('--out');
  if (index >= 0 && process.argv[index + 1]) {
    writeFileSync(process.argv[index + 1], `${JSON.stringify(value, null, 2)}\n`);
  }
  process.stdout.write(process.argv.includes('--json')
    ? `${JSON.stringify(value, null, 2)}\n` : `${render(value)}\n`);
}
