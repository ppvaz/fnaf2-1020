// Plan 05 package 6b/6c: the invention policy language.
//
// A genome is an ordered rule list over the PRIVILEGED Custom Night observation
// surface (`tools/invent/observe.mjs`). First match wins, exactly like the
// cascade in `tools/minus7/policy.mjs`'s `decide()`.
//
// SURFACE AND SCOPE. This language reads simulator-internal state -- character
// stages, stun timers, committed attacks. A program written here CANNOT RUN ON
// A PHONE. It is a refutation instrument: the privileged surface is a strict
// upper bound, so if a program with perfect access cannot clear a target, no
// observable program can, and the target is refuted cheaply (ROADMAP Track B's
// stopping rule). Nothing expressed here is device-promotable.
//
// Every rule therefore carries its own provenance: which privileged reads it
// used, and which decision each read justified. That manifest is the bridge to
// the controller-observable surface -- a privileged read is a sensor
// requirement in disguise, and a read with no observable counterpart is the
// list of sensors a survivor would need and does not have.
import { readFileSync } from 'node:fs';
import { PROVENANCE, MODEL_FIELDS } from './observe.mjs';

export const POLICY_LANG_SCHEMA = 'invent-policy-v1';

// The rollout surface is `tools/minus7/sim.mjs`'s flat `view()`, because that is
// what the reference policy `decide()` reads and what package 6b's gate is
// written against. Provenance lives on package 6a's richer dotted surface, so
// each flat read is mapped to its provenanced path and validated at load: a
// typo or a renamed field fails immediately rather than silently losing
// provenance.
export const SURFACE_PATH = Object.freeze({
  frame: 'frame', hour: 'hour',
  box: 'resources.box', power: 'resources.power',
  blackout: 'blackout.active',
  maskOn: 'mask.state', maskFullyOn: 'mask.fullyOn', maskFullyOff: 'mask.fullyOff',
  monitor: 'monitor.state',
  foxyD: 'characters.foxy.d', foxyLoc: 'characters.foxy.location',
  foxyExposure: 'characters.foxy.exposure', foxyGotYou: 'characters.foxy.gotYou',
  bbOpening: 'characters.bb.inOpening', bbInside: 'characters.bb.inside',
  bbStage: 'characters.bb.stage', bbMaskTicks: 'mask.ticks.bb',
  gfPresent: 'characters.golden.present', gfInHall: 'characters.golden.inHall',
  puppetStage: 'characters.puppet.stage', puppetInside: 'characters.puppet.inside',
  committed: 'danger.committed', attackExecuting: 'danger.active',
});

// Fields the rollout surface exposes that package 6a's observation surface does
// NOT contain. These are a recorded gap in 6a, not a licence to read anything:
// a survivor leaning on one of these is telling us 6a is incomplete, and the
// provenance manifest reports them so that cannot pass unnoticed.
export const UNSURFACED = new Set(['winding', 'stun', 'lightHeld', 'ventLightL',
  'ventLightR', 'markerCam', 'viewing', 'lastViewed', 'maskAnim', 'atOpening',
  'inside', 'alive', 'won']);

for (const [flat, path] of Object.entries(SURFACE_PATH)) {
  if (!(path in PROVENANCE))
    throw new TypeError(`policy-lang: ${flat} maps to ${path}, which package 6a does not provide`);
}
export const REGISTER_COUNT = 4;

// The semantic action vocabulary is `tools/minus7/sim.mjs`'s ACTIONS, named
// here so the language cannot silently invent a motor primitive.
export const ACTION_NAMES = Object.freeze(['WAIT', 'LOWER', 'RAISE', 'MASK_ON',
  'MASK_OFF', 'FLICK', 'HOLD_MASK', 'HALL_FLASH', 'HALL_HOLD', 'SWEEP', 'WIND',
  // HALL_BANK is the eviction round; see INVENT_ACTIONS in search.mjs.
  'WIND_LONG', 'VENTL', 'HALL_BANK']);

const COMPARISONS = Object.freeze(['<', '<=', '==', '!=', '>=', '>']);
// Arithmetic is not in package 6b's bullet list, but its own gate requires the
// language to contain `decide()`, which computes `projD = foxyD +
// floor(toCheck / FPS)` and `boxFramesLeft = box * drain`. A language that
// cannot express its stated gate is not a language; the deviation is recorded
// here rather than by weakening the gate.
const ARITHMETIC = Object.freeze(['+', '-', '*', '/', 'floor', 'mod']);

const fail = message => { throw new TypeError(`policy-lang: ${message}`); };
const isInt = value => Number.isInteger(value);

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

/** Collect every privileged observation field an expression reads. */
export function readsOf(node, into = new Set()) {
  if (!node || typeof node !== 'object') return into;
  if (node.t === 'field') into.add(node.name);
  if (node.t === 'len') into.add(node.name);
  if (node.t === 'anyStun') into.add('stun');
  for (const key of ['a', 'b', 'x', 'value']) if (node[key]) readsOf(node[key], into);
  for (const child of node.xs ?? []) readsOf(child, into);
  return into;
}

function evalExpr(node, obs, registers, constants) {
  switch (node.t) {
    case 'const': return node.v;
    case 'param': {
      if (!(node.name in constants)) fail(`unknown parameter ${node.name}`);
      return constants[node.name];
    }
    case 'field': {
      if (!(node.name in obs)) fail(`unknown observation field ${node.name}`);
      const value = obs[node.name];
      return typeof value === 'boolean' ? (value ? 1 : 0) : value;
    }
    case 'len': return (obs[node.name] ?? []).length;
    case 'reg': return registers[node.i] ?? 0;
    case 'eq': return obs[node.name] === node.v ? 1 : 0;
    case 'everyN': {
      const period = evalExpr(node.a, obs, registers, constants);
      const phase = evalExpr(node.b, obs, registers, constants);
      return period > 0 && obs.frame % period === phase ? 1 : 0;
    }
    case 'ticksSince': {
      const at = registers[node.i] ?? 0;
      return at === 0 ? Infinity : obs.frame - at;
    }
    // A bounded quantifier over the stun table. `decide()` needs exactly this
    // and nothing more general, so the language stays finite.
    case 'anyStun': {
      const bound = evalExpr(node.a, obs, registers, constants);
      return (obs.stun ?? []).some(entry =>
        entry.occupied && compare(node.op, entry.stun, bound)) ? 1 : 0;
    }
    case 'arith': {
      const a = evalExpr(node.a, obs, registers, constants);
      if (node.op === 'floor') return Math.floor(a);
      const b = evalExpr(node.b, obs, registers, constants);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? Infinity : a / b;
        case 'mod': return b === 0 ? 0 : ((a % b) + b) % b;
        default: return fail(`unknown arithmetic ${node.op}`);
      }
    }
    case 'cmp': return compare(node.op,
      evalExpr(node.a, obs, registers, constants),
      evalExpr(node.b, obs, registers, constants)) ? 1 : 0;
    case 'and': return node.xs.every(x => evalExpr(x, obs, registers, constants)) ? 1 : 0;
    case 'or': return node.xs.some(x => evalExpr(x, obs, registers, constants)) ? 1 : 0;
    case 'not': return evalExpr(node.x, obs, registers, constants) ? 0 : 1;
    default: return fail(`unknown node ${node.t}`);
  }
}

function compare(op, a, b) {
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '!=': return a !== b;
    case '>=': return a >= b;
    case '>': return a > b;
    default: return fail(`unknown comparison ${op}`);
  }
}

// ---------------------------------------------------------------------------
// Genome
// ---------------------------------------------------------------------------

export function validateGenome(genome) {
  if (!genome || genome.schema !== POLICY_LANG_SCHEMA) fail('genome schema mismatch');
  if (!Array.isArray(genome.rules)) fail('genome needs a rule list');
  if (!ACTION_NAMES.includes(genome.fallback)) fail(`bad fallback ${genome.fallback}`);
  for (const [index, rule] of genome.rules.entries()) {
    if (!rule || typeof rule !== 'object') fail(`rule ${index} is not an object`);
    if (!ACTION_NAMES.includes(rule.then)) fail(`rule ${index} has unknown action ${rule.then}`);
    if (rule.set !== undefined &&
        (!isInt(rule.set) || rule.set < 0 || rule.set >= REGISTER_COUNT))
      fail(`rule ${index} writes an out-of-range register`);
    for (const name of readsOf(rule.when)) {
      if (!(name in SURFACE_PATH) && !UNSURFACED.has(name))
        fail(`rule ${index} reads field ${name}, which is neither mapped into ` +
             `the 6a surface nor recorded as a surface gap`);
    }
  }
  return genome;
}

/**
 * Pure: same observation and registers in, same action out. Registers are the
 * ONLY retained state and they are passed explicitly, never closed over.
 */
export function interpret(genome, obs, { registers = new Array(REGISTER_COUNT).fill(0),
  constants = {} } = {}) {
  const next = [...registers];
  for (const [index, rule] of genome.rules.entries()) {
    if (!evalExpr(rule.when, obs, registers, constants)) continue;
    if (rule.set !== undefined) next[rule.set] = obs.frame;
    return { action: rule.then, rule: index, registers: next };
  }
  return { action: genome.fallback, rule: -1, registers: next };
}

export const serialize = genome => JSON.stringify(validateGenome(genome));
export const parse = text => validateGenome(JSON.parse(text));

// ---------------------------------------------------------------------------
// Genome operators (seeded, deterministic)
// ---------------------------------------------------------------------------

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const NUMERIC_FIELDS = Object.freeze(['foxyD', 'box', 'power', 'frame', 'hour',
  'bbStage', 'bbMaskTicks', 'puppetStage', 'foxyExposure']);
const BOOL_FIELDS = Object.freeze(['blackout', 'maskOn', 'winding', 'bbOpening',
  'bbInside', 'gfPresent', 'gfInHall', 'lightHeld', 'ventLightL', 'ventLightR',
  'puppetInside', 'attackExecuting']);

function randomPredicate(rng, depth = 0) {
  const roll = rng();
  if (depth >= 2 || roll < 0.45)
    return { t: 'field', name: pick(rng, BOOL_FIELDS) };
  if (roll < 0.75)
    return { t: 'cmp', op: pick(rng, COMPARISONS),
      a: { t: 'field', name: pick(rng, NUMERIC_FIELDS) },
      b: { t: 'const', v: Math.floor(rng() * 400) } };
  if (roll < 0.85) return { t: 'not', x: randomPredicate(rng, depth + 1) };
  return { t: rng() < 0.5 ? 'and' : 'or',
    xs: [randomPredicate(rng, depth + 1), randomPredicate(rng, depth + 1)] };
}

/** A seeded random genome. Used only as the search's negative control floor. */
export function randomGenome(rng, { rules = 4 } = {}) {
  return validateGenome({
    schema: POLICY_LANG_SCHEMA,
    rules: Array.from({ length: rules }, () => ({
      when: randomPredicate(rng), then: pick(rng, ACTION_NAMES),
    })),
    fallback: pick(rng, ACTION_NAMES),
  });
}

export function mutate(genome, rng) {
  const next = structuredClone(validateGenome(genome));
  const roll = rng();
  // Rule ORDER is semantics here, because first match wins. Plan 05 package
  // 7b's check-in indicted an ordering specifically -- `bbOpening ->
  // HOLD_MASK` sitting above the Foxy check starves the hall flash -- so a
  // search that cannot move a rule cannot reach the fix.
  if (next.rules.length > 1 && roll < 0.2) {
    const from = Math.floor(rng() * next.rules.length);
    let to = Math.floor(rng() * next.rules.length);
    if (to === from) to = (to + 1) % next.rules.length;
    next.rules.splice(to, 0, next.rules.splice(from, 1)[0]);
    return validateGenome(next);
  }
  if (!next.rules.length || roll < 0.4)
    next.rules.splice(Math.floor(rng() * (next.rules.length + 1)), 0,
      { when: randomPredicate(rng), then: pick(rng, ACTION_NAMES) });
  else if (roll < 0.6) next.rules.splice(Math.floor(rng() * next.rules.length), 1);
  else if (roll < 0.8) next.rules[Math.floor(rng() * next.rules.length)].then = pick(rng, ACTION_NAMES);
  else next.rules[Math.floor(rng() * next.rules.length)].when = randomPredicate(rng);
  return validateGenome(next);
}

/** Single-point crossover on the rule list; order carries meaning here. */
export function crossover(a, b, rng) {
  validateGenome(a); validateGenome(b);
  const cutA = Math.floor(rng() * (a.rules.length + 1));
  const cutB = Math.floor(rng() * (b.rules.length + 1));
  return validateGenome({
    schema: POLICY_LANG_SCHEMA,
    rules: structuredClone([...a.rules.slice(0, cutA), ...b.rules.slice(cutB)]),
    fallback: rng() < 0.5 ? a.fallback : b.fallback,
  });
}

// ---------------------------------------------------------------------------
// Structural shape
// ---------------------------------------------------------------------------

/** Every privileged observation field the whole genome reads. */
export function genomeReads(genome) {
  const reads = new Set();
  for (const rule of genome.rules) readsOf(rule.when, reads);
  return reads;
}

// Fields that are not game facts. The frame clock and the in-game hour are
// readable from a stopwatch, so a genome branching only on them has read
// nothing about the game -- that is Plan 06's phase-schedule family, and the
// registry files it under the same closure as a static cover.
export const CLOCK_FIELDS = Object.freeze(new Set(['frame', 'hour']));

function expressionShape(node) {
  if (!node || typeof node !== 'object') return String(node);
  switch (node.t) {
    // A bare literal is a time or a threshold. Erasing it is the whole point:
    // two genomes with the same shape are the same program at different times.
    case 'const': return 'const';
    case 'param': return `param:${node.name}`;
    case 'field': return `field:${node.name}`;
    case 'len': return `len:${node.name}`;
    case 'reg': return `reg:${node.i}`;
    // `eq` compares against a CATEGORICAL value (`monitor == 'up'`,
    // `foxyLoc == 'parts'`). That names a game state, not a time, so it is
    // kept: a genome watching a different location is a different program.
    case 'eq': return `eq:${node.name}:${JSON.stringify(node.v)}`;
    case 'ticksSince': return `ticksSince:${node.i}`;
    case 'everyN': return `everyN(${expressionShape(node.a)},${expressionShape(node.b)})`;
    case 'anyStun': return `anyStun:${node.op}(${expressionShape(node.a)})`;
    case 'arith': return `arith:${node.op}(${expressionShape(node.a)},` +
      `${node.b ? expressionShape(node.b) : ''})`;
    case 'cmp': return `cmp:${node.op}(${expressionShape(node.a)},${expressionShape(node.b)})`;
    case 'and': case 'or': return `${node.t}(${node.xs.map(expressionShape).join(',')})`;
    case 'not': return `not(${expressionShape(node.x)})`;
    default: return fail(`unknown node ${node.t}`);
  }
}

/**
 * The genome with every numeric literal erased: rule order, predicate
 * structure, comparison operators, categorical values and actions survive.
 * Counterpart of `tools/device/policy-grammar.mjs`'s `structuralShape` for the
 * observation-language program, and the input to the registry's
 * `known-shape-different-times` rule.
 */
export function structuralShape(genome) {
  validateGenome(genome);
  return JSON.stringify({
    rules: genome.rules.map(rule => ({
      when: expressionShape(rule.when), then: rule.then, set: rule.set ?? null,
    })),
    fallback: genome.fallback,
  });
}

// ---------------------------------------------------------------------------
// Privileged-read provenance (Pedro, 2026-09-02)
// ---------------------------------------------------------------------------

// Which controller-observable fact, if any, could stand in for a privileged
// read. `null` means NO KNOWN OBSERVABLE: that entry is the sensor a survivor
// would require and the project does not have. The mapping is deliberately
// conservative -- an entry is only filled where the observable fact carries the
// same information, not merely a correlated one.
// Which controller-observable fact, if any, could stand in for a privileged
// read -- lifted from `privileged-observable-map.json` (Track B1) rather than
// asserted here. The map's seven-way taxonomy is the point: a flat
// "counterpart or null" reports `characters.foxy.d` and
// `characters.golden.present` identically, when the first is genuinely
// invisible and the second is a sensor somebody could build. Telling a reader
// to go build a sensor that is not needed, or hiding one that is, is the
// failure this replaces.
const OBSERVABLE_MAP = JSON.parse(readFileSync(
  new URL('./privileged-observable-map.json', import.meta.url), 'utf8'));

export const OBSERVABLE_MAP_SCHEMA = OBSERVABLE_MAP.schema;
export const COVERAGE_KINDS = Object.freeze([...OBSERVABLE_MAP.coverageKinds]);
export const AVAILABILITY = Object.freeze(OBSERVABLE_MAP.availability);

/** availableToday | needsNewSensor | needsMeasuredAudio | unavailable */
export function availabilityOf(coverage) {
  for (const [bucket, kinds] of Object.entries(AVAILABILITY))
    if (kinds.includes(coverage)) return bucket;
  return 'unmapped';
}

// `characters.<id>.<field>` resolves through the map's per-class table; every
// id without its own class is a stalled character.
function coverageEntry(path) {
  if (!path) return null;
  const direct = OBSERVABLE_MAP.fields[path];
  if (direct) return direct;
  const parts = path.split('.');
  if (parts.length === 3 && parts[0] === 'characters') {
    const [, id, field] = parts;
    const table = OBSERVABLE_MAP.characterFields[id] ??
      OBSERVABLE_MAP.characterFields.stalled;
    return table?.[field] ?? null;
  }
  return null;
}

/**
 * Coverage for one dotted surface path. An unmapped path is reported as
 * `unmapped`, never silently as "no counterpart": not knowing is a different
 * claim from knowing it is invisible.
 */
export function observableCoverage(path) {
  const entry = coverageEntry(path);
  if (!entry) return { coverage: 'unmapped', facts: [], note: null,
    candidateSensor: null, availability: 'unmapped' };
  return {
    coverage: entry.coverage,
    facts: [...(entry.facts ?? [])],
    note: entry.note ?? null,
    candidateSensor: entry.candidateSensor ?? null,
    availability: availabilityOf(entry.coverage),
  };
}

// Kept for consumers that only need "is there a fact for this": derived from
// the map so it cannot drift from it. `closed-families.mjs` reads this.
export const OBSERVABLE_COUNTERPART = Object.freeze(Object.fromEntries(
  Object.entries(SURFACE_PATH).map(([flat, path]) => {
    const { facts } = observableCoverage(path);
    return [flat, facts.length ? facts[0] : null];
  })));

/**
 * Per-rule manifest: which privileged reads justified which decision, and
 * whether each has an observable counterpart. This is a required output of the
 * privileged search, not a report -- a survivor without it is unactionable,
 * because nobody could tell what would have to be built to run it.
 */
export function provenanceManifest(genome) {
  validateGenome(genome);
  const rules = genome.rules.map((rule, index) => {
    const reads = [...readsOf(rule.when)].sort();
    return {
      rule: index,
      decision: rule.then,
      reads: reads.map(name => {
        const path = SURFACE_PATH[name] ?? null;
        return {
          field: name,
          surface: path,
          provenance: path ? PROVENANCE[path] : '[GAP] not in the package 6a surface',
          model: path ? MODEL_FIELDS.includes(path) : false,
          observable: OBSERVABLE_COUNTERPART[name] ?? null,
          ...observableCoverage(path),
        };
      }),
    };
  });
  // Bucket every read by what it would actually take to run this candidate.
  const buckets = { availableToday: new Set(), needsNewSensor: new Set(),
    needsMeasuredAudio: new Set(), unavailable: new Set(), unmapped: new Set() };
  const candidateSensors = new Set();
  for (const rule of rules) {
    for (const read of rule.reads) {
      (buckets[read.availability] ?? buckets.unmapped).add(read.field);
      if (read.candidateSensor) candidateSensors.add(read.candidateSensor);
    }
  }
  const unobservable = buckets.unavailable;
  const surfaceGaps = new Set();
  for (const rule of rules)
    for (const read of rule.reads) if (!read.surface) surfaceGaps.add(read.field);
  return {
    schema: 'privileged-read-manifest-v1',
    rules,
    // Reads the rollout surface has and package 6a does not. A survivor that
    // depends on one of these has found a hole in 6a.
    surfaceGaps: [...surfaceGaps].sort(),
    // What running this candidate would actually require. `noKnownObservable`
    // is now only the genuinely invisible reads; a read a sensor could be built
    // for is `needsNewSensor`, and one whose information is already there is
    // `availableToday`. Conflating those is what the flat map did.
    availableToday: [...buckets.availableToday].sort(),
    needsNewSensor: [...buckets.needsNewSensor].sort(),
    needsMeasuredAudio: [...buckets.needsMeasuredAudio].sort(),
    noKnownObservable: [...unobservable].sort(),
    unmapped: [...buckets.unmapped].sort(),
    candidateSensors: [...candidateSensors].sort(),
    // The single bit stage 2 needs: could a real controller run this today?
    fullyObservable: buckets.needsNewSensor.size === 0 &&
      buckets.needsMeasuredAudio.size === 0 && unobservable.size === 0 &&
      buckets.unmapped.size === 0,
    blockedBy: [...buckets.needsNewSensor, ...buckets.needsMeasuredAudio,
      ...unobservable, ...buckets.unmapped].sort(),
    modelReads: rules.flatMap(r => r.reads.filter(x => x.model).map(x => x.field)),
  };
}
