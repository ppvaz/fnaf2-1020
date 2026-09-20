/**
 * Canonical project vocabulary for controls.
 *
 * The sourced simulator intentionally keeps `light` as its historical
 * context-dependent game action: it is the camera flash with the monitor up
 * and the hall flash with the monitor down.  Device artifacts must not use
 * that overloaded name.  They use the physical names below instead.
 * CONTRACT:semantic-control-v1.
 */

export const CONTROL_VOCABULARY = Object.freeze({
  monitor: 'monitor',
  mask: 'mask',
  cameraFeedLight: 'cameraFeedLight',
  hallLight: 'hallLight',
  leftVentLight: 'leftVentLight',
  rightVentLight: 'rightVentLight',
  wind: 'wind',
});

/** The simulator-only action retained for source fidelity. */
export const MODEL_CONTEXT_LIGHT = 'light';

/**
 * Names accepted only when translating old inputs.  New plans and profiles
 * must use CONTROL_VOCABULARY; `light` is deliberately absent because its
 * meaning depends on monitor state.
 */
export const LEGACY_CONTROL_NAMES = Object.freeze({
  ventL: CONTROL_VOCABULARY.leftVentLight,
  ventR: CONTROL_VOCABULARY.rightVentLight,
  wind: CONTROL_VOCABULARY.wind,
});

export const DEVICE_CONTROL_NAMES = Object.freeze([
  CONTROL_VOCABULARY.monitor,
  CONTROL_VOCABULARY.mask,
  CONTROL_VOCABULARY.cameraFeedLight,
  CONTROL_VOCABULARY.hallLight,
  CONTROL_VOCABULARY.leftVentLight,
  CONTROL_VOCABULARY.rightVentLight,
  CONTROL_VOCABULARY.wind,
]);

/**
 * Per-game control vocabularies, keyed by package name.
 *
 * Everything above is FNaF 2's and stays exactly as it was: `CONTROL_VOCABULARY`
 * and `DEVICE_CONTROL_NAMES` keep their names, their values and their meaning,
 * so the 113 call sites that spell `V.mask` and the validator that accepts them
 * are untouched. This registry is additive.
 *
 * It exists because the contract layer had two FNaF 2 facts baked into it that
 * are invisible until a second game arrives: the seven control names, and a
 * camera range of 0-12. FNaF 3 addresses fifteen locations -- ten cameras and
 * five vents sharing one numbering -- so `cam:13` upward was refused by core
 * with a message about coordinates and transport text, which names the wrong
 * cause entirely.
 *
 * FNaF 3's names below are the semantic roles of its *measured* touch and click
 * targets (2026-09-19, `04-Office`): the audio lure's play button, the vent-map
 * toggle, the seal-vent button, and the four reboot selections that the
 * `rebooting` counter distinguishes. They are roles, not on-screen labels, for
 * the same reason `continue` names FNaF 3's LOAD GAME entry: this vocabulary is
 * semantic.
 *
 * Adding a game here does not give it a control map. A control point is a world
 * coordinate plus a layer plus the view offset it assumes; this registry only
 * settles what a control may be *called*.
 */
export const FNAF3_CONTROL_VOCABULARY = Object.freeze({
  monitor: 'monitor',
  audioLure: 'audioLure',
  ventMapToggle: 'ventMapToggle',
  sealVent: 'sealVent',
  rebootAudio: 'rebootAudio',
  rebootCamera: 'rebootCamera',
  rebootVentilation: 'rebootVentilation',
  rebootAll: 'rebootAll',
});

/**
 * FNaF 4's semantic control roles, measured 2026-09-20 on the handset from the
 * labels the game itself draws on Night 1 (`03-04-level` groups 722-729).
 *
 * Two facts are encoded in the names rather than in a control map. The three
 * `run*` roles are reached by a DOUBLE contact, not a single one; and
 * `flashlight` and `closeDoor` are HOLDS with no latched state -- the door is
 * shut only while contact persists. A schedule for FNaF 4 therefore carries
 * contact durations where a FNaF 1/2 schedule carries toggles.
 *
 * FNaF 4 has no cameras, so it registers no `cameraRange`. That absence is the
 * point: the field was FNaF 2's, generalised for FNaF 3, and a third game shows
 * it is not universal.
 */
export const FNAF4_CONTROL_VOCABULARY = Object.freeze({
  runLeftDoor: 'runLeftDoor',
  runRightDoor: 'runRightDoor',
  runCloset: 'runCloset',
  goBack: 'goBack',
  flashlight: 'flashlight',
  closeDoor: 'closeDoor',
});

/**
 * FNaF 1's semantic control roles, measured 2026-09-20 on the handset.
 *
 * Five controls and one hard geometric fact: the two door buttons sit at world
 * x 106 and 2885 on a 2400 px screen, so they can NEVER both be on screen and
 * every door press is pan-then-press. The door LIGHTS are here for
 * completeness, not because a route needs them -- a public clear exists with
 * them never used, paying for continuous camera tracking in power instead
 * (docs/research/FNAF-SENSOR-ABLATION-RUNS.md), which is why FNaF 1's
 * difficulty is a scheduling problem rather than a sensing one.
 *
 * `monitor` is the camera tab and keeps its FNaF 2 name because it is the same
 * semantic role. Unlike every other control here it is screen-PINNED: it reads
 * at x 475-1605 at both pan extremes.
 */
export const FNAF1_CONTROL_VOCABULARY = Object.freeze({
  monitor: 'monitor',
  leftDoor: 'leftDoor',
  rightDoor: 'rightDoor',
  leftDoorLight: 'leftDoorLight',
  rightDoorLight: 'rightDoorLight',
});

export const GAME_CONTROLS = Object.freeze({
  'com.scottgames.fivenightsatfreddys': Object.freeze({
    controls: Object.freeze(Object.values(FNAF1_CONTROL_VOCABULARY)),
    /** FNaF 1 HAS cameras. Their ids are alphanumeric (`1A`, `4B`) and the
     *  view-id map has not been built, so no range can be stated -- plans/26
     *  carries it as `UNKNOWN(unmapped-view-ids)`, the open question behind the
     *  Foxy `viewing <> 99` discrepancy. FNaF 4's `null` means the opposite
     *  thing (there are none), so this is not null. */
    cameraRange: 'UNKNOWN(unmapped-view-ids)',
  }),
  'com.scottgames.fnaf2': Object.freeze({
    controls: DEVICE_CONTROL_NAMES,
    /** CAM 1-12, plus `cam:0` which the existing validator has always allowed. */
    cameraRange: Object.freeze([0, 12]),
  }),
  'com.scottgames.fnaf3': Object.freeze({
    controls: Object.freeze(Object.values(FNAF3_CONTROL_VOCABULARY)),
    /** 1-10 are cameras and 11-15 are vents, in one measured numbering. */
    cameraRange: Object.freeze([1, 15]),
  }),
  'com.scottgames.fnaf4': Object.freeze({
    controls: Object.freeze(Object.values(FNAF4_CONTROL_VOCABULARY)),
    /** No cameras exist in FNaF 4.  Null rather than absent, so the field is
     *  present on every member of the union and a reader must handle it. */
    cameraRange: null,
  }),
});

/** Every control name any registered game accepts. */
export const ALL_GAME_CONTROL_NAMES = Object.freeze([
  ...new Set(Object.values(GAME_CONTROLS).flatMap(game => game.controls)),
]);

/**
 * The widest camera index any registered game addresses.  Games without
 * cameras register no range and are skipped rather than counted as zero.
 */
export const MAX_GAME_CAMERA_INDEX = Math.max(
  ...Object.values(GAME_CONTROLS)
    // A stated range only. FNaF 4 registers `null` (no cameras exist) and
    // FNaF 1 an `UNKNOWN(...)` string (cameras exist, ids unmapped); a truthy
    // test would have indexed that string and produced NaN for every game.
    .filter(game => Array.isArray(game.cameraRange))
    .map(game => game.cameraRange[1]));
