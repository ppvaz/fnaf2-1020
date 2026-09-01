/**
 * Authenticated cue-helper control protocol codec.  The request function is
 * injected by the device composition root (loopback or forwarded socket), so
 * this adapter contains no adb, shell, strategy, or policy selection.
 * CONTRACT:cue-helper-control-v1.
 */

const bounded = value => typeof value === 'string' && value.length <= 4096;

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
  const cells = [];
  for (let index = 2; index < tokens.length; index += 1) {
    if (!/^[0-9a-f]{6}$/.test(tokens[index])) throw new Error('cue-helper grid cell is malformed');
    cells.push(parseInt(tokens[index], 16));
  }
  if (cells.length !== 180) throw new TypeError('cue-helper grid must carry the 180-cell sensor');
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
  watch(action) {
    if (action !== 'status' && !/^[0-9a-f]{64}$/.test(action)) throw new TypeError('cue-helper watch action is invalid');
    return parseCueResponse(this.request(`WATCH ${this.token} ${action}`));
  }
  read() { return parseCueResponse(this.request(`READ ${this.token}`)); }

  /** A transport measurement is fresh only when helper explicitly says so. */
  monitorMeasurement(snapshot = {}) {
    const ageUs = Number(snapshot.ageUs);
    const value = snapshot.monitorUp;
    if (!Number.isFinite(ageUs) || ageUs < 0 || ageUs > this.maxAgeUs || !['true', 'false'].includes(value))
      return { signal: 'monitorUp', state: 'UNKNOWN', reason: 'monitor-state-unavailable' };
    return { signal: 'monitorUp', state: 'OBSERVED', value: value === 'true', confidence: 1 };
  }
}
