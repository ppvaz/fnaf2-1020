#!/usr/bin/env node
// Refuse an actuating module that decides a fact on weaker evidence than the
// repository already has a producer for.
//
// This is the gate for the class of miss that cost 2026-09-11 a night and a
// hypothesis. `intersection-state-gate.mjs` consumes the helper's native button
// downstroke scores for maskOn and says "a missing stroke score is a refusal,
// never a luma fallback". The executor answers the same question from the 20x9
// grid and falls back to exactly that luma refutation -- and every CORRECTED
// gate in the 2026-09-12T02-20 run decided on a frame whose screen the
// classifier could not even identify. Both files had been in the tree for
// weeks. Nothing compared them, because nothing was looking at FACTS.
//
// The rule is narrow on purpose. It fires only where the weakness can actuate:
// a producer under `apps/device/src`, the lane that presses buttons, using
// evidence ranked below the best the tree offers for that fact. Facts whose
// authority the charter fixes -- screen identity and the night origin, where
// the Python classifier is authoritative BECAUSE a detector that knows one way
// to be dead must not be what says you are alive -- are reported and never
// ranked.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, FACTS, ANCHOR_AIMS, ANCHOR_AIM_MIN_MARGIN_MS, anchorAimFor } from './fact-register.mjs';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '../..'));

const ACTUATING = 'apps/device/src';
let failed = 0;
const fail = message => { failed += 1; process.stdout.write(`  FAIL ${message}\n`); };

const register = build();
for (const [fact, info] of Object.entries(register.facts)) {
  const rank = FACTS[fact].evidenceRanking;
  const best = info.strongestAvailable;
  if (info.authorityFixedByCharter) {
    process.stdout.write(`${fact}: not ranked ` +
      `(${info.producers.length} producers)\n`);
    continue;
  }
  if (!best) { process.stdout.write(`${fact}: no producer found\n`); continue; }
  const bestAt = rank.indexOf(best);
  // The rule is "must USE the strongest available evidence", not "must contain
  // no weaker path". A guarded fallback is legitimate -- the executor keeps the
  // bright-grid refutation for helper builds that publish no stroke scores, and
  // that is the abort case a night would otherwise end on. What is refused is
  // an actuating module that decides the fact WITHOUT the strongest evidence
  // the tree offers.
  const offenders = info.producers.filter(p => p.file.startsWith(ACTUATING) &&
    !p.evidence.includes(best));
  process.stdout.write(`${fact}: best available ${best}; ` +
    `${info.producers.length} producers, ${offenders.length} actuating without it\n`);
  for (const p of offenders) {
    const weakest = [...p.evidence].sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0];
    fail(`${p.file} decides ${fact} on ${weakest} without ${best}, which is available in ` +
      `${info.producers.filter(q => q.evidence.includes(best)).map(q => q.file).join(', ')}. ` +
      `This is the lane that presses buttons; a weak read here does not report a ` +
      `mistake, it makes one.`);
  }
}

// The anchored release aims where the register says, and the register says
// where the evidence measured -- for the binding that is actually bound.
for (const [hash, entry] of Object.entries(ANCHOR_AIMS)) {
  const found = anchorAimFor(hash);
  if (!found.ok) { fail(`anchor aim ${hash}: ${found.reason}`); continue; }
  process.stdout.write(`anchor aim ${hash}: ${entry.aimMs} ms inside [${found.band.fromMs}, ${found.band.toMs}] ` +
    `with >= ${ANCHOR_AIM_MIN_MARGIN_MS} ms margin, ${JSON.parse(readFileSync(join(ROOT, entry.evidence), 'utf8')).confirmations3000.length} clean 3000-seed rows\n`);
}
// The newest Night 5 qualification names the binding a run will carry; that
// binding must have an aim, or the next run anchors on nothing (which
// night5-run.sh treats as "release the old way" -- loudly, but silently to
// the model).
// "Newest" is by the commit that last touched the file, not by name: two
// qualifications bound on the same day sort by name in the wrong order.
const committedAt = name => {
  try {
    return Number(execSync(`git log -1 --format=%ct -- ${JSON.stringify(join('docs/evidence', name))}`,
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) || 0;
  } catch { return 0; }
};
const qualifications = readdirSync(join(ROOT, 'docs/evidence'))
  .filter(name => /^qualification-.*night5.*\.json$/.test(name))
  .sort((a, b) => committedAt(a) - committedAt(b) || a.localeCompare(b));
if (qualifications.length) {
  const newest = qualifications.at(-1);
  const bound = JSON.parse(readFileSync(join(ROOT, 'docs/evidence', newest), 'utf8'));
  const hash = bound.policyHash ?? bound.winnerHash ?? bound.binding?.winnerHash;
  if (!hash) fail(`${newest} names no policy/winner hash`);
  else if (!ANCHOR_AIMS[hash])
    fail(`${newest} binds ${hash}, which has no anchor aim in ANCHOR_AIMS: derive its winning bands ` +
      '(docs/evidence/night5-anchor-aim-*.json) before a run anchors on a number priced for another policy');
  else process.stdout.write(`anchor aim: newest qualification ${newest} binds ${hash}, registered\n`);
}
if (!ANCHOR_AIMS['fnv1a-81b5e51c'] || anchorAimFor('fnv1a-00000000').ok)
  fail('anchorAimFor must refuse an unknown binding');

if (failed) {
  process.stdout.write(`\nfact register: ${failed} finding(s).\n`);
  process.exit(1);
}
process.stdout.write('fact register: every actuating consumer decides on the strongest evidence ' +
  'the tree provides for that fact\n');
