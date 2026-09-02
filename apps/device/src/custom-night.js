/**
 * Custom Night configuration and calibration contract.
 *
 * The game does not expose a stable accessibility tree for the dial screen,
 * so coordinates and readback regions must come from one measured guided
 * session.  This module intentionally contains no guessed coordinates.
 * CONTRACT:custom-night-config-v1.
 */
import { AI_DIALS, AI_10_20, PUPPET_AI } from '@fnaf2-1020/core/mechanics';

export const CUSTOM_NIGHT_SCHEMA = 'custom-night-config-v1';
export const CUSTOM_NIGHT_CALIBRATION_SCHEMA = 'custom-night-calibration-v1';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`custom night: ${message}`); };
const text = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
};
const point = (value, label) => {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y) ||
      value.x < 0 || value.y < 0) fail(`${label} must be a non-negative x/y point`);
  return value;
};
const box = (value, label) => {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y) ||
      !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
      value.x < 0 || value.y < 0 || value.width < 1 || value.height < 1)
    fail(`${label} must be a non-empty x/y/width/height region`);
  return value;
};

export function validateCustomNightConfig(value) {
  if (!isRecord(value) || value.schema !== CUSTOM_NIGHT_SCHEMA || value.version !== 1)
    fail('configuration schema/version mismatch');
  if (!isRecord(value.dials)) fail('dials are required');
  for (const dial of AI_DIALS) {
    if (!Number.isInteger(value.dials[dial]) || value.dials[dial] < 0 || value.dials[dial] > AI_10_20)
      fail(`dials.${dial} must be an integer in 0..${AI_10_20}`);
  }
  const extras = Object.keys(value.dials).filter(dial => !AI_DIALS.includes(dial));
  if (extras.length) fail(`unknown dials: ${extras.join(',')}`);
  if (value.puppet !== PUPPET_AI) fail(`puppet must be ${PUPPET_AI}`);
  return value;
}

/** Make the reviewed 10/20 configuration without any UI assumptions. */
/** @param {Record<string, number>} dials */
export function makeCustomNightConfig(dials = Object.fromEntries(AI_DIALS.map(dial => [dial, AI_10_20]))) {
  return validateCustomNightConfig({ schema: CUSTOM_NIGHT_SCHEMA, version: 1,
    dials: { ...dials }, puppet: PUPPET_AI });
}

function readbackFields(fields, label) {
  if (!isRecord(fields)) fail(`${label} must be an object`);
  for (const dial of AI_DIALS) {
    const item = fields[dial];
    if (!isRecord(item)) fail(`${label}.${dial} is required`);
    box(item.box, `${label}.${dial}.box`);
    if (!Number.isInteger(item.maxValue) || item.maxValue < 0 || item.maxValue > AI_10_20)
      fail(`${label}.${dial}.maxValue must be an integer in 0..${AI_10_20}`);
  }
  return fields;
}

/**
 * Validate calibration produced by the guided preflight.  Every dial has an
 * increment control and a readback box; a calibration without either is not a
 * usable Custom Night setup and must not reach a live port.
 */
/** @param {any} value @param {{targetBuild?: string}} options */
export function validateCustomNightCalibration(value, { targetBuild } = {}) {
  if (!isRecord(value) || value.schema !== CUSTOM_NIGHT_CALIBRATION_SCHEMA || value.version !== 1)
    fail('calibration schema/version mismatch');
  text(value.build, 'calibration.build');
  if (targetBuild !== undefined && value.build !== targetBuild)
    fail(`calibration.build must match ${targetBuild}`);
  if (!isRecord(value.menu) || value.menu.target !== 'customNight') fail('menu.customNight target is required');
  point(value.menu.point, 'menu.point');
  if (!Number.isInteger(value.menu.holdMs) || value.menu.holdMs < 1 || value.menu.holdMs > 1000)
    fail('menu.holdMs must be an integer in 1..1000');
  point(value.start?.point, 'start.point');
  if (!Number.isInteger(value.start?.holdMs) || value.start.holdMs < 1 || value.start.holdMs > 1000)
    fail('start.holdMs must be an integer in 1..1000');
  if (!isRecord(value.dials)) fail('dial calibration is required');
  for (const dial of AI_DIALS) {
    const item = value.dials[dial];
    if (!isRecord(item)) fail(`dials.${dial} calibration is required`);
    point(item.increment, `dials.${dial}.increment`);
    point(item.decrement, `dials.${dial}.decrement`);
  }
  readbackFields(value.readback, 'readback');
  text(value.titleModel, 'titleModel');
  text(value.configModel, 'configModel');
  return value;
}

/** The exact operator checklist needed to create the one missing artifact. */
/** @param {{targetBuild?: string}} options */
export function guidedCalibrationSteps({ targetBuild } = {}) {
  return Object.freeze([
    `Verify the installed package is com.scottgames.fnaf2 at ${targetBuild ?? 'the target build'}.`,
    'Verify landscape/full display, perspective effect, controller size, and language settings match the device profile.',
    'Capture and label the title screen with Custom Night visible; record its measured target point and title-model threshold.',
    'Open Custom Night and record increment/decrement points for every ten named dials.',
    'Record one readback box and digit threshold for every dial; do not infer positions from neighbouring rows.',
    'Record the Start point and hold duration, then perform one readback-only 10/20 configuration check.',
    'Persist the calibration artifact and rerun campaign preflight; no game input is allowed before every check is PASS.',
  ]);
}

/**
 * Set all ten dials from an observed starting state using only calibrated
 * increment/decrement points, then require a fresh full readback. The caller
 * owns the physical tap and visual-read ports; this routine owns the bounded
 * state transition and cannot silently assume that a dial started at zero.
 * @param {{target?: any, calibration?: any, targetBuild?: string, tap?: Function, readback?: Function, maxSteps?: number}} options
 */
export async function configureCustomNight({ target, calibration, targetBuild, tap, readback,
  maxSteps = AI_DIALS.length * AI_10_20 } = {}) {
  const expected = makeCustomNightConfig(target?.dials);
  validateCustomNightCalibration(calibration, { targetBuild });
  if (typeof tap !== 'function' || typeof readback !== 'function')
    throw new TypeError('custom night configuration requires tap and readback ports');
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 400)
    throw new TypeError('custom night maxSteps must be an integer in 1..400');
  const initial = await readback({ phase: 'before', expected });
  if (!isRecord(initial) || initial.status !== 'PASS' || !isRecord(initial.dials))
    throw new Error('custom night initial readback is not confirmed');
  let steps = 0;
  for (const dial of AI_DIALS) {
    if (!Number.isInteger(initial.dials[dial]) || initial.dials[dial] < 0 || initial.dials[dial] > AI_10_20)
      throw new Error(`custom night initial readback is invalid for ${dial}`);
    const difference = expected.dials[dial] - initial.dials[dial];
    const pointToTap = difference >= 0 ? calibration.dials[dial].increment : calibration.dials[dial].decrement;
    for (let step = 0; step < Math.abs(difference); step += 1) {
      steps += 1;
      if (steps > maxSteps) throw new Error('custom night configuration exceeded the step budget');
      await tap({ dial, point: pointToTap, holdMs: calibration.dials[dial].holdMs ?? 33 });
    }
  }
  const finalReadback = await readback({ phase: 'after', expected });
  if (!isRecord(finalReadback) || finalReadback.status !== 'PASS' || finalReadback.puppet !== PUPPET_AI ||
      AI_DIALS.some(dial => finalReadback.dials?.[dial] !== expected.dials[dial]))
    throw new Error('custom night final readback does not match the requested 10/20 configuration');
  return { status: 'PASS', dials: { ...expected.dials }, puppet: PUPPET_AI,
    readback: { status: 'PASS', dials: { ...finalReadback.dials }, puppet: finalReadback.puppet }, steps };
}
