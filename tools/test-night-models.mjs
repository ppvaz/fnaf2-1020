#!/usr/bin/env node
// Check the four games' night models against figures derived independently
// of them.
//
// A table transcribed from a dump is only as good as what can contradict it,
// and "it parses" contradicts nothing. Every assertion below is anchored to
// something that was not read off the same table:
//
//   - FNaF 1's difficulty table and its 8:55 night are published community
//     figures, measured from the game years before this repository existed.
//   - FNaF 2's rows must round-trip against `config.js`'s `AI_BY_NIGHT`,
//     which the live route and every graded bundle are computed against.
//   - FNaF 3's Night 1 length was measured on the handset (~240 s, 2026-09-20)
//     before this model was written.
//   - The roll arithmetic is checked against the engine's own semantics
//     (`Random(N)` yields 0..N-1), not against a table.
//
// Structural checks cover the rest: every row cites the group it came from,
// and no clock is missing its source.
//
//   node tools/test-night-models.mjs

import {
  GAMES, GAME_IDS, PACKAGES, scheduleFor, peakFor, canActIn, nightsOf,
  rollChance, rollsInHour, opportunities, modelFor, fnaf1, fnaf2, fnaf3, fnaf4,
} from '../packages/core/src/mechanics/games/index.js';
import { AI_BY_NIGHT, aiCap } from '../packages/core/src/mechanics/config.js';

const failures = [];
let checks = 0;

function ok(what, condition) {
  checks += 1;
  if (!condition) failures.push(what);
}

function eq(what, actual, expected) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${what}: expected ${e}, got ${a}`);
}

// --- the roll, against the engine's semantics -------------------------------
//
// `Random(N)` is 0..N-1, so `Random(N) + 1 <= L` passes on L of N values.
eq('rollChance(20, 0) -- an unarmed character never rolls', rollChance(20, 0), 0);
eq('rollChance(20, 20) -- a full dial always passes', rollChance(20, 20), 1);
eq('rollChance(20, 10)', rollChance(20, 10), 0.5);
eq('rollChance clamps above its bound', rollChance(10, 15), 1);
eq('rollChance(20, 1) is one in twenty', rollChance(20, 1), 0.05);

// FNaF 4's bounds are not uniform, and that is the point of carrying them.
eq('fnaf4 Foxy at 10 is certain (bound 10)', rollChance(fnaf4.ROLLS.foxy.bound, 10), 1);
eq('fnaf4 Bonnie at 10 is even (bound 20)', rollChance(fnaf4.ROLLS.bonnie.bound, 10), 0.5);

// --- night lengths, against independent measurements ------------------------
//
// FNaF 1: g399 resets the minute counter to 1, not 0, so hour 0 is 90 ticks
// and every later hour 89 -- 90 + 5*89 = 535 s. The community publishes 8:55.
eq('fnaf1 night is 8:55', scheduleFor('fnaf1', 1).lengthMs, 535_000);
eq('fnaf1 hour 0 is 90 s', scheduleFor('fnaf1', 1).hours[0].durationMs, 90_000);
eq('fnaf1 hour 1 is 89 s', scheduleFor('fnaf1', 1).hours[1].durationMs, 89_000);

// FNaF 2: g630 zeroes the accumulator, so there is no first-hour seam.
eq('fnaf2 night is 7:00', scheduleFor('fnaf2', 1).lengthMs, 420_000);
eq('fnaf2 hour 0 is 70 s', scheduleFor('fnaf2', 1).hours[0].durationMs, 70_000);
eq('fnaf2 hour 1 is 70 s too -- no seam', scheduleFor('fnaf2', 1).hours[1].durationMs, 70_000);

// FNaF 3: Night 1 is measured on the handset at ~240 s; later nights 360 s.
eq('fnaf3 night 1 is 240 s (handset-corroborated)', scheduleFor('fnaf3', 1).lengthMs, 240_000);
eq('fnaf3 night 2 is 360 s', scheduleFor('fnaf3', 2).lengthMs, 360_000);
ok('fnaf3 is the only game whose hour depends on the night',
  GAME_IDS.filter((g) => scheduleFor(g, 1).lengthMs !== scheduleFor(g, 2).lengthMs).join() === 'fnaf3');

eq('fnaf4 night is 360 s', scheduleFor('fnaf4', 1).lengthMs, 360_000);

// Fast nights halve every game's night. FNaF 1 and 2 halve the tick, FNaF 3
// and 4 halve the hour; both land in the same place.
for (const game of GAME_IDS) {
  const normal = scheduleFor(game, 2).lengthMs;
  const fast = scheduleFor(game, 2, { fastNights: true }).lengthMs;
  eq(`${game} fast nights halve the night`, fast, normal / 2);
}

// --- FNaF 1 against the published table -------------------------------------
//
// These six rows are the community's published FNaF 1 AI table. They were
// measured from the game independently of this dump, so agreement is a real
// cross-check on the reader, the XOR constant and the transcription at once.
const PUBLISHED_FNAF1 = {
  1: { freddy: 0, bonnie: 0, chica: 0, foxy: 0 },
  2: { freddy: 0, bonnie: 3, chica: 1, foxy: 1 },
  3: { freddy: 1, bonnie: 0, chica: 5, foxy: 2 },
  // Night 4's Freddy is 1 or 2 -- `1 + Random(2)`, drawn at night start.
  4: { freddy: { min: 1, max: 2 }, bonnie: 2, chica: 4, foxy: 6 },
  5: { freddy: 3, bonnie: 5, chica: 7, foxy: 5 },
  6: { freddy: 4, bonnie: 10, chica: 12, foxy: 6 },
};
for (const [night, expected] of Object.entries(PUBLISHED_FNAF1)) {
  const atStart = scheduleFor('fnaf1', Number(night)).hours[0].levels;
  for (const [id, level] of Object.entries(expected)) {
    eq(`fnaf1 night ${night} ${id} matches the published table`, atStart[id], level);
  }
}

// The published movement periods, to two decimals: 4.97 / 4.98 / 3.02 / 5.01 s.
eq('fnaf1 bonnie period', fnaf1.ROLLS.bonnie.everyMs, 4970);
eq('fnaf1 chica period', fnaf1.ROLLS.chica.everyMs, 4980);
eq('fnaf1 freddy period', fnaf1.ROLLS.freddy.everyMs, 3020);
eq('fnaf1 foxy period', fnaf1.ROLLS.foxy.everyMs, 5010);

// The hourly escalation carries no night comparison in the sheet, so it must
// apply on every night -- including Night 1, where it raises Bonnie off zero.
eq('fnaf1 night 1 Bonnie is 0 at midnight', scheduleFor('fnaf1', 1).hours[0].levels.bonnie, 0);
eq('fnaf1 night 1 Bonnie is 1 by 2 AM', scheduleFor('fnaf1', 1).hours[2].levels.bonnie, 1);
eq('fnaf1 night 1 Bonnie is 3 by 4 AM', scheduleFor('fnaf1', 1).hours[4].levels.bonnie, 3);

// Night 6's Chica reaches 14 by 4 AM, which is above every FNaF 2 cap and is
// allowed here because FNaF 1 has no cap group.
eq('fnaf1 night 6 Chica peaks at 14', peakFor('fnaf1', 6, 'chica'), 14);
eq('fnaf1 has no cap', fnaf1.CAP, null);
eq('fnaf3 has no cap', fnaf3.CAP, null);
eq('fnaf4 has no cap', fnaf4.CAP, null);
ok('fnaf2 is the one game that caps', fnaf2.CAP === aiCap);

// --- FNaF 2 round-trips against config.js -----------------------------------
//
// The shared shape must not quietly become a second source of truth for the
// game this repository actually runs.
for (const [night, rows] of Object.entries(AI_BY_NIGHT)) {
  const mine = fnaf2.ROWS.filter((row) => row.night.value === Number(night));
  eq(`fnaf2 night ${night} row count`, mine.length, rows.length);
  rows.forEach((row, index) => {
    eq(`fnaf2 night ${night} row ${index} hour`, mine[index].hour, row.hour);
    eq(`fnaf2 night ${night} row ${index} set`, mine[index].set, row.set);
  });
}
// And the cap must still bite through the shared applier.
eq('fnaf2 night 7 Foxy is capped at 17', scheduleFor('fnaf2', 7).hours[0].levels.foxy, 17);
eq('fnaf2 night 7 Golden Freddy is capped at 10', scheduleFor('fnaf2', 7).hours[0].levels.golden, 10);
eq('fnaf2 night 7 Toy Bonnie is capped at 15', scheduleFor('fnaf2', 7).hours[0].levels.toybonnie, 15);

// --- what each night arms, and what it does not -----------------------------
//
// "This character cannot act tonight" is a statement the table makes. It is
// the positive control every policy family is scored against.
ok('fnaf1 night 1 arms nobody at midnight',
  ['freddy', 'bonnie', 'chica', 'foxy'].every((id) => !canActIn('fnaf1', 1, id) ||
    scheduleFor('fnaf1', 1).hours[0].levels[id] === 0));

// FNaF 3 Night 1 is AI 0 with no phantoms armed -- which is why it was
// cleared on the handset with zero input on 2026-09-20.
eq('fnaf3 night 1 AI is 0', scheduleFor('fnaf3', 1).hours[0].levels.ai, 0);
for (const phantom of ['bb', 'mangle', 'golden', 'chica', 'puppet']) {
  eq(`fnaf3 night 1 does not arm ${phantom}`, scheduleFor('fnaf3', 1).hours[6].levels[phantom], 0);
}
eq('fnaf3 night 2 arms BB and Mangle only',
  ['bb', 'mangle', 'golden', 'chica', 'puppet'].filter((id) => canActIn('fnaf3', 2, id)),
  ['bb', 'mangle']);
eq('fnaf3 night 4 arms all five',
  ['bb', 'mangle', 'golden', 'chica', 'puppet'].filter((id) => canActIn('fnaf3', 4, id)),
  ['bb', 'mangle', 'golden', 'chica', 'puppet']);

// The phantom exposure fuse halves across the six nights.
eq('fnaf3 night 1 time limit', scheduleFor('fnaf3', 1).hours[0].levels.timeLimit, 100);
eq('fnaf3 night 6 time limit', scheduleFor('fnaf3', 6).hours[0].levels.timeLimit, 50);

// FNaF 4 Night 5 names only Fredbear, so the other four cannot act at all.
eq('fnaf4 night 5 arms only Fredbear',
  ['freddy', 'bonnie', 'chica', 'foxy', 'fredbear'].filter((id) => canActIn('fnaf4', 5, id)),
  ['fredbear']);
// Night 6 switches antagonist at 4 AM: a `set` to 0, not a decay.
eq('fnaf4 night 6 Bonnie is 12 at midnight', scheduleFor('fnaf4', 6).hours[0].levels.bonnie, 12);
eq('fnaf4 night 6 Bonnie is 0 at 4 AM', scheduleFor('fnaf4', 6).hours[4].levels.bonnie, 0);
eq('fnaf4 night 6 Fredbear is 15 at 4 AM', scheduleFor('fnaf4', 6).hours[4].levels.fredbear, 15);
// Nights 1-4 escalate by adding, so a mid-night level exceeds its opening one.
eq('fnaf4 night 2 Foxy opens at 1', scheduleFor('fnaf4', 2).hours[0].levels.foxy, 1);
eq('fnaf4 night 2 Foxy is 4 from 3 AM', scheduleFor('fnaf4', 2).hours[3].levels.foxy, 4);

// --- roll opportunities, the cross-game comparable --------------------------
//
// A night is a count of chances. FNaF 1's Freddy gets the most opportunities
// of any character in the series because his 3020 ms period is the shortest.
const f1 = opportunities('fnaf1', 6);
eq('fnaf1 hour 0 gives Freddy 29 chances', f1[0].rolls.freddy.opportunities,
  Math.floor(90_000 / 3020));
ok('fnaf1 night 6 Freddy expects at least 5 moves an hour',
  f1[0].rolls.freddy.expected >= 5);
// FNaF 4 Night 3 Foxy is the extreme case: bound 10, level 10.
eq('fnaf4 night 3 Foxy passes every roll', opportunities('fnaf4', 3)[0].rolls.foxy.chance, 1);
eq('rollsInHour counts whole periods only',
  rollsInHour({ everyMs: 4000 }, 10_000, 0).opportunities, 2);

// --- structure: nothing may be uncited --------------------------------------
for (const game of GAME_IDS) {
  const model = modelFor(game);
  ok(`${game} clock cites its groups`, typeof model.clock.source === 'string'
    && model.clock.source.length > 0);
  ok(`${game} declares a win hour`, model.clock.winHour === 6);
  ok(`${game} knows its package`, typeof PACKAGES[game] === 'string');
  for (const [index, row] of model.rows.entries()) {
    // FNaF 2's rows are translated from config.js, which cites its groups in
    // comments beside the table rather than per row; every other game's rows
    // must name the group they were read from.
    if (game === 'fnaf2') continue;
    ok(`${game} row ${index} cites a group`, Number.isInteger(row.group));
    ok(`${game} row ${index} has a night comparison`,
      row.night && typeof row.night.op === 'string');
  }
  for (const [id, roll] of Object.entries(model.rolls)) {
    ok(`${game}.${id} roll cites a group`, Number.isInteger(roll.group));
    ok(`${game}.${id} roll has a period`, roll.everyMs > 0);
    ok(`${game}.${id} roll has a bound`, roll.bound > 0);
  }
}

eq('every game is registered', GAME_IDS, ['fnaf1', 'fnaf2', 'fnaf3', 'fnaf4']);
eq('fnaf3 is the only six-night game', GAME_IDS.filter((g) => nightsOf(g) === 6), ['fnaf3']);

// --- report -----------------------------------------------------------------
if (failures.length) {
  console.error(`night models: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`night models: all ${checks} checks passed`);
