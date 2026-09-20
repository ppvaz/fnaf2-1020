// ---------------------------------------------------------------------------
// FNaF 4's night, from `03-04-level.txt` (937 groups, 0 unclassified).
//
// Regenerate with
//   tools/dump/nightmap.py --game fnaf4 --table --clock --rolls
//
// The night counter here is `Night`, capitalised, where FNaF 1 and 3 use
// `night number` and FNaF 2 uses `night`. A lowercase-only sweep finds
// nothing in this sheet and is indistinguishable from the mechanic being
// absent -- which is how the table below was nearly reported as missing.
// ---------------------------------------------------------------------------

export const GAME = 'fnaf4';

// The clock [SOURCED: g568 advances the hour every 60000 ms, g569 every
// 30000 ms with the fast-nights checkmark set; g570 wraps above 12; g573
// leaves the frame at hour 6]. Six hours of 60 s is a 360 s night.
//
// The hour has no start-of-frame initialiser, so it begins at the counter's
// default of 0, which reads 12 AM. Two rewards move it before the night
// begins: g596 sets it to **2** when the Plushtrap minigame was won and
// `Night < 6`, and g597 sets it to **1** after the BB minigame. A route timed
// from night start is wrong by two in-game hours when the Plushtrap reward is
// set, and nothing on the night screen says so.
export const CLOCK = {
  kind: 'wallclock',
  hourMs: 60000,        // g568
  fastHourMs: 30000,    // g569
  wrapAt: 12,           // g570
  winHour: 6,           // g573
  source: 'g568,g569,g570,g573',
};

export const CHARACTERS = ['freddy', 'bonnie', 'chica', 'foxy', 'fredbear'];

// Rewards that shorten the night before it starts [SOURCED: g596, g597].
export const REWARDS = {
  plushtrap: { group: 596, setsHour: 2, requires: 'Night < 6' },
  balloonBoy: { group: 597, setsHour: 1 },
};

// Difficulty by night [SOURCED: g581-g588 for Nights 1-4, g228 for Night 5's
// Fredbear, g598/g599 for Night 6, g600 for the Nightmare night].
//
// Two shapes worth naming, because they are not the same mechanism:
//
//   - Nights 1-4 **escalate mid-night**: a second row at 3 AM (2 and 3 AM on
//     Night 1) `add`s to the levels the first row set. Levels accumulate.
//   - Night 6 **switches antagonist**: at 4 AM every one of the four goes to
//     0 and Fredbear goes to 15. That is a set, not an add, and it means the
//     second half of Night 6 is a different game from the first.
//
// Night 5 has no row for Bonnie, Chica, Foxy or Freddy at all. Only g228
// fires, setting Fredbear to 12 -- so Night 5 is a Fredbear-only night, and
// the four regular rolls can never pass on it.
export const ROWS = [
  { group: 581, night: { op: '=', value: 1 }, hour: 2, set: { bonnie: 1, chica: 1, freddy: 1 } },
  { group: 582, night: { op: '=', value: 1 }, hour: 3, add: { bonnie: 2, chica: 1, freddy: 1 } },

  { group: 583, night: { op: '=', value: 2 }, set: { bonnie: 5, chica: 5, freddy: 2, foxy: 1 } },
  { group: 584, night: { op: '=', value: 2 }, hour: 3, add: { freddy: 1, bonnie: 2, chica: 2, foxy: 3 } },

  { group: 585, night: { op: '=', value: 3 }, set: { foxy: 10, freddy: 3, bonnie: 7, chica: 7 } },
  { group: 586, night: { op: '=', value: 3 }, hour: 3, add: { bonnie: 3, chica: 3 } },

  { group: 587, night: { op: '=', value: 4 }, set: { freddy: 4, bonnie: 10, foxy: 5, chica: 10 } },
  { group: 588, night: { op: '=', value: 4 }, hour: 3, add: { chica: 2, bonnie: 2, foxy: 5 } },

  { group: 228, night: { op: '=', value: 5 }, set: { fredbear: 12 } },

  { group: 598, night: { op: '=', value: 6 }, set: { bonnie: 12, foxy: 10, freddy: 5, chica: 12 } },
  { group: 599, night: { op: '=', value: 6 }, hour: 4, set: { bonnie: 0, chica: 0, foxy: 0, freddy: 0, fredbear: 15 } },

  // g600 is gated on `shadow = 1`, not on a night comparison -- it is the
  // Nightmare night, and it *sets* `Night` to 7 itself. Recorded as night 7
  // so the table can be asked about it, with the real trigger named.
  { group: 600, night: { op: '=', value: 7 }, set: { bonnie: 15, fredbear: 0, chica: 15, foxy: 15, freddy: 6 }, trigger: 'shadow = 1' },
];

export const CAP = null;  // no cap group; see fnaf1.js CAP for the detector check

// The rolls [SOURCED: g236 Foxy, g284 Bonnie, g285 Chica, g286/g287
// Fredbear].
//
// **The bounds are not uniform.** Foxy rolls against `Random(10)` while
// Bonnie, Chica and Fredbear roll against `Random(20)`, so the same number on
// two dials is not the same threat: Foxy at 10 passes every roll, Bonnie at
// 10 passes half. Night 3 sets Foxy to exactly 10, which under this bound is
// a guaranteed advance every 5 s.
//
// Bonnie and Chica are each suspended outright by two of the player's own
// states: holding that side's door, and listening at it. No observation is
// required for either -- the gate is on the control, not on where the
// character is. Fredbear's timer halves from 3000 ms to 2000 ms once
// `shadow` is set.
export const ROLLS = {
  foxy: { group: 236, everyMs: 5000, bound: 10, gates: [] },
  bonnie: {
    group: 284, everyMs: 5000, bound: 20,
    gates: ['listening mode <> 1', 'in closet AV5 <> 2', 'left door shut = 0'],
  },
  chica: {
    group: 285, everyMs: 5000, bound: 20,
    gates: ['listening mode <> 2', 'in closet AV5 <> 2', 'right door shut = 0'],
  },
  fredbear: {
    group: 286, everyMs: 3000, bound: 20,
    shadowGroup: 287, shadowEveryMs: 2000,
    gates: ['not in closet', 'not on bed', 'not left hall far', 'not right hall far'],
  },
};

// Freddy is a meter, not a roll [SOURCED: g397 adds `Freddy AI` every 4000 ms
// **while the bed is not being viewed**; g398 replaces that with a flat +5
// every 2000 ms under the MadFreddy challenge; g593 adds a further +1 every
// 200 ms while `Fredbear` AV13 >= 30, the bed is unwatched and `Night > 1`;
// g401 drains 1 every 50 ms while the bed *is* viewed; g399 floors it at 0;
// g427 and g428 kill at **>= 60** while the player is at the bed
// (`follow = 43`) -- immediately if viewing it, otherwise on a 3000 ms tick].
//
// The drain is 20/s against a fill of `AI/4` per second, so it is 16x the
// fill at AI 5. A short look at the bed clears a lot of meter; the cost is
// that looking is also the only state in which the >= 60 kill is instant.
//
// g593's accelerant has no counterpart in the public description of Freddles
// and is gated on Fredbear's own timer, which couples two characters that are
// usually described as independent.
export const FREDDY = {
  fill: { group: 397, everyMs: 4000, amount: 'Freddy AI', whileViewingBed: false },
  madChallenge: { group: 398, everyMs: 2000, amount: 5 },
  accelerant: { group: 593, everyMs: 200, amount: 1, requires: 'Fredbear AV13 >= 30, bed unwatched, Night > 1' },
  drain: { group: 401, everyMs: 50, amount: 1, whileViewingBed: true },
  floor: { group: 399, value: 0 },
  killAt: 60,
  killGroups: 'g427 (viewing bed, instant), g428 (at bed, every 3000 ms)',
  dangerBands: [10, 20, 30, 50, 60, 80],
  source: 'g397,g398,g399,g401,g427,g428,g593',
};

// The forced-door trick [SOURCED: g341 teleports Bonnie to `left hall near`
// when a door is closed while he is elsewhere; g342 pushes him back on a
// 3000 ms hold].
//
// The public strategy recommends holding ~5 s, which over-holds by about 2 s
// per visit against the source's 3000 ms.
export const FORCED_DOOR = { teleport: 341, pushBackMs: 3000, pushBackGroup: 342 };

// Per-night forced-appearance draws [SOURCED: g626, g627, g628 -- Nights 2, 3
// and 4 each draw `force Bonnie = 2 + Random(4)` and
// `force Chica = 3 + Random(3)` at night start].
export const FORCED_APPEARANCES = {
  nights: [2, 3, 4],
  bonnie: { min: 2, max: 5 },
  chica: { min: 3, max: 5 },
  source: 'g626,g627,g628',
};

export const MODEL = {
  game: GAME,
  clock: CLOCK,
  rows: ROWS,
  cap: CAP,
  initialLevels: { freddy: 0, bonnie: 0, chica: 0, foxy: 0, fredbear: 0 },
  rolls: ROLLS,
};
