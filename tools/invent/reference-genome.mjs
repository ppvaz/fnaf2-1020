// The reference reactive policy, expressed in the invention language.
//
// This is `tools/minus7/policy.mjs`'s `decide()` transcribed as a first-match
// rule list. It is the search's seed AND its bar: package 6b's expressiveness
// gate pins that this genome reproduces `decide()` exactly, so a search result
// is only interesting if it beats THIS.
//
// Its rule ORDER is load-bearing and is the thing package 7b's check-in
// indicted: rule 2 (`bbOpening -> HOLD_MASK`, 62 frames) sits above the Foxy
// check, so a Balloon Boy in the opening starves the hall flash and Foxy's D
// runs away. Reordering is therefore a first-class mutation, not a detail.
import * as C from '@fnaf2-1020/core/mechanics';
import { POLICY_LANG_SCHEMA, serialize, structuralShape, validateGenome }
  from './policy-lang.mjs';

const F = name => ({ t: 'field', name });
const K = v => ({ t: 'const', v });
const P = name => ({ t: 'param', name });
const cmp = (op, a, b) => ({ t: 'cmp', op, a, b });
const and = (...xs) => ({ t: 'and', xs });
const or = (...xs) => ({ t: 'or', xs });
const not = x => ({ t: 'not', x });
const eq = (name, v) => ({ t: 'eq', name, v });
const arith = (op, a, b) => ({ t: 'arith', op, a, b });

// projD = foxyD + floor((300 - (frame mod 300)) / FPS)
const toCheck = arith('-', K(300), arith('mod', F('frame'), K(300)));
const projD = arith('+', F('foxyD'), { t: 'arith', op: 'floor',
  a: arith('/', toCheck, K(C.FPS)) });
// boxFramesLeft < 260, with `winding` standing in for the Infinity branch.
const boxLow = and(not(F('winding')), cmp('<', arith('*', F('box'), P('drain')), K(260)));
const foxyDue = and(cmp('>=', projD, P('safeD')), not(eq('foxyLoc', 'parts')));
const needSweep = { t: 'anyStun', op: '<', a: K(120) };
const monitorUp = eq('monitor', 'up');

// `decide()` transcribed as a first-match rule list. Each nested branch of the
// original becomes its own rule with the enclosing guard conjoined.
const DECIDE_GENOME = validateGenome({
  schema: POLICY_LANG_SCHEMA,
  rules: [
    { when: and(or(cmp('>', { t: 'len', name: 'committed' }, K(0)), F('blackout')), F('maskOn')), then: 'HOLD_MASK' },
    { when: or(cmp('>', { t: 'len', name: 'committed' }, K(0)), F('blackout')), then: 'MASK_ON' },
    { when: F('bbOpening'), then: 'HOLD_MASK' },

    { when: and(foxyDue, F('maskOn')), then: 'MASK_OFF' },
    { when: and(foxyDue, monitorUp), then: 'LOWER' },
    { when: and(foxyDue, F('gfPresent')), then: 'FLICK' },
    { when: foxyDue, then: 'HALL_FLASH' },

    { when: and(boxLow, F('maskOn')), then: 'MASK_OFF' },
    { when: and(boxLow, not(monitorUp)), then: 'RAISE' },
    { when: boxLow, then: 'WIND_LONG' },

    { when: and(needSweep, F('maskOn')), then: 'MASK_OFF' },
    { when: and(needSweep, not(monitorUp)), then: 'RAISE' },
    { when: needSweep, then: 'SWEEP' },

    { when: and(F('gfPresent'), not(monitorUp), not(F('maskOn'))), then: 'FLICK' },

    { when: F('maskOn'), then: 'MASK_OFF' },
    { when: not(monitorUp), then: 'RAISE' },
  ],
  fallback: 'WIND',
});

export const REACTIVE_GENOME = DECIDE_GENOME;

/**
 * The policy shapes this repository already knows, by name. Counterpart of
 * `tools/device/policy-grammar.mjs`'s `knownPolicyShapes()`, which names the
 * shipped `MINIMAL` program on the observable surface.
 *
 * The serialized form travels with the shape because on THIS surface the known
 * family is the search's own seed: a candidate identical to it is the bar the
 * campaign planted, not a rediscovery, and only a variant differing purely in
 * its numeric thresholds is the closed knob space.
 */
export function knownGenomeShapes() {
  return new Map([[structuralShape(REACTIVE_GENOME),
    { family: 'minus7-reactive', serialized: serialize(REACTIVE_GENOME) }]]);
}

export { F, K, P, cmp, and, or, not, eq, arith };
