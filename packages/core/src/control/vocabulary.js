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

export const GAME_CONTROLS = Object.freeze({
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
});

/** Every control name any registered game accepts. */
export const ALL_GAME_CONTROL_NAMES = Object.freeze([
  ...new Set(Object.values(GAME_CONTROLS).flatMap(game => game.controls)),
]);

/** The widest camera index any registered game addresses. */
export const MAX_GAME_CAMERA_INDEX = Math.max(
  ...Object.values(GAME_CONTROLS).map(game => game.cameraRange[1]));
