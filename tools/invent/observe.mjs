// Custom Night observation surface for Plan 05 package 6a.
//
// This is deliberately a view, not another transition model.  It reads the
// exact Sim and returns plain data that a policy can inspect.  The flat
// provenance map is part of the contract: a field cannot be added to the
// observation without also saying whether it is supported by the in-process
// tuple or is still a simulator approximation.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';

export const OBSERVATION_SCHEMA = 'custom-night-observation-v1';
export const PROVENANCE_DOCUMENT =
  'docs/android/UNIFIED-SOURCED-ENGINE-FACT-INDEX.md';

const source = (groups) => `[SOURCED] ${PROVENANCE_DOCUMENT} ${groups}`;
const model = (reason) => `[MODEL] ${reason}`;

// These are the only approximations intentionally admitted by this surface.
// Keep the labels stable: result files can carry them forward without
// copying the implementation's prose into every search artifact.
export const MODEL_APPROXIMATIONS = Object.freeze([
  'post-chokepoint routing',
  'vent departures',
  'blackout forcing',
]);

export const CHARACTER_IDS = Object.freeze([
  ...C.STALLED.map((unit) => unit.id),
  'foxy', 'bb', 'golden', 'puppet',
]);

if (new Set(CHARACTER_IDS).size !== 11)
  throw new Error('Custom Night observation must expose exactly eleven characters');

// Plan 17's minimal internal-state tuple.  Every [SOURCED] observation field
// below must be in this set.  Fields outside it remain useful to the search,
// but are explicitly marked [MODEL] until the rebuilt runtime exposes them.
export const IN_PROCESS_TUPLE_FIELDS = Object.freeze([
  'frame',
  'hour',
  'resources.power',
  'resources.box',
  'monitor.state',
  'mask.state',
  'mask.fullyOn',
  'mask.ticks.bb',
  'camera.viewing',
  'camera.marker',
  'camera.lastViewed',
  'blackout.active',
  'blackout.counter',
  'blackout.forced',
  'danger.active',
  'characters.foxy.d',
  'characters.bb.stage',
  'characters.bb.inOpening',
  'characters.bb.inside',
]);

const tuple = new Set(IN_PROCESS_TUPLE_FIELDS);

const STALLED_FIELDS = [
  'location', 'stage', 'stunRemaining', 'pending', 'atOpening', 'inside',
  'committedAttack', 'committedAttackRemaining', 'dangerRemaining',
];

// The output keys are derived once, so completeness validation catches both a
// missing tag and an accidental untagged field on a newly added character.
const observationProvenance = {
  frame: source('§2, g627/g629-g630'),
  hour: source('§2, g629-g630'),
  resources: {
    power: source('§2, g284 and the battery table'),
    box: source('§13, g638-g645 and g652-g660'),
  },
  monitor: {
    state: source('§9, g254-g262'),
    panelState: model('blackout forcing'),
    animationRemaining: model('blackout forcing'),
  },
  mask: {
    state: source('§10, g267-g274 and g9-g11'),
    fullyOn: source('§10, g9 and g267-g270'),
    fullyOff: model('blackout forcing'),
    animationRemaining: model('blackout forcing'),
    ticks: {
      bb: source('§10, g293-g294 and g907'),
      toychica: model('vent departures'),
      mangle: model('vent departures'),
    },
  },
  camera: {
    viewing: source('§5, g16-g27, g39-g57'),
    marker: source('§5, g16-g27, g39-g40'),
    lastViewed: source('§5, g263'),
  },
  blackout: {
    active: source('§8, g534-g537'),
    counter: source('§8, blackout object v0'),
    forced: source('§9, g612-g624 and g718-g721'),
    by: model('blackout forcing'),
    unitId: model('blackout forcing'),
    masked: model('blackout forcing'),
    deadlineRemaining: model('blackout forcing'),
  },
  danger: {
    active: source('§8, g530-g562'),
    committed: model('vent departures'),
  },
  characters: {},
  eventFlags: {
    blackoutStart: model('blackout forcing'),
    bbOpening: model('vent departures'),
    foxyDeparture: model('vent departures'),
  },
};

for (const id of C.STALLED.map((unit) => unit.id)) {
  observationProvenance.characters[id] = Object.fromEntries(
    STALLED_FIELDS.map((field) => [field, model(
      field === 'location' || field === 'stage'
        ? 'post-chokepoint routing'
        : field === 'committedAttack' || field === 'committedAttackRemaining' ||
            field === 'dangerRemaining'
          ? 'vent departures'
          : 'post-chokepoint routing',
    )]),
  );
}

observationProvenance.characters.foxy = {
    d: source('§11, g337, g824-g825, g864, g872-g874'),
    location: model('post-chokepoint routing'),
    stage: model('post-chokepoint routing'),
    stunRemaining: model('post-chokepoint routing'),
    committedAttack: model('vent departures'),
    committedAttackRemaining: model('vent departures'),
    dangerRemaining: model('vent departures'),
    exposure: model('post-chokepoint routing'),
    gotYou: model('vent departures'),
    pinRemaining: model('post-chokepoint routing'),
  };
observationProvenance.characters.bb = {
    stage: source('§11, g342 and g413-g418'),
    location: model('post-chokepoint routing'),
    inOpening: source('§11, g417 and g290-g291'),
    inside: source('§8, g96 and marker 123'),
    pending: model('vent departures'),
    stunRemaining: model('vent departures'),
    committedAttack: model('vent departures'),
    committedAttackRemaining: model('vent departures'),
    dangerRemaining: model('vent departures'),
  };
observationProvenance.characters.golden = {
    location: model('post-chokepoint routing'),
    stage: model('post-chokepoint routing'),
    present: model('post-chokepoint routing'),
    inHall: model('post-chokepoint routing'),
    stunRemaining: model('post-chokepoint routing'),
    committedAttack: model('vent departures'),
    committedAttackRemaining: model('vent departures'),
    dangerRemaining: model('vent departures'),
  };
observationProvenance.characters.puppet = {
    location: model('post-chokepoint routing'),
    stage: model('post-chokepoint routing'),
    stunRemaining: model('post-chokepoint routing'),
    atOpening: model('vent departures'),
    inside: model('vent departures'),
    committedAttack: model('vent departures'),
    committedAttackRemaining: model('vent departures'),
    dangerRemaining: model('vent departures'),
};

// These are the exact leaves covered by the tagged state object.  Exporting
// them makes the contract inspectable by search tools without exposing the
// mutable construction above.
const flatten = (value, prefix = '', out = {}) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out[prefix] = value;
  }
  return out;
};

const PROVENANCE = Object.freeze(flatten(observationProvenance));
export { PROVENANCE };

const modelFields = Object.freeze(Object.entries(PROVENANCE)
  .filter(([, tag]) => tag.startsWith('[MODEL]'))
  .map(([field]) => field));
export { modelFields as MODEL_FIELDS };

function remaining(until, frame) {
  return Number.isFinite(until) && until > frame ? until - frame : 0;
}

function locationForUnit(unit) {
  if (unit.inside) return 'inside';
  if (unit.atOpening) return unit.path[unit.idx];
  if (unit.done) return 'done';
  return unit.path[unit.idx];
}

function unitObservation(unit, frame) {
  return {
    location: locationForUnit(unit),
    stage: unit.idx,
    stunRemaining: remaining(unit.stunUntil, frame),
    pending: Boolean(unit.pending),
    atOpening: Boolean(unit.atOpening),
    inside: Boolean(unit.inside),
    committedAttack: unit.committedAt >= 0,
    committedAttackRemaining: remaining(unit.committedAt, frame),
    dangerRemaining: remaining(unit.insideDangerAt, frame),
  };
}

function eventAt(sim, type, predicate = () => true) {
  return sim.events.some((event) => event.f === sim.frame && event.type === type &&
    predicate(event.data));
}

function maskState(sim) {
  if (sim.maskOn) return sim.maskAnim === 0 ? 2 : 1;
  return sim.maskAnim > 0 ? 3 : 0;
}

function specialCharacterViews(sim) {
  const frame = sim.frame;
  const foxy = sim.foxy;
  const bb = sim.bb;
  const golden = sim.gf;
  const puppet = sim.puppet;
  return {
    foxy: {
      d: foxy.D,
      location: foxy.loc,
      stage: foxy.gotYou ? 'locked' : foxy.loc,
      stunRemaining: 0,
      committedAttack: false,
      committedAttackRemaining: 0,
      dangerRemaining: 0,
      exposure: foxy.exposure,
      gotYou: Boolean(foxy.gotYou),
      pinRemaining: remaining(foxy.pinUntil, frame),
    },
    bb: {
      stage: bb.stage,
      location: bb.inside ? 'inside' : bb.inOpening ? 'opening' :
        [10, 7, 3, 1, 5][bb.stage] ?? 'route',
      inOpening: Boolean(bb.inOpening),
      inside: Boolean(bb.inside),
      pending: Boolean(bb.pending),
      stunRemaining: 0,
      committedAttack: false,
      committedAttackRemaining: 0,
      dangerRemaining: 0,
    },
    golden: {
      location: golden.present ? 'office' : golden.inHall ? 'hall' : 'absent',
      stage: golden.present ? 'office' : golden.inHall ? 'hall' : 'absent',
      present: Boolean(golden.present),
      inHall: Boolean(golden.inHall),
      stunRemaining: 0,
      committedAttack: Boolean(golden.attackAt >= 0),
      committedAttackRemaining: remaining(golden.attackAt, frame),
      dangerRemaining: remaining(golden.attackAt, frame),
    },
    puppet: {
      location: puppet.inside ? 'inside' : puppet.atOpening ? 'opening' : puppet.loc,
      stage: puppet.stage,
      stunRemaining: remaining(puppet.stunUntil, frame),
      atOpening: Boolean(puppet.atOpening),
      inside: Boolean(puppet.inside),
      committedAttack: puppet.attackAt >= 0,
      committedAttackRemaining: remaining(puppet.attackAt, frame),
      dangerRemaining: remaining(puppet.attackAt, frame),
    },
  };
}

function makeObservation(sim) {
  const characters = Object.fromEntries(
    sim.units.map((unit) => [unit.id, unitObservation(unit, sim.frame)]),
  );
  Object.assign(characters, specialCharacterViews(sim));

  const committed = sim.units.some((unit) => unit.committedAt >= 0) ||
    sim.puppet.attackAt >= 0 || sim.gf.attackAt >= 0;
  const reaction = sim.units.some((unit) => unit.insideDangerAt >= sim.frame);

  return {
    frame: sim.frame,
    hour: Math.floor(sim.frame / C.HOUR_FRAMES),
    resources: {
      power: sim.power,
      box: Math.max(0, Math.min(C.BOX_UNITS, Math.round(sim.box * C.BOX_UNITS))),
    },
    monitor: {
      state: sim.monitor,
      panelState: sim.monitor,
      animationRemaining: sim.monAnim,
    },
    mask: {
      state: maskState(sim),
      fullyOn: Boolean(sim.maskFullyOn),
      fullyOff: Boolean(sim.maskFullyOff),
      animationRemaining: sim.maskAnim,
      ticks: {
        bb: sim.bb.maskTicks,
        toychica: sim.units.find((unit) => unit.id === 'toychica').maskExposureTicks,
        mangle: sim.units.find((unit) => unit.id === 'mangle').maskExposureTicks,
      },
    },
    camera: {
      viewing: sim.viewing,
      marker: sim.cam,
      lastViewed: sim.lastViewed,
    },
    blackout: {
      active: Boolean(sim.blackout.active),
      counter: remaining(sim.blackout.until, sim.frame),
      forced: Boolean(sim.dropEverything),
      by: sim.blackout.by,
      unitId: sim.blackout.unitId,
      masked: Boolean(sim.blackout.masked),
      deadlineRemaining: remaining(sim.blackout.deadline, sim.frame),
    },
    danger: {
      active: Boolean(sim.blackout.active || reaction || committed),
      committed,
    },
    characters,
    eventFlags: {
      blackoutStart: eventAt(sim, 'blackout'),
      bbOpening: eventAt(sim, 'vent-bang', (data) =>
        data?.who === 'bb' && data.leaving === false && data.arrival !== undefined),
      foxyDeparture: eventAt(sim, 'foxy-leave'),
    },
  };
}

function assertTag(tag, field) {
  if (typeof tag !== 'string') throw new TypeError(`missing provenance for ${field}`);
  if (tag.startsWith('[SOURCED] ')) {
    if (!tag.includes(PROVENANCE_DOCUMENT))
      throw new TypeError(`sourced provenance for ${field} has no source document`);
    if (!tuple.has(field))
      throw new TypeError(`sourced field ${field} is outside Plan 17's internal tuple`);
    return;
  }
  if (tag.startsWith('[MODEL] ')) {
    const reason = tag.slice('[MODEL] '.length);
    if (!MODEL_APPROXIMATIONS.includes(reason))
      throw new TypeError(`unknown model approximation for ${field}: ${reason}`);
    return;
  }
  throw new TypeError(`invalid provenance tag for ${field}`);
}

export function validateObservation(observation) {
  if (!observation || typeof observation !== 'object')
    throw new TypeError('Custom Night observation must be an object');
  const fields = flatten(observation);
  const tagged = new Set(Object.keys(PROVENANCE));
  const actual = new Set(Object.keys(fields));
  if (actual.size !== tagged.size || [...actual].some((field) => !tagged.has(field)))
    throw new TypeError('observation fields and provenance fields differ');
  for (const [field, tag] of Object.entries(PROVENANCE)) {
    if (!(field in fields)) throw new TypeError(`observation field is missing: ${field}`);
    assertTag(tag, field);
  }
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value)))
      throw new TypeError(`observation field is not finite: ${field}`);
  }
  return observation;
}

/** Return plain policy-readable state. */
export function view(sim) {
  if (!sim || typeof sim !== 'object' || !Array.isArray(sim.units))
    throw new TypeError('view() requires a Sim-like object');
  return validateObservation(makeObservation(sim));
}

/** Return the same state with its immutable provenance contract attached. */
export function observe(sim) {
  return Object.freeze({
    schema: OBSERVATION_SCHEMA,
    state: view(sim),
    provenance: PROVENANCE,
  });
}

function parseArgs(argv) {
  const value = (name, fallback) => {
    const arg = argv.find((item) => item.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : fallback;
  };
  return {
    seed: Number(value('seed', '1')),
    night: Number(value('night', '7')),
    frames: Number(value('frames', '1')),
  };
}

if (process.argv[1] && process.argv[1].endsWith('/observe.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  const sim = new Sim({
    seed: options.seed,
    night: 7,
    customNight: Object.fromEntries(C.AI_DIALS.map((id) => [id, options.night === 7 ? 20 : 0])),
    durationFrames: Math.max(1, options.frames),
  });
  for (let i = 0; i < options.frames && sim.alive && !sim.won; i++) sim.tick();
  console.log(JSON.stringify(observe(sim), null, 2));
}
