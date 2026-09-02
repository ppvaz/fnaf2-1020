import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stableHash } from '@fnaf2-1020/core/contracts';
import { AdbDeviceLocalArtifactExecutor, compileDeviceLocalHidSchedule, renderDeviceLocalScript } from '../src/adb-device-local-executor.js';

const profile = JSON.parse(await readFile(new URL('../profiles/hid-mediaprojection.json', import.meta.url), 'utf8'));
const timing = { periodMs: 1000, loopStartMs: 0, stopAtMs: 3000, observeUntilMs: 3000, idleUntilMs: 0 };
const action = (id, kind, control, atMs, extra = {}) => ({
  schema: 'artifact-action-v1', id, cycle: 'toys', atMs, kind, control, ...extra,
});
const block = (id, atMs, actions) => ({ schema: 'artifact-action-block-v1', id,
  cycle: 'toys', night: 6, atMs, actions });
const request = {
  schema: 'device-executor-v1', version: 1, mode: 'live',
  artifact: { winnerHash: 'a'.repeat(64), engineHash: 'b'.repeat(64), profileHash: 'c'.repeat(64),
    profileStableHash: stableHash(profile), plans: [{ night: 6, sha256: 'd'.repeat(64), timing }] },
  profile, limits: { maxActions: 64, maxDurationMs: 15000 },
  blocks: [
    { schema: 'artifact-action-block-v1', id: 'opening-block', cycle: 'opening', night: 6, atMs: 0,
      actions: [action('opening-monitor', 'ensure', 'monitor', 0, { cycle: 'opening', targetMonitorUp: true })] },
    block('toy-simple', 100, [action('toy-simple-action', 'hold', 'wind', 100, { durationMs: 33 })]),
    block('toy-sweep', 300, [action('toy-sweep-action', 'sweep-slot', 'cam:11', 300,
      { selectMs: 33, settleMs: 17, lightMs: 33, requiresMonitorUp: true })]),
    block('toy-hallraise', 500, [action('toy-hallraise-action', 'compound', 'hall', 500,
      { compound: 'hallraise', durationMs: 33, requiresMonitorUp: false, targetMonitorUp: true })]),
    block('toy-maskraise', 700, [action('toy-maskraise-action', 'compound', 'monitor', 700,
      { compound: 'maskraise', gapMs: 200, durationMs: 33, requiresMonitorUp: false, targetMonitorUp: true, targetMaskOn: false })]),
    block('toy-camdrop', 940, [action('toy-camdrop-action', 'compound', 'light', 940,
      { compound: 'camdrop', leadMs: 10, durationMs: 33, tailMs: 10, requiresMonitorUp: true, targetMonitorUp: false })]),
  ],
};

const schedule = compileDeviceLocalHidSchedule(request, { readyDelayMs: 6000 });
assert.equal(schedule.schema, 'device-local-hid-schedule-v1');
assert.equal(schedule.night, 6);
assert.equal(schedule.readyDelayMs, 6000);
assert.ok(schedule.actionCount >= 10, 'opening and steady blocks must expand across the period');
assert.ok(schedule.lines.every(line => !line.includes('"duration":0')),
  'the on-device hid stream must never emit a zero delay');
const events = schedule.lines.map(line => JSON.parse(line));
assert.equal(events[0].command, 'register');
assert.equal(events[1].command, 'delay');
assert.equal(events[1].duration, 6000);
assert.ok(events.some(event => event.command === 'report' && event.report[1] === 2),
  'compound actions must use well-formed two-contact reports');
assert.equal(events.at(-1).command, 'delay');
assert.equal(events.at(-1).duration, 7);
assert.ok(events.every(event => event.command === 'register' || event.command === 'report' || event.command === 'delay'),
  'compiled stream must stay within the closed hid vocabulary');
const remote = renderDeviceLocalScript(schedule);
assert.match(remote, /stream=\/data\/local\/tmp\/fnaf2-modern-hid-\$\$\.jsonl/,
  'remote stream file must remain PID-scoped');
assert.doesNotMatch(remote, /mkfifo|fifo=/,
  'device-local shell must not require named-pipe creation on Android 16');
assert.match(remote, /printf '[^']*'[^\n]+>> \"\$stream\"/,
  'device-local shell must preload the bounded HID stream before starting hid');
assert.ok(remote.indexOf('/system/bin/hid - < "$stream"') < remote.lastIndexOf('wait "$hid_pid"'),
  'device-local shell must start hid from the preloaded stream before waiting');

const fakeRoot = mkdtempSync(join(tmpdir(), 'fnaf2-modern-executor-'));
const fakeAdb = join(fakeRoot, 'adb');
writeFileSync(fakeAdb, '#!/bin/sh\ncat >/dev/null\nsleep 10\n');
chmodSync(fakeAdb, 0o755);
try {
  let observations = 0;
  const guarded = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    pollMs: 250, observe: async () => { observations += 1; return 'gameover'; } });
  const stopped = await guarded.execute(request);
  assert.equal(stopped.terminal, 'gameover', 'fresh game-over must stop the remote schedule as a failed attempt');
  assert.ok(observations >= 1, 'executor must sample the lifecycle while a schedule is running');
} finally {
  rmSync(fakeRoot, { recursive: true, force: true });
}

console.log('device-local HID executor: semantic schedule, contact discipline, and bounded timing pass');
