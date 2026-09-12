/**
 * ADB-backed physical ports for the modern composition.
 *
 * These ports only open two named channels: `/system/bin/hid -` for the
 * existing HID JSONL protocol and the Cue Helper's authenticated loopback
 * control port. There is intentionally no public command/shell escape hatch.
 * Full-night timing remains owned by a device-local executor, not by a series
 * of host ADB calls.
 * CONTRACT:hid-executor-v1 CONTRACT:cue-helper-control-v1.
 */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { parseCueResponse } from '@fnaf2-1020/adapters/transports/cue-helper';
const HELPER_PACKAGE = 'com.fnaf2.cuehelper';
const READY_DEVICE = 'FNAF Timed Touch';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function endpointError(message) { throw new Error(`cue-helper endpoint: ${message}`); }

/** Parse the latest authenticated Cue Helper endpoint announcement. */
export function parseCueHelperEndpoint(text) {
  if (typeof text !== 'string') endpointError('logcat output is not text');
  const lines = text.split(/\r?\n/).filter(line => /control=(?:READY|DEGRADED)/.test(line));
  const line = lines.at(-1);
  if (!line) endpointError('no READY or DEGRADED endpoint');
  const port = line.match(/\bport=(\d+)\b/)?.[1];
  const token = line.match(/\btoken=([0-9a-f]{32})\b/)?.[1];
  if (!port || !token) endpointError('endpoint has no bounded port/token');
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535)
    endpointError('endpoint port is outside 1..65535');
  return Object.freeze({ port: numericPort, token });
}

/** @param {string} adb @param {string[]} args @param {{timeout?: number, input?: string, encoding?: any}} options */
function runSync(adb, args, { timeout = 5000, input, encoding = 'utf8' } = {}) {
  const output = execFileSync(adb, args, { encoding, input, timeout, maxBuffer: 1024 * 1024 });
  return encoding === null ? output : output.replace(/\r/g, '');
}

// The shell text is fixed here so the port has no caller-controlled shell
// surface. It exists only to perform the authenticated loopback exchange.
const HELPER_QUERY_SCRIPT = `
port="$1"
shift
case "$1" in GET|GRID|FRAME|WATCH|READ) ;; *) exit 64 ;; esac
printf '%s\\n' "$*" | toybox nc -w 2 127.0.0.1 "$port"
`;

/**
 * One timed GET over a host-local forwarded port. The helper stamps
 * `snapshotNs` with System.nanoTime() while answering, so that instant lies
 * inside [sentAt, receivedAt] on the host clock whatever the path's asymmetry:
 * the midpoint is off by at most half the round trip.
 * @param {number} hostPort @param {string} line @param {number} timeoutMs
 */
function timedExchange(hostPort, line, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = connect({ host: '127.0.0.1', port: hostPort });
    let sentAt = null;
    let text = '';
    const timer = setTimeout(() => { socket.destroy(); rejectPromise(new Error('cue-helper clock probe timed out')); }, timeoutMs);
    const settle = (error, value) => {
      clearTimeout(timer);
      socket.destroy();
      if (error) rejectPromise(error); else resolvePromise(value);
    };
    socket.setNoDelay(true);
    socket.on('connect', () => { sentAt = performance.now(); socket.write(`${line}\n`); });
    socket.on('data', chunk => {
      text += chunk.toString('utf8');
      const newline = text.indexOf('\n');
      if (newline < 0) { if (text.length > 65536) settle(new Error('cue-helper clock probe reply is oversized')); return; }
      const receivedAt = performance.now();
      try {
        const fields = parseCueResponse(text.slice(0, newline));
        if (!/^\d+$/.test(fields.snapshotNs ?? '')) throw new Error('cue-helper reply has no snapshotNs');
        const deviceMs = Number(BigInt(fields.snapshotNs)) / 1e6;
        const rttMs = receivedAt - sentAt;
        settle(null, { offsetMs: (sentAt + receivedAt) / 2 - deviceMs, rttMs, fields });
      } catch (error) { settle(error); }
    });
    socket.on('error', error => settle(error));
    socket.on('end', () => settle(new Error('cue-helper closed the clock probe without a reply')));
  });
}

export class AdbCueHelperPort {
  /** @param {{serial: string, adb?: string}} options */
  constructor(options) {
    const { serial, adb = 'adb' } = options ?? {};
    if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('Cue Helper port requires an ADB serial');
    this.serial = serial; this.adb = adb; this.endpoint = null;
  }

  discover() {
    const pid = runSync(this.adb, ['-s', this.serial, 'shell', 'pidof', HELPER_PACKAGE]).trim().split(/\s+/)[0];
    if (!/^\d+$/.test(pid)) endpointError('helper process is not running');
    const log = runSync(this.adb, ['-s', this.serial, 'logcat', '-d', `--pid=${pid}`, '-v', 'brief', '-s', 'FnafCueHelper:I', '*:S']);
    this.endpoint = parseCueHelperEndpoint(log);
    return { ...this.endpoint };
  }

  /** Synchronous by design: CueHelperControlTransport is a bounded request/response codec. */
  request(line) {
    // FRAME is GET and GRID from one locked read on the device. GET+GRID are
    // two round trips whose sequences never agree (measured 0/12 on the moto
    // g56), so a detector needing freshness AND cells can only use FRAME.
    if (typeof line !== 'string' || !/^(?:GET|GRID|FRAME|WATCH|READ) [0-9a-f]{32}(?: status| [0-9a-f]{64})?$/.test(line))
      throw new TypeError('Cue Helper request is outside the authenticated read vocabulary');
    const endpoint = this.endpoint ?? this.discover();
    const args = ['-s', this.serial, 'shell', 'sh', '-s', '--', String(endpoint.port), ...line.split(/\s+/)];
    return runSync(this.adb, args, { timeout: 10000, input: HELPER_QUERY_SCRIPT });
  }

  /**
   * One adb forward to the helper's loopback control port, and timed raw GETs
   * over it. `request()` spawns an adb shell per read (140-240 ms) and cannot
   * bound a clock; over the forward a GET measured RTT min 5.6, p50 9.1, p90
   * 14.6 ms on ZF525F5BH5 (2026-09-12), the five fastest of 40 agreeing on the
   * device->host offset within 0.46 ms. The forward is opened once, so polling
   * the latched night onset costs a socket round trip, not a process spawn.
   * `read()` is one exchange (offset bound RTT/2); `probe()` keeps the fastest
   * of `samples` for the offset and the newest for the fields. Always close().
   * @param {{timeoutMs?: number}} [options]
   */
  openClock({ timeoutMs = 1000 } = {}) {
    const endpoint = this.endpoint ?? this.discover();
    const forwarded = runSync(this.adb, ['-s', this.serial, 'forward', 'tcp:0', `tcp:${endpoint.port}`]).trim().split(/\s+/).at(-1);
    if (!/^\d+$/.test(forwarded ?? '')) throw new Error('cue-helper clock: adb forward returned no host port');
    let closed = false;
    const exchange = async () => {
      if (closed) throw new Error('cue-helper clock is closed');
      const sample = await timedExchange(Number(forwarded), `GET ${endpoint.token}`, timeoutMs);
      return { ...sample, uncertaintyMs: sample.rttMs / 2, hostClock: 'performance-now-ms' };
    };
    return {
      read: exchange,
      /** @param {{samples?: number, spacingMs?: number}} [options] */
      probe: async ({ samples = 8, spacingMs = 15 } = {}) => {
        if (!Number.isInteger(samples) || samples < 1 || samples > 64) throw new TypeError('clock probe samples must be 1..64');
        let best = null;
        let latest = null;
        for (let index = 0; index < samples; index += 1) {
          latest = await exchange();
          if (best === null || latest.rttMs < best.rttMs) best = latest;
          if (index + 1 < samples) await sleep(spacingMs);
        }
        return { offsetMs: best.offsetMs, uncertaintyMs: best.uncertaintyMs, rttMs: best.rttMs,
          samples, hostClock: 'performance-now-ms', fields: latest.fields };
      },
      close: () => {
        if (closed) return;
        closed = true;
        try { runSync(this.adb, ['-s', this.serial, 'forward', '--remove', `tcp:${forwarded}`]); } catch { /* the forward dies with adb */ }
      },
    };
  }

  /** One offset measurement on a short-lived forward. @param {{samples?: number, spacingMs?: number, timeoutMs?: number}} [options] */
  async probeClock({ timeoutMs = 1000, ...options } = {}) {
    const clock = this.openClock({ timeoutMs });
    try { return await clock.probe(options); }
    finally { clock.close(); }
  }
}

export class AdbHidProcess {
  /** @param {{serial: string, adb?: string, readyTimeoutMs?: number}} options */
  constructor(options) {
    const { serial, adb = 'adb', readyTimeoutMs = 12000 } = options ?? {};
    if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('HID port requires an ADB serial');
    this.serial = serial; this.adb = adb; this.readyTimeoutMs = readyTimeoutMs;
    this.child = null; this.failed = null; this.closed = false;
  }

  ensureStarted() {
    if (this.closed) throw new Error('ADB HID process is closed');
    if (this.failed) throw this.failed;
    if (this.child) return;
    const child = spawn(this.adb, ['-s', this.serial, 'shell', '/system/bin/hid', '-'], {
      stdio: ['pipe', 'ignore', 'pipe'], shell: false,
    });
    child.on('error', error => { this.failed = error; });
    child.on('close', code => {
      if (!this.closed && code !== 0) this.failed = new Error(`ADB HID process exited with ${code}`);
      this.child = null;
    });
    this.child = child;
  }

  async write(line) {
    if (typeof line !== 'string' || line.includes('\n') || line.includes('\r'))
      throw new TypeError('HID port accepts one JSONL line at a time');
    this.ensureStarted();
    if (this.failed || !this.child?.stdin) throw this.failed ?? new Error('ADB HID stdin is unavailable');
    if (!this.child.stdin.write(`${line}\n`)) await new Promise((resolve, reject) => {
      this.child.stdin.once('drain', resolve); this.child.stdin.once('error', reject);
    });
  }

  async ready(deviceName = READY_DEVICE) {
    this.ensureStarted();
    const deadline = Date.now() + this.readyTimeoutMs;
    while (Date.now() < deadline) {
      if (this.failed) throw this.failed;
      try {
        const output = runSync(this.adb, ['-s', this.serial, 'shell', 'dumpsys', 'input'], { timeout: 2000 });
        if (output.includes(deviceName)) return;
      } catch { /* a transient dumpsys failure stays inside the bounded wait */ }
      await sleep(100);
    }
    throw new Error('InputReader did not expose the registered HID device before the deadline');
  }

  async close() {
    this.closed = true;
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.stdin?.end();
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  }
}

/** Construct the two named ports consumed by composeModernDevice. */
/** @param {{serial: string, adb?: string}} options */
export function createAdbModernPorts(options) {
  const { serial, adb = 'adb' } = options ?? {};
  const hid = new AdbHidProcess({ serial, adb });
  const cue = new AdbCueHelperPort({ serial, adb });
  return Object.freeze({ hid, cue, close: () => hid.close() });
}
