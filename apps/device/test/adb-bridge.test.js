import assert from 'node:assert/strict';
import { AdbDeviceBridge, parseAdbDevices } from '../src/adb-bridge.js';
import { AdbCueHelperPort, parseCueHelperEndpoint } from '../src/physical-ports.js';

assert.deepEqual(parseAdbDevices('List of devices attached\nusb-1\tdevice product/foo transport_id:1\noffline\toffline\n'), [
  { serial: 'usb-1', status: 'device', details: ['product/foo', 'transport_id:1'] },
  { serial: 'offline', status: 'offline', details: [] },
]);
assert.deepEqual(parseCueHelperEndpoint('I/FnafCueHelper: control=DEGRADED port=49707 token=0123456789abcdef0123456789abcdef\n'), {
  port: 49707, token: '0123456789abcdef0123456789abcdef',
});
assert.throws(() => parseCueHelperEndpoint('control=READY port=1 token=short'), /endpoint has no bounded/);
assert.throws(() => new AdbCueHelperPort({ serial: 'usb-1' }).request('SHELL anything'), /outside the authenticated/);

const noAdb = new AdbDeviceBridge({ run: async () => ({ ok: false, code: 'ENOENT', stdout: '', stderr: 'adb missing' }) });
assert.deepEqual(await noAdb.preflight({ targetBuild: 'com.scottgames.fnaf2:2.0.7+26' }), {
  schema: 'device-preflight-v1', version: 1, status: 'HOLD', reason: 'adb-unavailable',
  checks: [{ id: 'adb-device', status: 'HOLD', detail: 'adb missing' }], devices: [],
});

const run = async (args, options = {}) => {
  if (args.includes('exec-out')) {
    assert.equal(options.maxBuffer, 16 * 1024 * 1024,
      'full-resolution PNG capture must have a bounded buffer above 2 MB');
    return { ok: true, stdout: Buffer.from('png'), stderr: '' };
  }
  if (args[0] === 'devices') return { ok: true, stdout: 'List of devices attached\nusb-1\tdevice usb:1-1\n', stderr: '' };
  if (args.at(-1) === 'get-state') return { ok: true, stdout: 'device\n', stderr: '' };
  if (args.includes('pm')) return { ok: true, stdout: 'package:/data/app/com.scottgames.fnaf2/base.apk\n', stderr: '' };
  if (args.includes('dumpsys') && args.includes('package')) return { ok: true, stdout: 'versionCode=26 versionName=2.0.7\n', stderr: '' };
  if (args.includes('power')) return { ok: true, stdout: 'mWakefulness=Awake\n', stderr: '' };
  if (args.includes('window')) return { ok: true, stdout: 'mCurrentFocus=Window{ com.scottgames.fnaf2/.MainActivity }\nisKeyguardShowing=false\nmInputRestricted=false\n', stderr: '' };
  if (args.includes('wm')) return { ok: true, stdout: 'Physical size: 1080x2400\n', stderr: '' };
  if (args.includes('ls')) return { ok: true, stdout: '/system/bin/hid\n', stderr: '' };
  if (args.includes('pidof')) return { ok: true, stdout: '1234\n', stderr: '' };
  if (args.includes('logcat')) return { ok: true, stdout: 'I/FnafCueHelper: control=READY port=49707 token=0123456789abcdef0123456789abcdef\n', stderr: '' };
  if (args.includes('date')) return { ok: true, stdout: '1760000000123\n', stderr: '' };
  if (args.at(-1)?.includes('boot_id')) return { ok: true, stdout: '377068.03 7654321.00\nb0c1d2e3-1111-2222-3333-444455556666\n', stderr: '' };
  throw new Error(`unexpected adb ${args.join(' ')}`);
};
const bridge = new AdbDeviceBridge({ serial: 'usb-1', run });
const ready = await bridge.preflight({ targetBuild: 'com.scottgames.fnaf2:2.0.7+26' });
assert.equal(ready.status, 'READY');
assert.equal(ready.serial, 'usb-1');
assert.ok(ready.checks.every(item => item.status === 'PASS'));

const clock = await bridge.clockSample();
assert.equal(clock.status, 'READY');
assert.equal(clock.serial, 'usb-1');
assert.equal(clock.deviceMs, 1760000000123);
assert.ok(clock.roundTripMs >= 0);
assert.ok(clock.uncertaintyMs >= 1);
assert.equal(clock.deviceWindow.startMs, clock.deviceMs - clock.uncertaintyMs);
assert.equal(clock.deviceWindow.endMs, clock.deviceMs + clock.uncertaintyMs);

const uptime = await bridge.uptimeSample();
assert.equal(uptime.status, 'READY');
assert.equal(uptime.schema, 'device-uptime-sample-v1');
assert.equal(uptime.serial, 'usb-1');
assert.equal(uptime.bootId, 'b0c1d2e3-1111-2222-3333-444455556666');
assert.equal(uptime.sourceMs, 377068030);
assert.ok(uptime.targetAfterMs >= uptime.targetBeforeMs);
assert.equal(uptime.quantizationMs, 5);
const garbageUptime = new AdbDeviceBridge({ serial: 'usb-1',
  run: async args => args.includes('uptime') ? { ok: true, stdout: 'garbage\n', stderr: '' } :
    { ok: true, stdout: '', stderr: '' } });
const unparseable = await garbageUptime.uptimeSample();
assert.equal(unparseable.status, 'HOLD');
assert.equal(unparseable.reason, 'device-uptime-unparseable');
const missingUptime = new AdbDeviceBridge({ serial: undefined,
  run: async () => ({ ok: false, code: 'ENOENT', stdout: '', stderr: 'adb missing' }) });
const held = await missingUptime.uptimeSample();
assert.equal(held.status, 'HOLD');
assert.equal(held.reason, 'adb-unavailable');
const captured = await bridge.capturePng('usb-1');
assert.deepEqual(captured, Buffer.from('png'));

console.log('adb bridge: closed command set, selection, build, lock, focus, HID, and helper gates pass');
