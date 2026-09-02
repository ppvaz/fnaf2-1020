#!/usr/bin/env node
// Capture bounded host/device wall-clock samples for stock-APK seed recovery.
// This samples time only; it does not inspect or modify the game process.
import { AdbDeviceBridge } from '../../apps/device/src/adb-bridge.js';

const args = process.argv.slice(2);
const arg = name => {
  const prefix = `--${name}=`;
  const inline = args.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const serial = arg('serial');
if (!serial) {
  process.stderr.write('usage: seed-clock.mjs --serial SERIAL [--samples N] [--interval-ms N]\n');
  process.exitCode = 2;
} else {
  const samples = Number(arg('samples') ?? 1);
  const intervalMs = Number(arg('interval-ms') ?? 0);
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 100)
    throw new TypeError('--samples must be an integer in 1..100');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0 || intervalMs > 60000)
    throw new TypeError('--interval-ms must be an integer in 0..60000');
  const bridge = new AdbDeviceBridge({ serial, adb: arg('adb') ?? 'adb' });
  const rows = [];
  for (let index = 0; index < samples; index++) {
    rows.push(await bridge.clockSample());
    if (index + 1 < samples && intervalMs > 0)
      await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  process.stdout.write(JSON.stringify({
    schema: 'device-clock-samples-v1', version: 1, serial, samples: rows,
  }, null, 2) + '\n');
}
