/**
 * Closed ADB device port for read-only discovery and preflight.
 *
 * This is deliberately not a generic shell wrapper.  Each operation below is
 * a fixed, reviewable command with bounded output and timeout.  Actuation is
 * still supplied by the qualified device composition; merely seeing a phone
 * here never promotes a claim level.
 * CONTRACT:device-adb-preflight-v1.
 */
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCueHelperEndpoint } from './physical-ports.js';

const execFile = promisify(execFileCallback);
const GAME_PACKAGE = 'com.scottgames.fnaf2';
const HELPER_PACKAGE = 'com.fnaf2.cuehelper';
const PRELIGHT_SCHEMA = 'device-preflight-v1';
const CLOCK_SAMPLE_SCHEMA = 'device-clock-sample-v1';
const CAPTURE_MAX_BUFFER = 16 * 1024 * 1024;

const check = (id, status, detail) => Object.freeze({ id, status, detail });

export function parseAdbDevices(text) {
  if (typeof text !== 'string') throw new TypeError('adb devices output must be text');
  return text.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean).map(line => {
    const [serial, status, ...rest] = line.split(/\s+/);
    return { serial, status, details: rest };
  }).filter(device => device.serial && device.status);
}

function packageBuild(text) {
  const versionName = text.match(/\bversionName=([^\s]+)/)?.[1] ?? null;
  const versionCode = text.match(/\bversionCode=(\d+)\b/)?.[1] ?? null;
  return versionName && versionCode ? `${versionName}+${versionCode}` : null;
}

function expectedBuildSuffix(targetBuild) {
  const match = typeof targetBuild === 'string' && targetBuild.match(/^[^:]+:(.+)$/);
  return match?.[1] ?? targetBuild;
}

function focusHas(text, packageName) {
  return typeof text === 'string' && text.split(/\r?\n/).some(line =>
    /mCurrentFocus=/.test(line) && line.includes(packageName));
}

function awakeAndUnlocked(text) {
  if (typeof text !== 'string') return null;
  if (/mWakefulness=Asleep|mWakefulness=Dozing|mDreamingLockscreen=true|isKeyguardShowing=true|mShowingLockscreen=true/i.test(text)) return false;
  if (/mWakefulness=Awake/i.test(text) && /isKeyguardShowing=false|mInputRestricted=false|keyguardgoingaway=false/i.test(text)) return true;
  return null;
}

function readyStatus(checks) {
  if (checks.some(item => item.status === 'FAIL')) return 'FAIL';
  if (checks.some(item => item.status === 'HOLD' || item.status === 'UNKNOWN')) return 'HOLD';
  return 'READY';
}

export class AdbDeviceBridge {
  /** @param {{adb?: string, serial?: string, timeoutMs?: number, maxBuffer?: number, run?: Function}} options */
  constructor({ adb = 'adb', serial, timeoutMs = 10000, maxBuffer = 2 * 1024 * 1024, run } = {}) {
    this.adb = adb; this.serial = serial; this.timeoutMs = timeoutMs; this.maxBuffer = maxBuffer;
    this.runPort = run ?? (async (args, options = {}) => {
      try {
        const result = await execFile(this.adb, args, { encoding: options.encoding === null ? null : (options.encoding ?? 'utf8'),
          timeout: options.timeoutMs ?? this.timeoutMs, maxBuffer: options.maxBuffer ?? this.maxBuffer });
        return { ok: true, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
      } catch (error) {
        return { ok: false, code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message ?? '' };
      }
    });
  }

  async #command(args, options = {}) { return this.runPort(args, options); }

  async devices() {
    const result = await this.#command(['devices', '-l']);
    if (!result.ok) return { status: 'HOLD', reason: 'adb-unavailable', detail: result.stderr };
    return { status: 'READY', devices: parseAdbDevices(result.stdout) };
  }

  async selectDevice() {
    const listed = await this.devices();
    if (listed.status !== 'READY') return listed;
    const ready = listed.devices.filter(device => device.status === 'device');
    if (this.serial) {
      const selected = ready.find(device => device.serial === this.serial);
      return selected ? { status: 'READY', serial: selected.serial, device: selected } :
        { status: 'HOLD', reason: 'requested-device-not-ready', serial: this.serial, devices: listed.devices };
    }
    if (ready.length !== 1) return {
      status: 'HOLD', reason: ready.length === 0 ? 'no-ready-device' : 'multiple-ready-devices',
      devices: listed.devices,
    };
    return { status: 'READY', serial: ready[0].serial, device: ready[0] };
  }

  async #shell(serial, args) { return this.#command(['-s', serial, 'shell', ...args]); }

  /** @param {{targetPackage?: string, targetBuild?: string, requireHelper?: boolean, requireHid?: boolean}} options */
  async preflight({ targetPackage = GAME_PACKAGE, targetBuild, requireHelper = true, requireHid = true } = {}) {
    const selected = await this.selectDevice();
    if (selected.status !== 'READY') return {
      schema: PRELIGHT_SCHEMA, version: 1, status: 'HOLD', reason: selected.reason,
      checks: [check('adb-device', selected.status, selected.detail ?? selected.reason)], devices: selected.devices ?? [],
    };
    const serial = selected.serial;
    const checks = [check('adb-device', 'PASS', serial)];
    const state = await this.#command(['-s', serial, 'get-state']);
    checks.push(check('device-state', state.ok && state.stdout.trim() === 'device' ? 'PASS' : 'FAIL', state.ok ? state.stdout.trim() : state.stderr.trim()));

    const packagePath = await this.#shell(serial, ['pm', 'path', targetPackage]);
    checks.push(check('target-installed', packagePath.ok && /^\s*package:/.test(packagePath.stdout) ? 'PASS' : 'FAIL', targetPackage));
    const dump = await this.#shell(serial, ['dumpsys', 'package', targetPackage]);
    const installedBuild = packageBuild(dump.stdout);
    const expectedBuild = expectedBuildSuffix(targetBuild);
    checks.push(check('target-build', installedBuild && expectedBuild && installedBuild === expectedBuild ? 'PASS' : 'FAIL', { expected: expectedBuild, installed: installedBuild }));

    const power = await this.#shell(serial, ['dumpsys', 'power']);
    const windows = await this.#shell(serial, ['dumpsys', 'window']);
    const unlocked = awakeAndUnlocked(`${power.stdout}\n${windows.stdout}`);
    checks.push(check('awake-unlocked', unlocked === true ? 'PASS' : unlocked === false ? 'FAIL' : 'HOLD', unlocked === null ? 'state-unreadable' : unlocked));
    checks.push(check('game-focused', focusHas(windows.stdout, targetPackage) ? 'PASS' : 'HOLD', targetPackage));

    const display = await this.#shell(serial, ['wm', 'size']);
    const displayMatch = display.stdout.match(/(?:Physical|Override) size:\s*(\d+)x(\d+)/i);
    const geometry = displayMatch ? `${displayMatch[1]}x${displayMatch[2]}` : null;
    const landscapePair = displayMatch && ((displayMatch[1] === '2400' && displayMatch[2] === '1080') ||
      (displayMatch[1] === '1080' && displayMatch[2] === '2400'));
    checks.push(check('display-geometry', landscapePair ? 'PASS' : 'HOLD',
      geometry ?? (display.ok ? 'size-unreadable' : display.stderr.trim())));

    if (requireHid) {
      const hid = await this.#shell(serial, ['ls', '/system/bin/hid']);
      checks.push(check('hid-transport', hid.ok && /\/system\/bin\/hid/.test(hid.stdout) ? 'PASS' : 'FAIL', hid.ok ? hid.stdout.trim() : hid.stderr.trim()));
    }
    if (requireHelper) {
      const helper = await this.#shell(serial, ['pidof', HELPER_PACKAGE]);
      checks.push(check('cue-helper-running', helper.ok && helper.stdout.trim().length > 0 ? 'PASS' : 'HOLD', helper.ok ? helper.stdout.trim() : helper.stderr.trim()));
      if (helper.ok && helper.stdout.trim().length > 0) {
        const endpoint = await this.#shell(serial, ['logcat', '-d', `--pid=${helper.stdout.trim().split(/\s+/)[0]}`, '-v', 'brief', '-s', 'FnafCueHelper:I', '*:S']);
        try { checks.push(check('cue-helper-endpoint', 'PASS', parseCueHelperEndpoint(endpoint.stdout))); }
        catch (error) { checks.push(check('cue-helper-endpoint', 'HOLD', error.message)); }
      }
    }
    return { schema: PRELIGHT_SCHEMA, version: 1, status: readyStatus(checks), serial, checks };
  }

  async capturePng(serial) {
    const result = await this.#command(['-s', serial, 'exec-out', 'screencap', '-p'], {
      encoding: null, timeoutMs: 15000, maxBuffer: CAPTURE_MAX_BUFFER,
    });
    return result.ok && Buffer.isBuffer(result.stdout) ? result.stdout : null;
  }

  /**
   * Read device wall time through one fixed, read-only command. The midpoint
   * and round-trip bound let callers turn a host-triggered night-start marker
   * into a conservative 16-bit seed window without granting shell access.
   *
   * This does not identify when the game seeded its RNG; it only calibrates
   * the host/device clock relationship. The caller must pair it with a
   * separately recorded start marker.
   */
  async clockSample({ serial = this.serial } = {}) {
    let selectedSerial = serial;
    if (!selectedSerial) {
      const selected = await this.selectDevice();
      if (selected.status !== 'READY') return { schema: CLOCK_SAMPLE_SCHEMA, ...selected };
      selectedSerial = selected.serial;
    }
    const beforeEpochMs = Date.now();
    const beforeMonoNs = process.hrtime.bigint();
    const result = await this.#command(
      ['-s', selectedSerial, 'shell', 'date', '+%s%3N'],
      { timeoutMs: Math.min(this.timeoutMs, 5000) });
    const afterMonoNs = process.hrtime.bigint();
    if (!result.ok) return {
      schema: CLOCK_SAMPLE_SCHEMA, status: 'HOLD', serial: selectedSerial,
      reason: 'device-clock-unavailable', detail: result.stderr,
    };
    const text = String(result.stdout).trim();
    if (!/^\d+$/.test(text)) return {
      schema: CLOCK_SAMPLE_SCHEMA, status: 'HOLD', serial: selectedSerial,
      reason: 'device-clock-unparseable', detail: text,
    };
    const roundTripMs = Number(afterMonoNs - beforeMonoNs) / 1e6;
    const hostMidMs = beforeEpochMs + roundTripMs / 2;
    const deviceMs = Number(text);
    const uncertaintyMs = Math.max(1, Math.ceil(roundTripMs / 2) + 1);
    return Object.freeze({
      schema: CLOCK_SAMPLE_SCHEMA, version: 1, status: 'READY', serial: selectedSerial,
      deviceMs, hostBeforeMs: beforeEpochMs, hostMidMs,
      hostAfterMs: beforeEpochMs + roundTripMs, roundTripMs,
      offsetMs: deviceMs - hostMidMs, uncertaintyMs,
      deviceWindow: Object.freeze({
        startMs: Math.max(0, deviceMs - uncertaintyMs),
        endMs: deviceMs + uncertaintyMs,
      }),
    });
  }
}

export const devicePreflightSchema = PRELIGHT_SCHEMA;
export const deviceClockSampleSchema = CLOCK_SAMPLE_SCHEMA;
