/**
 * Campaign-specific readiness gate. Basic ADB readiness is not enough for an
 * unattended two-night run: this also checks the measured Custom Night UI,
 * a bound full-night artifact, proof adapters, and a qualified local runner.
 * CONTRACT:device-campaign-preflight-v1.
 */
import { validateQualification } from '@fnaf2-1020/runtime';
import { stableHash } from '@fnaf2-1020/core/contracts';
import { validateCustomNightCalibration } from './custom-night.js';
import { validateCampaignSpec } from './campaign.js';

export const CAMPAIGN_PREFLIGHT_SCHEMA = 'device-campaign-preflight-v1';
const check = (id, status, detail) => Object.freeze({ id, status, detail });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function statusOf(checks) {
  if (checks.some(item => item.status === 'FAIL')) return 'FAIL';
  if (checks.some(item => item.status === 'HOLD' || item.status === 'UNKNOWN')) return 'HOLD';
  return 'READY';
}

/**
 * Evaluate all campaign gates without opening a transport or sending input.
 * The result is deliberately useful as the output of one guided preflight.
 */
/** @param {{spec?: any, device?: any, profile?: any, calibration?: any,
 * bundle?: any, qualification?: any, machineOnly?: boolean, executor?: any}} options */
export function evaluateCampaignPreflight({ spec, device, profile, calibration,
  bundle, qualification, machineOnly = false, executor } = {}) {
  validateCampaignSpec(spec);
  const checks = [];
  const deviceChecks = Array.isArray(device?.checks) ? device.checks : [];
  checks.push(...deviceChecks);
  if (device?.status !== 'READY') checks.push(check('adb-campaign-device', device?.status ?? 'HOLD', device?.reason ?? 'device-preflight-not-ready'));
  else checks.push(check('adb-campaign-device', 'PASS', device.serial));

  const custom = spec.nights.find(target => target.mode === 'custom');
  if (custom) {
    if (!calibration) checks.push(check('custom-menu-calibration', 'HOLD', 'guided calibration artifact is missing'));
    else {
      try {
        validateCustomNightCalibration(calibration, { targetBuild: spec.target.build });
        checks.push(check('custom-menu-calibration', 'PASS', calibration.schema));
      } catch (error) { checks.push(check('custom-menu-calibration', 'FAIL', error.message)); }
    }
  }

  const boundNights = new Set(Array.isArray(bundle?.plans) ? bundle.plans.map(plan => plan.night) : []);
  for (const target of spec.nights) {
    const plan = bundle?.plans?.find(item => item.night === target.night);
    if (!plan) checks.push(check(`night-${target.night}-artifact`, 'HOLD', 'full-night compiled artifact is not bound'));
    else if (stableHash(plan.timing) !== stableHash(target.timing))
      checks.push(check(`night-${target.night}-artifact`, 'FAIL', 'artifact timing does not match campaign timing'));
    else checks.push(check(`night-${target.night}-artifact`, 'PASS', plan.sha256 ?? 'compiled'));
  }
  if (boundNights.size !== spec.nights.length) checks.push(check('campaign-artifacts', 'HOLD', 'one artifact per requested night is required'));

  const proof = isRecord(executor) && executor.terminal === true && executor.save === true;
  checks.push(check('terminal-proof', proof ? 'PASS' : 'HOLD', proof ? '6 AM and save proof ports declared' : 'terminal and save proof ports are not composed'));
  checks.push(check('campaign-ports', executor?.portsReady === true ? 'PASS' : 'HOLD',
    executor?.portsReady === true ? 'all ordered campaign ports declared' : 'one or more ordered campaign ports are missing'));

  const machineClaim = bundle?.machine?.claimLevel === 'MODEL_ONLY';
  if (machineOnly) {
    checks.push(check('machine-only-ack', machineClaim ? 'PASS' : 'FAIL', machineClaim
      ? 'explicit MODEL_ONLY machine-input experiment; human/qualification promotion suppressed'
      : 'machine-only mode requires a MODEL_ONLY bundle'));
  } else if (profile?.limits?.dryRunOnly === true) checks.push(check('qualified-live-profile', 'HOLD', 'resolved profile is marked dryRunOnly'));
  else if (!qualification) checks.push(check('qualified-live-profile', 'HOLD', 'DEVICE_MEASURED qualification artifact is missing'));
  else {
    try {
      validateQualification(qualification);
      checks.push(check('qualified-live-profile', qualification.verdict === 'PASS' && qualification.claimLevel === 'DEVICE_MEASURED' ? 'PASS' : 'FAIL', {
        verdict: qualification.verdict, claimLevel: qualification.claimLevel,
      }));
      if (bundle?.artifact) {
        const bound = qualification.policyHash === bundle.artifact.winnerHash &&
          qualification.modelHash === bundle.artifact.engineHash;
        checks.push(check('qualification-binding', bound ? 'PASS' : 'FAIL', bound ? 'bundle winner/model hashes match' : 'qualification is not bound to bundle winner/model'));
      }
    } catch (error) { checks.push(check('qualified-live-profile', 'FAIL', error.message)); }
  }
  checks.push(check('device-local-scheduler', executor?.deviceLocal === true ? 'PASS' : 'HOLD',
    executor?.deviceLocal === true ? 'full-night timing is device-local' : 'host round-trip scheduler is not accepted'));
  return Object.freeze({ schema: CAMPAIGN_PREFLIGHT_SCHEMA, version: 1, status: statusOf(checks),
    serial: device?.serial ?? null, checks, readyForUnattended: statusOf(checks) === 'READY' });
}
