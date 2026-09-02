// Plan 05 package 8 -> package 7c: the wind-bearing seed population.
//
// WHY THESE EXIST. The first bb/bb+foxy frontiers were frozen offices: the
// monitor never rose, BB froze at his monitor-gated hop (g417), the hall
// pulses pinned Foxy's D, and the box -- the only thing that actually had to
// be paid -- was refused. Pedro's ruling: that is never viable, because there
// is ALWAYS a box to be wound; admissible only as an endgame cutoff. The
// measurement (box-anatomy) agreed: every win was the AI-0 ladder losing the
// race, with the box EMPTY at 6 AM.
//
// These seeds encode the posture the ruling demands: the monitor RISES for
// box duty. W1 is the hand-written checkpoint that the grammar can express
// the whole game at once --
//
//   wind sessions  RAISE -> WIND* -> LOWER, opened only outside the flash
//                  window and closed before it, so no session crosses a 5s
//                  Foxy roll instant (g337) with D > 0;
//   roll pinning   the everyN(300, 270, 60) HALL_FLASH window zeroes D at
//                  every roll instant, which is why zero locks were measured
//                  for the frozen office and most cycles here;
//   the BB game    BB's final hop needs the monitor UP, so every session end
//                  can find him at the opening: LOWER, then HOLD_MASK until
//                  his 5 fully-on ticks (or the 10%/s early leave, g292)
//                  repel him, then MASK_OFF and resume.
//
// Measured 2026-09-02, 60 seeds: bb 60/60 with ~175 real wind decisions per
// night (the frozen office managed 0.08% by refusing all of it); bb+foxy
// 25% -- a ~75x frontier movement -- with the residual named: Foxy locks
// that land mid-mask or mid-session, where the flash cannot run. The
// admission-gate numbers are the campaign's to produce; these seeds only
// guarantee the search STARTS on the winding side of the ruling.
//
// A regression gate (test-wind-seeds.mjs) pins that W1 actually winds -- the
// first draft of it silently did not, because press('cam:NN') is refused
// monitor-down (plant-model.js:330) and WIND alone never raises the monitor.
// If a future change to ACTIONS or the input gates breaks the RAISE->WIND
// chain, that gate fails instead of the search quietly regressing to a
// frozen office with extra steps.
import { POLICY_LANG_SCHEMA, validateGenome } from './policy-lang.mjs';

const f = name => ({ t: 'field', name });
const c = v => ({ t: 'const', v });
const cmp = (a, op, b) => ({ t: 'cmp', a, op, b });
const everyN = (period, phase, width) =>
  ({ t: 'everyN', a: c(period), b: c(phase), w: c(width) });
const and = (...xs) => ({ t: 'and', xs });
const not = x => ({ t: 'not', x });
const up = cmp(f('monitor'), '==', c('up'));
const down = cmp(f('monitor'), '==', c('down'));

export const WIND_SEED_W1 = validateGenome({
  schema: POLICY_LANG_SCHEMA,
  fallback: 'MASK_OFF',
  rules: [
    // --- the BB game: his opening entry is the price of every raise (g417)
    { when: and(f('bbOpening'), f('maskFullyOn')), then: 'HOLD_MASK' },
    { when: and(f('bbOpening'), up), then: 'LOWER' },
    { when: f('bbOpening'), then: 'HOLD_MASK' },
    { when: f('maskOn'), then: 'MASK_OFF' },
    // --- box duty as sessions that never cross a roll instant
    { when: and(up, cmp(f('box'), '>=', c(0.85))), then: 'LOWER' },
    { when: and(up, not(everyN(300, 210, 110))), then: 'WIND' },
    { when: up, then: 'LOWER' },
    { when: and(down, cmp(f('box'), '<', c(0.85)),
        not(everyN(300, 240, 90))), then: 'RAISE' },
    // --- Foxy roll pinning, the frozen office's one honest idea
    { when: f('blackout'), then: 'HALL_FLASH' },
    { when: everyN(300, 270, 60), then: 'HALL_FLASH' },
  ],
});

export const WIND_SEEDS = [WIND_SEED_W1];
