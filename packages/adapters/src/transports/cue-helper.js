/**
 * Authenticated cue-helper control protocol codec.  The request function is
 * injected by the device composition root (loopback or forwarded socket), so
 * this adapter contains no adb, shell, strategy, or policy selection.
 * CONTRACT:cue-helper-control-v1.
 */

const bounded = value => typeof value === 'string' && value.length <= 4096;
const CAMERA_UNKNOWN_REASONS = new Set([
  'monitor-not-up', 'no-camera-highlight', 'multiple-camera-highlight',
  'ambiguous-threshold', 'feature-missing', 'read-unavailable',
  'read-stale', 'sensor-mismatch', 'calibration-refused',
]);
const BATTERY_UNKNOWN_REASONS = new Set([
  'battery-unavailable', 'feature-missing', 'read-unavailable',
  'read-stale', 'sensor-mismatch', 'screen-identity', 'frame-stale',
  'timestamp-invalid',
]);

export function parseCueResponse(line) {
  if (!bounded(line)) throw new TypeError('cue-helper response is missing or oversized');
  const text = line.trim();
  if (!text.startsWith('OK ')) throw new Error(text.startsWith('ERROR ') ? text : 'cue-helper response is not OK');
  const fields = {};
  for (const token of text.slice(3).split(/\s+/)) {
    const separator = token.indexOf('=');
    if (separator <= 0) continue;
    fields[token.slice(0, separator)] = token.slice(separator + 1);
  }
  return Object.freeze(fields);
}

/**
 * Parse the GRID response: `OK grid=20x9 seq=<n> <180 hex RRGGBB cells>`.
 * The cells are the helper's whole 20x9 point-sampled sensor, row-major;
 * a calibrated anchor indexes this array. CONTRACT:cue-helper-control-v1.
 */
export function parseCueGrid(line) {
  if (!bounded(line)) throw new TypeError('cue-helper grid response is missing or oversized');
  const text = line.trim();
  if (!text.startsWith('OK ')) throw new Error(text.startsWith('ERROR ') ? text : 'cue-helper response is not OK');
  const tokens = text.slice(3).split(/\s+/);
  if (!/^grid=20x9$/.test(tokens[0] ?? '') || !/^seq=\d+$/.test(tokens[1] ?? ''))
    throw new Error('cue-helper grid response is malformed');
  // The helper emits the sensor as ONE concatenated hex run -- 180 cells x 6
  // chars, no separators (helper 0.1.9, confirmed against ZF525F5BH5 and the
  // decoder in tools/device/query-cue-helper.sh). This parser previously split
  // on whitespace and demanded 6-char tokens, a shape only its own fixture
  // ever produced, so every live grid read threw. Joining first accepts the
  // device's run and a separated one alike; the 180-cell length still decides.
  const body = tokens.slice(2).join('');
  if (!/^[0-9a-f]*$/.test(body)) throw new Error('cue-helper grid cell is malformed');
  if (body.length !== 180 * 6) throw new TypeError('cue-helper grid must carry the 180-cell sensor');
  const cells = [];
  for (let index = 0; index < body.length; index += 6) cells.push(parseInt(body.slice(index, index + 6), 16));
  return Object.freeze({ grid: '20x9', seq: Number(tokens[1].slice(4)), cells: Object.freeze(cells) });
}

export class CueHelperControlTransport {
  /** @param {any} options */
  constructor({ request, token, maxAgeUs = 500000 } = {}) {
    if (typeof request !== 'function') throw new TypeError('cue-helper transport needs an injected request function');
    if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) throw new TypeError('cue-helper token must be 128-bit hex');
    this.request = request; this.token = token; this.maxAgeUs = maxAgeUs;
  }

  snapshot() { return parseCueResponse(this.request(`GET ${this.token}`)); }
  grid() { return parseCueGrid(this.request(`GRID ${this.token}`)); }

  /**
   * One observation: the snapshot fields AND the 180-cell sensor from a single
   * locked read on the device, so both describe the same frame.
   *
   * `snapshot()` + `grid()` cannot do this. They are two round trips against a
   * 60 fps capture, and on the moto g56 their sequences agreed 0 times in 12
   * (always 1-2 frames apart), so every detector that needs freshness AND
   * cells refused with `grid-seq-mismatch` and no positive state was reachable.
   * `gridSeq` is set from the same `seq` deliberately: one read, one frame.
   */
  frame() {
    const fields = /** @type {any} */ (parseCueResponse(this.request(`FRAME ${this.token}`)));
    if (fields.grid !== '20x9') throw new Error('cue-helper frame is missing its sensor');
    const body = typeof fields.cells === 'string' ? fields.cells : '';
    if (!/^[0-9a-f]*$/.test(body)) throw new Error('cue-helper frame cell is malformed');
    if (body.length !== 180 * 6) throw new TypeError('cue-helper frame must carry the 180-cell sensor');
    const cells = [];
    for (let index = 0; index < body.length; index += 6) cells.push(parseInt(body.slice(index, index + 6), 16));
    return Object.freeze({ ...fields, gridSeq: fields.seq, cells: Object.freeze(cells) });
  }
  watch(action) {
    if (action !== 'status' && !/^[0-9a-f]{64}$/.test(action)) throw new TypeError('cue-helper watch action is invalid');
    return parseCueResponse(this.request(`WATCH ${this.token} ${action}`));
  }
  read() { return parseCueResponse(this.request(`READ ${this.token}`)); }

  /** Device capture time is not GET's snapshot time or the host request time.
   * Old helpers expose only an integer ageUs: retain the 1 us bracket instead
   * of claiming nanosecond precision. No host/device clock offset is inferred.
   */
  visualAcquisition(snapshot = {}) {
    const integer = value => typeof value === 'string' && /^\d+$/.test(value);
    if (!integer(snapshot.snapshotNs) || !integer(snapshot.ageUs) || !integer(snapshot.seq))
      throw new Error('visual-capture-time-unavailable');
    const sequence = Number(snapshot.seq);
    const snapshotNs = BigInt(snapshot.snapshotNs);
    const ageNs = BigInt(snapshot.ageUs) * 1000n;
    if (!Number.isSafeInteger(sequence) || sequence < 1 || ageNs > snapshotNs)
      throw new Error('visual-capture-time-invalid');
    let captureNs;
    let uncertaintyMs;
    if (snapshot.visualCaptureNs !== undefined) {
      if (!integer(snapshot.visualCaptureNs)) throw new Error('visual-capture-time-invalid');
      captureNs = BigInt(snapshot.visualCaptureNs);
      const measuredAgeNs = snapshotNs - captureNs;
      if (captureNs <= 0n || measuredAgeNs < ageNs || measuredAgeNs >= ageNs + 1000n)
        throw new Error('visual-capture-age-disagrees');
      uncertaintyMs = 0;
    } else {
      captureNs = snapshotNs - ageNs;
      if (captureNs <= 0n) throw new Error('visual-capture-time-invalid');
      uncertaintyMs = 0.001;
    }
    return {
      clock: 'device-monotonic-ms', at: Number(captureNs) / 1e6,
      sourceNs: captureNs.toString(), uncertaintyMs, sequence,
      basis: uncertaintyMs ? 'snapshot-minus-age-upper-bound' : 'image-timestamp',
    };
  }

  /** A transport measurement is fresh only when helper explicitly says so. */
  monitorMeasurement(snapshot = {}) {
    const ageUs = Number(snapshot.ageUs);
    const value = snapshot.monitorUp;
    if (!Number.isFinite(ageUs) || ageUs < 0 || ageUs > this.maxAgeUs || !['true', 'false'].includes(value))
      return { signal: 'monitorUp', state: 'UNKNOWN', reason: 'monitor-state-unavailable' };
    return { signal: 'monitorUp', state: 'OBSERVED', value: value === 'true', confidence: 1 };
  }

  /**
   * Consume the helper's explicit camera fact only while the same fresh
   * snapshot says the monitor is up. This is observation telemetry; it does
   * not emit or select a game control.
   */
  cameraMeasurement(snapshot = {}) {
    const ageUs = Number(snapshot.ageUs);
    if (!Number.isFinite(ageUs) || ageUs < 0) {
      return { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'read-unavailable' };
    }
    if (ageUs > this.maxAgeUs) {
      return { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'read-stale' };
    }
    if (snapshot.monitorUp !== 'true') {
      return { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'monitor-not-up' };
    }
    const value = snapshot.cameraSelected;
    if (value === 'UNKNOWN' || value === undefined) {
      const reason = snapshot.cameraReason;
      return {
        signal: 'cameraSelected', state: 'UNKNOWN',
        reason: typeof reason === 'string' && CAMERA_UNKNOWN_REASONS.has(reason)
          ? reason : 'read-unavailable',
      };
    }
    if (!/^cam:(?:[1-9]|1[0-2])$/.test(value)) {
      return { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'sensor-mismatch' };
    }
    return { signal: 'cameraSelected', state: 'OBSERVED', value, confidence: 1 };
  }

  /**
   * Consume the complete set of highlighted camera buttons. Unlike
   * cameraMeasurement(), this remains OBSERVED when the UI deliberately has
   * two highlights for a split-camera glitch.
   */
  cameraHighlightsMeasurement(snapshot = {}) {
    const unknown = reason => ({ signal: 'cameraHighlights', state: 'UNKNOWN', reason });
    const ageUs = Number(snapshot.ageUs);
    if (!Number.isFinite(ageUs) || ageUs < 0) return unknown('read-unavailable');
    if (ageUs > this.maxAgeUs) return unknown('read-stale');
    if (snapshot.monitorUp !== 'true') return unknown('monitor-not-up');

    // Older helpers only exposed cameraSelected. Preserve a useful singleton
    // observation while newer helpers provide the exact highlighted set.
    const raw = snapshot.cameraHighlights === undefined
      ? snapshot.cameraSelected : snapshot.cameraHighlights;
    if (raw === 'UNKNOWN' || raw === undefined || raw === '') {
      const reason = snapshot.cameraReason;
      return unknown(typeof reason === 'string' && CAMERA_UNKNOWN_REASONS.has(reason)
        ? reason : 'read-unavailable');
    }
    if (typeof raw !== 'string') return unknown('sensor-mismatch');
    const values = raw.split(',');
    if (values.length === 0 || values.some(value => !/^cam:(?:[1-9]|1[0-2])$/.test(value)))
      return unknown('sensor-mismatch');
    const numbers = values.map(value => Number(value.slice(4)));
    if (new Set(numbers).size !== numbers.length) return unknown('sensor-mismatch');
    numbers.sort((a, b) => a - b);
    return {
      signal: 'cameraHighlights', state: 'OBSERVED',
      value: numbers.map(value => `cam:${value}`), confidence: 1,
    };
  }

  /** Consume the game-UI flashlight meter only from a fresh night snapshot. */
  batteryMeasurement(snapshot = {}) {
    const ageUs = Number(snapshot.ageUs);
    if (!Number.isFinite(ageUs) || ageUs < 0) {
      return { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'read-unavailable' };
    }
    if (ageUs > this.maxAgeUs) {
      return { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'read-stale' };
    }
    if (snapshot.screen !== 'FNAF2_NIGHT') {
      return { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'screen-identity' };
    }
    const raw = snapshot.batteryPercent;
    if (raw === undefined || raw === 'UNKNOWN') {
      const reason = snapshot.batteryReason;
      return {
        signal: 'batteryPercent', state: 'UNKNOWN',
        reason: typeof reason === 'string' && BATTERY_UNKNOWN_REASONS.has(reason)
          ? reason : 'read-unavailable',
      };
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 100 || value % 25 !== 0) {
      return { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'sensor-mismatch' };
    }
    return { signal: 'batteryPercent', state: 'OBSERVED', value, confidence: 1 };
  }
}
