// Plan 05 package 6c on the PRIVILEGED surface: classify a genome against the
// repository's one register of closed policy families.
//
// WHY THIS FILE EXISTS. Until now there were two lists. `KNOWN_FAMILIES` in
// `policy-lang.mjs` asserted two closures in prose; `tools/device/closed-
// families.json` recorded three, cited where each negative is RECORDED, and
// carried an explicit `closure: recorded-negative`. The privileged search was
// therefore pruning against less than the repository knows -- it had neither
// `timing-only-mutation` (Plan 16's swept knobs) nor `audio-anchored-branch`
// (Plan 08, closed on latency). The registry is now the single list, and this
// module is its privileged-surface interpreter: the same RULE NAMES applied to
// a rule-list genome, exactly as `tools/device/closed-families.mjs` applies
// them to an observation-language program. Two surfaces, two interpreters, one
// list. Adding a family to the registry now fails BOTH surfaces until both
// implement it, which is the property the two lists could not have.
//
// The registry is read as data rather than imported through
// `tools/device/closed-families.mjs`, which would drag the device observation
// grammar into the privileged language for nothing. What is shared is the
// register of closures, not the surface that reads it.
//
// A match is a classification, not an error. A campaign may admit one as a
// DECLARED control -- the empty genome is the search's negative floor and the
// reactive genome is its bar -- but it may not admit one by accident.
import { readFileSync } from 'node:fs';
import { OBSERVATION_BUDGET } from '@fnaf2-1020/core/control';
import {
  CLOCK_FIELDS, OBSERVABLE_COUNTERPART, genomeReads, serialize, structuralShape,
  validateGenome,
} from './policy-lang.mjs';
import { knownGenomeShapes } from './reference-genome.mjs';

const REGISTER = JSON.parse(readFileSync(
  new URL('../device/closed-families.json', import.meta.url), 'utf8'));

export const CLOSED_FAMILIES_SCHEMA = REGISTER.schema;
export const CLOSED_FAMILIES = Object.freeze(REGISTER.families.map(Object.freeze));

const RULES = {
  // Plan 06's 125 phase schedules land here too, and that is the registry
  // being right where the old privileged list was merely different: the frame
  // clock is not a game fact, so a genome branching only on it has read
  // nothing about the game. One closure, three plans cited.
  'no-observation-branch': (genome) => {
    const reads = genomeReads(genome);
    if ([...reads].some(name => !CLOCK_FIELDS.has(name))) return null;
    if (!genome.rules.length)
      return 'the genome has no rules at all, so every decision is the fallback';
    return reads.size
      ? 'every branch is keyed on the frame clock alone, so the control flow ' +
        'never reads a game fact'
      : 'no rule reads anything; the rule list is a fixed action sequence';
  },

  'known-shape-different-times': (genome, { knownShapes }) => {
    const known = knownShapes.get(structuralShape(genome));
    if (!known) return null;
    // Identity is NOT a match here. On the observable surface the known shape
    // is the shipped `MINIMAL` program, which no search seeds from, so any
    // candidate equal to it is a rediscovery. On this surface the known shape
    // is the campaign's own seed and bar -- pruning it would empty generation
    // zero. Only a variant differing purely in its numeric thresholds is the
    // knob space Plan 16 recorded as a wall.
    if (serialize(genome) === known.serialized) return null;
    return `structurally identical to the ${known.family} family; only numeric ` +
      'thresholds differ, which is a knob setting of a policy already swept';
  },

  // Vacuous today, and implemented anyway. The privileged surface reads
  // simulator ground truth, which has no channel, so no genome can branch on
  // an audio fact and this rule matches nothing -- `OBSERVABLE_COUNTERPART`
  // names no audio fact. It is written mechanically rather than stubbed so
  // that the day a privileged read is mapped onto `bbVent` or `mangleStatic`,
  // Plan 08's latency closure fires on its own instead of being reopened by
  // someone who did not know it existed.
  //
  // The complementary concern on this surface -- a read with NO observable
  // counterpart at all -- is not a closed family and is not pruned here; it is
  // reported by `provenanceManifest().noKnownObservable` as the list of sensors
  // a survivor would require.
  'branch-on-audio-fact': (genome) => {
    const audio = [...genomeReads(genome)]
      .map(name => OBSERVABLE_COUNTERPART[name])
      .filter(fact => fact && OBSERVATION_BUDGET[fact]?.channel === 'audio');
    return audio.length
      ? `branches on privileged read(s) whose only observable counterpart is ` +
        `the audio channel: ${[...new Set(audio)].sort().join(', ')}`
      : null;
  },
};

/** Rule names the registry uses that this surface implements. */
export const IMPLEMENTED_RULES = Object.freeze(Object.keys(RULES).sort());

/**
 * Classify a genome against every recorded closure.
 *
 * @returns {{id: string, rule: string, plans: string[], closure: string,
 *   citations: string[], why: string, detail: string}[]} one entry per closed
 *   family the genome belongs to; empty when it is outside every family closed
 *   to date. `why` is the registry's rationale; `detail` is what this genome
 *   actually did to match.
 */
export function closedFamilyMatches(genome, { knownShapes = knownGenomeShapes() } = {}) {
  validateGenome(genome);
  const matches = [];
  for (const entry of CLOSED_FAMILIES) {
    const rule = RULES[entry.rule];
    if (!rule)
      throw new Error(`closed family ${entry.id} names rule ${entry.rule}, which ` +
        'the privileged surface does not implement');
    const detail = rule(genome, { knownShapes });
    if (detail) matches.push({
      id: entry.id, rule: entry.rule, plans: [...entry.plans],
      closure: entry.closure, citations: [...entry.citations], why: entry.why, detail,
    });
  }
  return matches;
}

/** `null` when the genome is not a known family, else the first it duplicates. */
export function classifyFamily(genome, options) {
  return closedFamilyMatches(genome, options)[0] ?? null;
}

/**
 * The register a search report should carry so a reader can check a prune
 * without this repository in front of them.
 */
export const closedFamilyRegister = () => ({
  schema: CLOSED_FAMILIES_SCHEMA,
  families: CLOSED_FAMILIES.map(({ id, rule, plans, closure, citations }) =>
    ({ id, rule, plans: [...plans], closure, citations: [...citations] })),
});
