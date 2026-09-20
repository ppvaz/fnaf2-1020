// ---------------------------------------------------------------------------
// FNaF 3's night, from `03-04-Office.txt` (1230 groups, 0 unclassified).
//
// Regenerate with
//   tools/dump/nightmap.py --game fnaf3 --table --clock --rolls
//
// FNaF 3 has the simplest difficulty table in the series and the most
// interesting clock. One counter, `AI`, drives Springtrap *and* every
// phantom; the night is on a wall clock whose hour is shorter on Night 1 than
// on every later night; and two further per-night knobs -- which phantoms are
// armed, and how long you may look at one -- are not in any public account of
// the game.
// ---------------------------------------------------------------------------

export const GAME = 'fnaf3';

// The clock [SOURCED: g642 advances the hour every 40000 ms on Night 1 and
// g644 every 60000 ms on Nights 2+, each halved by g643/g645 under
// `fast nights on?`; g646/g647 copy `hour` into the displayed `time of night`
// (12 when hour is 0); g648 leaves the frame when **`time of night`** reads 6].
//
// Two hour counters, not one. `hour` advances; `time of night` is the display
// and is what the win tests. A reader that looks for the win on `hour` finds
// nothing -- which is why the extractor reports the hour it fires at rather
// than only where it lands.
//
// Night 1 is therefore 6 * 40 s = 240 s and every later night 6 * 60 s = 360 s.
// The 240 s is independently corroborated: the 2026-09-20 handset run held the
// office ~240 s and banked the night.
export const CLOCK = {
  kind: 'wallclock',
  hourMs: (night) => (night <= 1 ? 40000 : 60000),      // g642, g644
  fastHourMs: (night) => (night <= 1 ? 20000 : 30000),  // g643, g645
  wrapAt: null,                                          // no wrap group exists
  winHour: 6,                                            // g648, on `time of night`
  displayCounter: 'time of night',                       // g646, g647
  source: 'g642,g643,g644,g645,g646,g647,g648',
};

// The whole difficulty table [SOURCED: g649-g654]. One counter.
//
//   night 1   AI = night - 1 = 0
//   nights 2-5 AI = night
//   night 6+  AI = 7
//
// Night 1 at AI 0 is why it can be cleared with no input at all: Springtrap's
// threshold is `(10 - 0 - 0) + Random(15) - total turns`, and every phantom
// roll is `Random(bound) + 1 <= 0`, which never passes.
export const ROWS = [
  { group: 649, night: { op: '<', value: 2 }, set: { ai: 0 }, note: 'AI = night - 1' },
  { group: 650, night: { op: '=', value: 2 }, set: { ai: 2 } },
  { group: 651, night: { op: '=', value: 3 }, set: { ai: 3 } },
  { group: 652, night: { op: '=', value: 4 }, set: { ai: 4 } },
  { group: 653, night: { op: '=', value: 5 }, set: { ai: 5 } },
  { group: 654, night: { op: '>=', value: 6 }, set: { ai: 7 } },

  // Which phantoms are armed, per night [SOURCED: g694, g695, g696]. Each is
  // `Once` at night start and writes 1s, so the rows accumulate and the
  // highest matching night wins.
  { group: 694, night: { op: '>=', value: 2 }, set: { bb: 1, mangle: 1 } },
  { group: 695, night: { op: '>=', value: 3 }, set: { bb: 1, mangle: 1, golden: 1, chica: 1 } },
  { group: 696, night: { op: '>=', value: 4 }, set: { bb: 1, mangle: 1, golden: 1, chica: 1, puppet: 1 } },

  // The phantom exposure fuse [SOURCED: g777-g782]. `time limit` is how long
  // a phantom may be looked at before it fires -- g702 (Phantom Freddy's
  // walk, against `time limit * 3`), g709 (BB's peek), g719 (Mangle), g720
  // (the phantom head) and g746 (Phantom Chica) all test their own exposure
  // counter against it. It falls 100 -> 50 across the six nights, so the same
  // glance is twice as dangerous on Night 6 as on Night 1.
  //
  // No public account of FNaF 3 states this. It is a per-night difficulty
  // knob with no counterpart in the AI number.
  { group: 777, night: { op: '=', value: 1 }, set: { timeLimit: 100 } },
  { group: 778, night: { op: '=', value: 2 }, set: { timeLimit: 90 } },
  { group: 779, night: { op: '=', value: 3 }, set: { timeLimit: 80 } },
  { group: 780, night: { op: '=', value: 4 }, set: { timeLimit: 70 } },
  { group: 781, night: { op: '=', value: 5 }, set: { timeLimit: 60 } },
  { group: 782, night: { op: '>=', value: 6 }, set: { timeLimit: 50 } },
];

export const CAP = null;  // no cap group; see fnaf1.js CAP for the detector check

// Springtrap [SOURCED: g221 adds 1 to `move counter` every 1000 ms, g222
// adds 2 instead while `hyper on?` is set; g223 fires when
// `move counter > (10 - AI - aggresive?) + Random(15) - total turns`, zeroes
// the counter and raises `turn`; g224 draws
// `action selected = Random(3) + aggresive? + 1` and clears `turn`; g225
// treats action 1 as stay and increments `total turns`; g226+ treat 2, 3 and
// 4 as destination branches and zero `total turns`].
//
// Two consequences the public formula does not carry:
//
//   - `Random(15)` sits **inside** the comparison, so it is drawn every
//     second whether or not he moves. That is one unconditional draw per
//     second, and it is what makes stream position knowable here.
//   - `Random(3)` is 0..2, so at `aggresive? = 0` the branch set is {1,2,3}
//     and at 1 it is {2,3,4}. Every vent entrance is on branch 4, so
//     aggression is not "he arrives sooner" -- it is the switch that makes
//     the vent routes exist.
export const SPRINGTRAP = {
  counterMs: 1000,                       // g221
  counterStep: 1,                        // g221
  hyperStep: 2,                          // g222
  threshold: { base: 10, minusAi: true, minusAggressive: true, plusRandom: 15, minusTotalTurns: true },
  actionDraw: { bound: 3, plusAggressive: true, plusOne: true },  // g224
  stayAction: 1,                         // g225
  aggressionResetMs: 15000,              // g220
  source: 'g220,g221,g222,g223,g224,g225,g226',
};

// The phantoms [SOURCED: g668 BB, g670 Mangle, g672 Puppet, g674 Chica,
// g676 Golden Freddy]. Each rolls `Random(bound) + 1 <= AI` on its own timer,
// and every one is gated on `time of night <> 12` -- so **no phantom can
// appear during the first in-game hour**, on any night. That is a free hour
// at the start of every night and no public strategy mentions it.
//
// Each is also gated on its own trigger: BB on the office `BB` flag, the
// others on a specific camera not being the one being viewed.
export const PHANTOMS = {
  bb: { group: 668, everyMs: 20000, bound: 10, gates: ['BB = 1', 'viewing <= 1', 'time of night <> 12'] },
  mangle: { group: 670, everyMs: 20000, bound: 7, gates: ['mangle = 1', 'cam 04 not selected', 'time of night <> 12'] },
  puppet: { group: 672, everyMs: 20000, bound: 10, gates: ['puppet = 1', 'cam 08 not selected', 'time of night <> 12'] },
  chica: { group: 674, everyMs: 20000, bound: 10, gates: ['chica = 1', 'cam 07 not selected', 'time of night <> 12'] },
  golden: { group: 676, everyMs: 60000, bound: 12, gates: ['golden freddy = 1', 'time of night <> 12'] },
};

// Mangle's bound is 7 where the others are 10, so at a given AI she is the
// likeliest phantom by a wide margin: AI 5 gives her 5/7 against 5/10.
export const ROLLS = PHANTOMS;

// The vent topology [SOURCED: the 73 movement edges, each "at X with
// `action selected` = N, move to Y"; every vent entrance is on branch 4].
//
// Vents 14 and 15 bypass the four-stage attack chain and kill outright, which
// gives a sealing priority no public strategy states: 14 and 15 first, then
// 11 and 12, then 13. They are entered from cam 10 and cam 02.
export const VENTS = {
  13: { from: 5, returnsTo: 5, advancesTo: 'attack stage 1', stepsFromDeath: 4 },
  11: { from: 9, returnsTo: 9, advancesTo: 'attack stage 3', stepsFromDeath: 2 },
  12: { from: 7, returnsTo: 7, advancesTo: 'attack stage 3', stepsFromDeath: 2 },
  14: { from: 10, returnsTo: 10, advancesTo: 'GOT YOU 2', stepsFromDeath: 0 },
  15: { from: 2, returnsTo: 2, advancesTo: 'GOT YOU 2', stepsFromDeath: 0 },
};

// The systems economy [SOURCED: ventilation errors above `1000 - (AI * 100)`;
// audio drains `AI` per use; one `<= -10` threshold serves audio, camera and
// ventilation alike, so one scalar detector covers all three].
//
// The seal is a timed, cancellable commit [SOURCED: g572 arms it and sets the
// charge to `50 + Random(50)` frames; g582 decrements it each tick; g583
// commits at 0; g584 and g585 both zero it if the vent map closes or the
// monitor drops]. `what vent is closed` is a single counter, so **only one
// vent is sealed at a time** and a second seal replaces the first.
export const SYSTEMS = {
  ventilationErrorAbove: (ai) => 1000 - ai * 100,
  audioDrainPerUse: (ai) => ai,
  errorThreshold: -10,
  seal: { group: 572, chargeMin: 50, chargeBound: 50, cancelsOn: ['vent map closed', 'monitor down'], concurrent: 1 },
  reboot: { single: { everyMs: 1000, step: { min: 1, bound: 2 }, completeAt: 10 },
            all: { everyMs: 2000, step: { min: 1, bound: 2 }, completeAt: 10 } },
  source: 'g425,g426,g572,g582,g583,g584,g585',
};

export const MODEL = {
  game: GAME,
  clock: CLOCK,
  rows: ROWS,
  cap: CAP,
  initialLevels: { ai: 0, bb: 0, mangle: 0, golden: 0, chica: 0, puppet: 0, timeLimit: 0 },
  rolls: ROLLS,
};
