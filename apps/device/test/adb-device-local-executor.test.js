import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stableHash } from '@fnaf2-1020/core/contracts';
import { AdbDeviceLocalArtifactExecutor, compileDeviceLocalHidSchedule, renderDeviceLocalScript } from '../src/adb-device-local-executor.js';
import { expandNightBlocks } from '../src/device-local-executor.js';

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
assert.deepEqual(events[0].feature_reports, [{ id: 1, data: [0] }],
  'the gameplay HID registration must answer Android feature-report queries');
assert.equal(events[1].command, 'delay');
assert.equal(events[1].duration, 6000);
assert.ok(events.some(event => event.command === 'report' && event.report[1] === 2),
  'compound actions must use well-formed two-contact reports');
assert.equal(events.at(-1).command, 'delay');
assert.equal(events.at(-1).duration, 7);

// A non-zero loop start is an idle prefix for the repeatable cycle, not an
// offset to add to the authored opening. This is the Night 1 arm shape: the
// opening must land at t=0 while steady work begins at the 2 AM boundary.
const shiftedRequest = structuredClone(request);
shiftedRequest.artifact.plans[0].timing.loopStartMs = 2000;
const shiftedBlocks = expandNightBlocks(shiftedRequest, 6);
assert.equal(shiftedBlocks[0].cycle, 'opening');
assert.equal(shiftedBlocks[0].scheduleAtMs, 0,
  'opening must remain on the authored night timeline when loopStartMs is non-zero');
assert.equal(shiftedBlocks.find(block => block.cycle === 'toys').scheduleAtMs, 2100,
  'steady blocks must begin at loopStartMs plus their authored offset');
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

const armRequest = structuredClone(request);
armRequest.blocks = [armRequest.blocks[0],
  block('toy-tail', 2500, [action('toy-tail-action', 'hold', 'wind', 2500, { durationMs: 33 })])];
armRequest.artifact.plans[0].armVerification = {
  cameras: ['cam:8', 'cam:11'], viewing: 'cam:11', untilMs: 1000,
};
armRequest.blocks[0].actions.push(
  action('opening-cam11', 'tap', 'cam:11', 200,
    { cycle: 'opening', requiresMonitorUp: true, durationMs: 33 }),
  action('opening-cam8', 'tap', 'cam:8', 250,
    { cycle: 'opening', requiresMonitorUp: true, durationMs: 33 }),
  action('opening-monitor-down', 'ensure', 'monitor', 1200,
    { cycle: 'opening', targetMonitorUp: false, durationMs: 33 }),
  action('opening-monitor-up', 'ensure', 'monitor', 1600,
    { cycle: 'opening', targetMonitorUp: true, durationMs: 33 }),
);
armRequest.blocks[0].actions.push(action('opening-wind', 'hold', 'wind', 2000,
  { cycle: 'opening', durationMs: 33, requiresMonitorUp: true }));
const armSchedule = compileDeviceLocalHidSchedule(armRequest, { readyDelayMs: 6000 });
const armEvents = armSchedule.lines.map(line => JSON.parse(line));
assert.ok(armEvents.some(event => event.command === 'report' && event.report.includes(0)),
  'the CAM08 arm request must compile into the same device-local HID stream');
assert.equal(armSchedule.gated.firstWindAtMs, 2000,
  'the gated schedule must identify the opening wind boundary');
const armRemote = renderDeviceLocalScript(armSchedule, {
  startMarker: '/data/local/tmp/fnaf2-modern-start-test',
  armControl: {
    go: '/data/local/tmp/fnaf2-modern-go-test',
    retry: '/data/local/tmp/fnaf2-modern-retry-test',
    fail: '/data/local/tmp/fnaf2-modern-fail-test',
    rearm: '/data/local/tmp/fnaf2-modern-rearm-test',
  },
});
assert.match(armRemote, /sleep 6/, 'the gated stream must place setup delay before the start marker');
assert.match(armRemote, /arm_retry_signal=/, 'the gated stream must expose a bounded retry signal');
assert.match(armRemote, /cat "\$arm_prefix"/, 'the gated stream must emit the opening prefix first');
assert.match(armRemote, /\) \| \/system\/bin\/hid -/, 'the gated stream must use a shell pipe, not a named fifo');

// Night 1 minimal moves the first wind into the repeat cycle at an absolute
// 140.3 s. The arm compiler must still gate that wind on the opening split.
const delayedArmRequest = structuredClone(armRequest);
delayedArmRequest.artifact.plans[0].timing = {
  periodMs: 5000, loopStartMs: 140000, stopAtMs: 360000,
  observeUntilMs: 420000, idleUntilMs: 0,
};
delayedArmRequest.artifact.plans[0].armVerification = {
  cameras: ['cam:8', 'cam:11'], viewing: 'cam:11', untilMs: 140250,
};
delayedArmRequest.blocks[0].actions = delayedArmRequest.blocks[0].actions
  .filter(item => item.control !== 'wind');
delayedArmRequest.blocks = [delayedArmRequest.blocks[0],
  block('toy-delayed-wind', 300, [action('toy-delayed-wind-action',
    'hold', 'wind', 300, { durationMs: 33, requiresMonitorUp: true })])];
const delayedSchedule = compileDeviceLocalHidSchedule(delayedArmRequest, { readyDelayMs: 6000 });
assert.equal(delayedSchedule.gated.firstWindAtMs, 140300,
  'minimal Night 1 must place its first wind on the expanded repeat timeline');
assert.equal(delayedSchedule.gated.armReadyAtMs, 1633,
  'minimal Night 1 must verify after the opening raise, not after the 140 s idle');

const fakeRoot = mkdtempSync(join(tmpdir(), 'fnaf2-modern-executor-'));
const fakeAdb = join(fakeRoot, 'adb');
writeFileSync(fakeAdb, '#!/bin/sh\ncase "$*" in *" test -e "*|*" touch "*) exit 0;; esac\ncat >/dev/null\nsleep 10\n');
chmodSync(fakeAdb, 0o755);
try {
  let observations = 0;
  const guarded = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    pollMs: 250, observe: async () => { observations += 1; return 'gameover'; } });
  const stopped = await guarded.execute(request);
  assert.equal(stopped.terminal, 'gameover', 'fresh game-over must stop the remote schedule as a failed attempt');
  assert.ok(observations >= 1, 'executor must sample the lifecycle while a schedule is running');

  let startupObservations = 0;
  const startup = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    pollMs: 250, observe: async () => startupObservations++ === 0 ? 'newspaper' : 'night' });
  const startupResult = await startup.execute(request);
  assert.equal(startupResult.outcome, 'UNVERIFIED',
    'the measured newspaper transition must be allowed before the first night frame');

  const dropped = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    pollMs: 250, observe: async () => 'title' });
  await assert.rejects(() => dropped.execute(request), /lifecycle left night state \(title\)/,
    'a positively observed non-night screen must abort the device-local stream');

  let postNightObservations = 0;
  const postNightDrop = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    pollMs: 250, observe: async () => postNightObservations++ === 0 ? 'night' : 'title' });
  await assert.rejects(() => postNightDrop.execute(request), /lifecycle left night state \(title\)/,
    'a title observed after night entry must abort the device-local stream');

  let transientObservations = 0;
  const transientFrame = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    pollMs: 250, observe: async () => transientObservations++ === 0 ? 'static' : 'night' });
  const transientResult = await transientFrame.execute(request);
  assert.equal(transientResult.outcome, 'UNVERIFIED',
    'one bad lifecycle frame must not abort an otherwise live schedule');

  let armSequence = 0;
  const armLog = [];
  const armPass = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    readyDelayMs: 1, pollMs: 250,
    observe: async () => { await new Promise(resolve => setTimeout(resolve, 2500)); return 'night'; },
    onEvent: event => armLog.push(event),
    observeArm: async () => {
      const sequence = ++armSequence;
      return { sequence, highlights: sequence === 2 ? ['cam:9']
        : sequence < 4 ? null : ['cam:8', 'cam:11'], viewing: null };
    } });
  const armed = await armPass.execute(armRequest);
  assert.equal(armed.armVerification.status, 'PASS',
    'an exact CAM08 + CAM11 observation must arm before the schedule continues');
  assert.ok(armSequence >= 5, 'arming requires fresh confirming samples');
  assert.equal(armLog.filter(event => event.type === 'arm.retry').length, 0,
    'UNKNOWN and a single wrong frame must not cause a destructive re-arm');
  assert.ok(armLog.find(event => event.type === 'arm.verified').elapsedMs < 5000,
    'a slow lifecycle observer must not starve the native arm verifier');

  const armFail = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    readyDelayMs: 1, pollMs: 250,
    observeArm: async () => ({ sequence: ++armSequence, highlights: ['cam:9', 'cam:11'], viewing: null }) });
  await assert.rejects(() => armFail.execute(armRequest), /camera arm verification missed/,
    'a CAM09 + CAM11 observation must never be accepted for a CAM08 arm');
} finally {
  rmSync(fakeRoot, { recursive: true, force: true });
}

console.log('device-local HID executor: semantic schedule, contact discipline, and bounded timing pass');
