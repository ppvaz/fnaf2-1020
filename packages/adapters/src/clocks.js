/** Injected monotonic/logical clocks; scheduling never calls wall time directly. */
import { ClockPort } from '@fnaf2-1020/core/timing';

export class Clock extends ClockPort {
  constructor({ name, read }) {
    super();
    if (typeof name !== 'string' || typeof read !== 'function') throw new TypeError('clock needs a name and read function');
    this.name = name; this.read = read;
  }
  now() {
    const value = this.read();
    if (!Number.isFinite(value) || value < 0) throw new Error(`${this.name} returned an invalid time`);
    return { clock: this.name, value };
  }
}

/** Map a capture interval, not a receipt timestamp. No extrapolation across
 * validity windows or sensor restarts. Both domains use milliseconds; offset,
 * rate and their uncertainty come from an explicit calibration artifact.
 * @param {any} stamp @param {any} options
 */
export function mapClockInterval(stamp, options = {}) {
  const { targetClock, targetSession, sourceSession, uncertaintyMs, mapping } = options;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const fail = reason => { throw new Error(`clock mapping: ${reason}`); };
  const clocks = ['host-monotonic-ms', 'device-monotonic-ms'];
  if (!clocks.includes(stamp?.clock) || !clocks.includes(targetClock) ||
      !finite(stamp.value) || stamp.value < 0 || !finite(uncertaintyMs) || uncertaintyMs < 0 ||
      typeof sourceSession !== 'string' || !sourceSession || typeof targetSession !== 'string' || !targetSession)
    fail('invalid clock, capture time or uncertainty');
  if (stamp.value - uncertaintyMs < 0 || !finite(stamp.value + uncertaintyMs)) fail('invalid capture interval');
  // Domain names alone do not identify a timebase: two Android boots can
  // both report device-monotonic-ms while referring to different instants.
  if (stamp.clock === targetClock && sourceSession === targetSession) return {
    clock: targetClock, earliestMs: stamp.value - uncertaintyMs,
    latestMs: stamp.value + uncertaintyMs, uncertaintyMs, mappingId: null,
  };
  if (mapping?.schema !== 'clock-map-v1' || typeof mapping.id !== 'string' || !mapping.id ||
      typeof mapping.evidenceId !== 'string' || !mapping.evidenceId ||
      mapping.sourceClock !== stamp.clock || mapping.targetClock !== targetClock ||
      mapping.sourceSession !== sourceSession || mapping.targetSession !== targetSession)
    fail('missing mapping or source-session mismatch');
  for (const field of ['sourceAtMs', 'targetAtMs', 'rate', 'errorMs', 'rateErrorPpm', 'validFromMs', 'validUntilMs'])
    if (!finite(mapping[field]) || mapping[field] < 0) fail(`invalid ${field}`);
  if (mapping.rate <= 0 || mapping.validFromMs > mapping.sourceAtMs ||
      mapping.sourceAtMs > mapping.validUntilMs ||
      stamp.value - uncertaintyMs < mapping.validFromMs ||
      stamp.value + uncertaintyMs > mapping.validUntilMs)
    fail('outside calibrated validity interval');
  const delta = stamp.value - mapping.sourceAtMs;
  const value = mapping.targetAtMs + mapping.rate * delta;
  const error = mapping.errorMs + mapping.rate * uncertaintyMs
    + (Math.abs(delta) + uncertaintyMs) * mapping.rateErrorPpm / 1e6;
  if (!finite(value) || !finite(error) || !finite(value + error) || value - error < 0) fail('invalid mapped interval');
  return { clock: targetClock, earliestMs: value - error, latestMs: value + error,
    uncertaintyMs: error, mappingId: mapping.id };
}
