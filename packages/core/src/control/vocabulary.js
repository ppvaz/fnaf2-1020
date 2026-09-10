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
