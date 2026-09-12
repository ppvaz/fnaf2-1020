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
import { build, FACTS } from './fact-register.mjs';

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

if (failed) {
  process.stdout.write(`\nfact register: ${failed} actuating consumer(s) on weaker evidence than ` +
    'the tree already provides.\n');
  process.exit(1);
}
process.stdout.write('fact register: every actuating consumer decides on the strongest evidence ' +
  'the tree provides for that fact\n');
