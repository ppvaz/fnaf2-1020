/**
 * Place the night schedule's release against the game's own one-second grid.
 *
 * The lifecycle observer still AUTHORIZES the night (the office is up); this
 * decides only WHEN inside that authorization the executor's release fires.
 * Without it the release follows a ~1 Hz screenshot classifier and the phone
 * draws the Night 5 epoch: two of three measured epochs on 2026-09-12 fell in
 * a Balloon Boy loss band.
 *
 * Inputs are the helper's latched onset (device-monotonic, NightOnsetLatch.java)
 * and a device->host offset from `AdbCueHelperPort.probeClock()`; the rule and
 * the release arithmetic live in @fnaf2-1020/adapters/night-onset so the live
 * origin and the post-hoc one are the same definition.
 *
 * Never blocks a night: every refusal releases at once, exactly as before
 * anchoring existed, and names why in an `origin.anchor` event. What the
 * events do NOT claim: the delivered epoch (released - onset, mod 1000) minus
 * the aim is the clock estimate's error plus release jitter. Actuation latency
 * (effect frame minus injection) is a separate quantity and never enters it.
 */
import { anchoredReleaseAt, latchedNightOnsetMs } from '@fnaf2-1020/adapters/night-onset';

const defaultSleep = milliseconds => new Promise(resolve => setTimeout(resolve, Math.max(0, milliseconds)));

/**
 * @param {{
 *   probe: () => Promise<{offsetMs: number, uncertaintyMs: number, rttMs: number, fields: Record<string, string>}>,
 *   release: () => void, onEvent?: (event: any) => void, aimMs: number, notBeforeHostMs: number,
 *   now?: () => number, wallNow?: () => number, sleep?: (ms: number) => Promise<void>,
 *   latchWaitMs?: number, latchPollMs?: number, minLeadMs?: number, maxUncertaintyMs?: number, periodMs?: number,
 * }} options
 */
export async function anchorNightRelease({ probe, release, onEvent = () => {}, aimMs, notBeforeHostMs,
  now = () => performance.now(), wallNow = () => Date.now(), sleep = defaultSleep,
  latchWaitMs = 1500, latchPollMs = 100, minLeadMs = 80, maxUncertaintyMs = 15, periodMs = 1000 }) {
  if (typeof probe !== 'function' || typeof release !== 'function')
    throw new TypeError('night anchor needs probe and release functions');
  if (!Number.isFinite(aimMs) || aimMs < 0 || aimMs >= periodMs)
    throw new RangeError('night anchor aim must lie in [0, period)');
  if (!Number.isFinite(notBeforeHostMs)) throw new TypeError('night anchor needs a finite notBeforeHostMs');

  const fallback = (reason, detail = {}) => {
    onEvent({ type: 'origin.anchor', status: 'unavailable', reason, aimMs, ...detail });
    release();
    return { status: 'unavailable', reason };
  };

  const deadline = now() + latchWaitMs;
  let clock = null;
  let onsetDeviceMs = null;
  let fieldPresent = false;
  let probes = 0;
  for (;;) {
    try { clock = await probe(); }
    catch (error) { return fallback('probe-failed', { error: String(error?.message ?? error), probes }); }
    probes += 1;
    fieldPresent ||= clock.fields?.nightOnsetImageNs !== undefined;
    try { onsetDeviceMs = latchedNightOnsetMs(clock.fields); }
    catch (error) { return fallback('onset-malformed', { error: String(error?.message ?? error), probes }); }
    if (onsetDeviceMs !== null || now() >= deadline) break;
    await sleep(latchPollMs);
  }
  const measured = { probes, offsetMs: clock.offsetMs, uncertaintyMs: clock.uncertaintyMs, rttMs: clock.rttMs };
  if (onsetDeviceMs === null)
    return fallback(fieldPresent ? 'onset-not-latched' : 'helper-has-no-onset', measured);
  if (!(clock.uncertaintyMs <= maxUncertaintyMs))
    return fallback('offset-uncertain', { ...measured, onsetDeviceMs, maxUncertaintyMs });
  const onsetHostMs = onsetDeviceMs + clock.offsetMs;
  if (onsetHostMs < notBeforeHostMs)
    return fallback('onset-predates-intro', { ...measured, onsetDeviceMs, onsetHostMs, notBeforeHostMs });
  const planAt = now();
  if (onsetHostMs > planAt + clock.uncertaintyMs)
    return fallback('onset-in-future', { ...measured, onsetDeviceMs, onsetHostMs, planAt });

  const { releaseHostMs, k } = anchoredReleaseAt({ onsetDeviceMs, deviceToHostOffsetMs: clock.offsetMs,
    aimMs, periodMs, earliestHostMs: planAt + minLeadMs });
  onEvent({ type: 'origin.anchor', status: 'scheduled', aimMs, k, onsetDeviceMs, onsetHostMs, releaseHostMs,
    leadMs: releaseHostMs - planAt, hostClock: 'performance-now-ms', wallMinusHostMs: wallNow() - now(), ...measured });

  // Coarse timer, then short hops: a timer alone can land a few ms late, and
  // those ms are epoch error. The last hops are bounded by ~20 ms of wakes.
  for (;;) {
    const left = releaseHostMs - now();
    if (left <= 0) break;
    await sleep(left > 25 ? left - 20 : 0);
  }
  const firedHostMs = now();
  const firedWallMs = wallNow();
  release();
  const releasedAimMs = ((firedHostMs - onsetHostMs) % periodMs + periodMs) % periodMs;
  onEvent({ type: 'origin.anchor', status: 'released', aimMs, k, releaseHostMs, firedHostMs, firedWallMs,
    lateMs: firedHostMs - releaseHostMs, releasedAimMs, uncertaintyMs: clock.uncertaintyMs });
  return { status: 'released', k, releaseHostMs, firedHostMs, releasedAimMs };
}
