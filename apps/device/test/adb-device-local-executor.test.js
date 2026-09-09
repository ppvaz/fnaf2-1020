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
    block('toy-hallvent', 1050, [action('toy-hallvent-action', 'compound', 'hall', 1050,
      { compound: 'hallvent', ventControl: 'ventR', durationMs: 33, requiresMonitorUp: false })]),
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
    nightGo: '/data/local/tmp/fnaf2-modern-night-go-test',
    gateGo: '/data/local/tmp/fnaf2-modern-gate-go-test',
    gateFix: '/data/local/tmp/fnaf2-modern-gate-fix-test',
  },
});
// The cycle-boundary gate is placed only where the plan already idles, so no
// authored contact moves, and it asserts the plan's own mask belief there.
const gateRequest = structuredClone(armRequest);
gateRequest.artifact.plans[0].timing = {
  periodMs: 4000, loopStartMs: 0, stopAtMs: 12000, observeUntilMs: 16000, idleUntilMs: 0,
};
gateRequest.blocks = [gateRequest.blocks[0],
  block('toy-mask', 2600, [action('toy-mask-action', 'press', 'mask', 2600,
    { targetMaskOn: true, durationMs: 33 })]),
  block('toy-wind', 3000, [action('toy-wind-action', 'hold', 'wind', 3000,
    { durationMs: 33, requiresMonitorUp: true })])];
const gateSchedule = compileDeviceLocalHidSchedule(gateRequest, { readyDelayMs: 6000 });
const gates = gateSchedule.gated.gates;
assert.ok(gates.length >= 2, 'each idle cycle boundary must offer a gate');
assert.ok(gates.every(entry => entry.budgetMs === 1200),
  'every gate must reserve the same measured observe/correct/verify budget');
assert.ok(gates.every(entry => entry.believedMaskOn === true),
  "a gate must carry the plan's own mask belief at that instant");
assert.equal(gateSchedule.gated.remainderSegments.length, gates.length + 1,
  'the stream must be split into one more segment than it has gates');
assert.ok(gateSchedule.gated.maskCorrection.length > 0,
  'the corrective contact must be compiled from the authored mask press');
// The gate is carved out of existing idle: it never displaces a contact.
for (const entry of gates)
  assert.ok(gateRequest.blocks.every(item => item.actions.every(inner =>
    inner.atMs !== entry.gateAtMs)), 'a gate must not land on an authored contact');

// Timing neutrality is the whole claim: walk the gated stream the way the
// phone will -- delays run, each gate consumes exactly its budget -- and every
// authored contact must still land on the instant the plan authored it.
{
  let cursor = gateSchedule.gated.armReadyAtMs;
  const contacts = [];
  gateSchedule.gated.remainderSegments.forEach((segment, index) => {
    for (const raw of segment) {
      const item = JSON.parse(raw);
      if (item.command === 'delay') cursor += item.duration;
      else if (item.command === 'report' && item.report[1] > 0) contacts.push(Math.round(cursor));
    }
    const entry = gateSchedule.gated.gates[index];
    if (entry) cursor = entry.gateAtMs + entry.budgetMs;
  });
  assert.equal(cursor, gateSchedule.plannedUntilMs,
    'a gated stream must still end on the observation envelope');
  assert.ok(contacts.includes(2600) && contacts.includes(3000),
    'gating must not move the authored mask and wind contacts');
}

assert.match(armRemote, /sleep 6/, 'the gated stream must place setup delay before the start marker');
assert.match(armRemote, /cat "\$gate_correction"/,
  'the gated stream must be able to emit the corrective contact on demand');
assert.match(armRemote, /rm -f "\$gate_go"/,
  'each released gate must consume its marker so the next one blocks');
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

// The effect ledger retains semantic targets in both directions. In
// particular, a maskraise contains two distinct contacts: mask off at its
// start and monitor up only at its declared gap.
const effectRequest = structuredClone(request);
effectRequest.artifact.plans[0].timing = {
  periodMs: 1000, loopStartMs: 0, stopAtMs: 1000, observeUntilMs: 1600, idleUntilMs: 0,
};
effectRequest.blocks = [{ schema: 'artifact-action-block-v1', id: 'effect-opening',
  cycle: 'opening', night: 6, atMs: 0, actions: [
    action('effect-monitor-down', 'ensure', 'monitor', 0,
      { cycle: 'opening', targetMonitorUp: false, durationMs: 33 }),
    action('effect-mask-up', 'press', 'mask', 100,
      { cycle: 'opening', targetMaskOn: true, durationMs: 33 }),
    action('effect-monitor-up', 'ensure', 'monitor', 200,
      { cycle: 'opening', targetMonitorUp: true, durationMs: 33 }),
    action('effect-mask-down', 'press', 'mask', 300,
      { cycle: 'opening', targetMaskOn: false, durationMs: 33 }),
  ] },
  // A night is only runnable with a repeatable cycle beside its opening. This
  // wind hold carries no monitor/mask target, so the ledger below stays
  // exactly the four authored transitions.
  block('effect-steady', 400, [action('effect-wind', 'hold', 'wind', 400, { durationMs: 33 })])];
const effectSchedule = compileDeviceLocalHidSchedule(effectRequest, { readyDelayMs: 1 });
assert.deepEqual(effectSchedule.monitorTransitions.map(item => [item.actionId, item.atMs, item.targetMonitorUp]), [
  ['effect-monitor-down', 0, false], ['effect-monitor-up', 200, true],
], 'the compiled ledger must retain monitor-down and monitor-up targets');
assert.deepEqual(effectSchedule.maskTransitions.map(item => [item.actionId, item.atMs, item.targetMaskOn]), [
  ['effect-mask-up', 100, true], ['effect-mask-down', 300, false],
], 'the compiled ledger must retain mask-on and mask-off targets');

const fakeRoot = mkdtempSync(join(tmpdir(), 'fnaf2-modern-executor-'));
const fakeAdb = join(fakeRoot, 'adb');
writeFileSync(fakeAdb, '#!/bin/sh\ncase "$*" in *" logcat "*|*" test -e "*|*" touch "*) exit 0;; esac\ncat >/dev/null\nsleep 10\n');
chmodSync(fakeAdb, 0o755);
const effectAdb = join(fakeRoot, 'effect-adb');
writeFileSync(effectAdb, '#!/bin/sh\ncase "$*" in *" logcat "*) echo "I am_anr : [0,1,com.scottgames.fnaf2,0,Input dispatching timed out]"; exit 0;; *" test -e "*|*" touch "*) exit 0;; esac\ncat >/dev/null\nsleep 3\n');
chmodSync(effectAdb, 0o755);
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

  let controlSequence = 0;
  const effectLog = [];
  const effects = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: effectAdb,
    readyDelayMs: 1, pollMs: 250, observe: async () => 'night',
    onEvent: event => effectLog.push(event),
    observeControlState: async () => ({ sequence: ++controlSequence, ageUs: 10,
      screen: 'FNAF2_NIGHT', monitorUp: true, maskOn: false, maskEvidence: 'fixture' }) });
  await effects.execute(effectRequest);
  const effectResults = Object.fromEntries(effectLog
    .filter(event => event.type === 'control.effect.result')
    .map(event => [event.actionId, event]));
  assert.equal(effectResults['effect-monitor-down']?.status, 'MISSING',
    'a confirmed monitor-up after a monitor-down target must be logged as a missing effect');
  assert.equal(effectResults['effect-monitor-up']?.status, 'PASS',
    'a confirmed monitor-up must acknowledge the monitor-up target');
  assert.equal(effectResults['effect-mask-up']?.status, 'MISSING',
    'a confirmed mask-off after a mask-on target must be logged as a missing effect');
  assert.equal(effectResults['effect-mask-down']?.status, 'PASS',
    'a confirmed mask-off must acknowledge the mask-off target');
  assert.equal(effectResults['effect-mask-down']?.evidence, 'fixture',
    'mask effect results must retain their evidence qualification');
  const passLatency = effectResults['effect-monitor-up'].latency;
  assert.ok(passLatency.lowerMs <= passLatency.upperMs,
    'a measured effect latency must be a bracket, not a point');
  assert.equal(passLatency.atFirstFrame, true,
    'a target already held on the first observed frame must be marked as indistinguishable');
  assert.equal(effectResults['effect-monitor-down'].latency, null,
    'a missing effect must not report a latency it never observed');
  assert.ok(effectResults['effect-monitor-down'].sampleCount <= 6,
    'a missing effect must not spend more than its read budget');
  // The observation window is derived from the plan: the next authored
  // transition of the same signal, never a settle constant.
  const monitorDownExpected = effectLog.find(event => event.type === 'control.effect.expected' &&
    event.actionId === 'effect-monitor-down');
  assert.equal(monitorDownExpected.windowEndAt - monitorDownExpected.contactAt, 200,
    'a monitor window must end at the next authored monitor transition');

  // A capture whose sequence never advances cannot confirm or refute anything.
  const stalledLog = [];
  const stalled = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: effectAdb,
    readyDelayMs: 1, pollMs: 250, observe: async () => 'night',
    onEvent: event => stalledLog.push(event),
    observeControlState: async () => ({ sequence: 7, ageUs: 10,
      screen: 'FNAF2_NIGHT', monitorUp: true, maskOn: false, maskEvidence: 'fixture' }) });
  await stalled.execute(effectRequest);
  const stalledResult = stalledLog.find(event => event.type === 'control.effect.result' &&
    event.actionId === 'effect-monitor-up');
  assert.equal(stalledResult.status, 'UNKNOWN',
    'a stalled helper capture must refuse, not confirm a target from one frame');
  assert.equal(stalledResult.reason, 'insufficient-frames');

  // Which detector answered travels with the observation: the camera panel
  // and the office HUD see opposite halves of the monitor state.
  const sourcedLog = [];
  let sourcedSequence = 0;
  const sourced = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: effectAdb,
    readyDelayMs: 1, pollMs: 250, observe: async () => 'night',
    onEvent: event => sourcedLog.push(event),
    observeControlState: async () => ({ sequence: ++sourcedSequence, ageUs: 10,
      screen: 'UNKNOWN', monitorUp: true, monitorSource: 'camera-panel',
      panelSequence: 900 + sourcedSequence, maskOn: false, maskEvidence: 'fixture' }) });
  await sourced.execute(effectRequest);
  const sourcedResult = sourcedLog.find(event => event.type === 'control.effect.result' &&
    event.actionId === 'effect-monitor-up');
  assert.equal(sourcedResult.status, 'PASS',
    'a camera panel observation must be able to acknowledge a monitor-up target');
  assert.equal(sourcedResult.samples[0].monitorSource, 'camera-panel',
    'the deciding detector must be retained in the sample');
  assert.equal(sourcedResult.samples[0].panelSequence, 900 + sourcedResult.samples[0].sequence,
    'the camera read sequence must be retained beside the frame sequence it was paired with');

  const anrEvent = sourcedLog.find(event => event.type === 'device.anr');
  assert.ok(anrEvent, 'every run must record its ANR query, hit or not');
  assert.equal(anrEvent.count, anrEvent.lines.length);

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
  assert.ok(armLog.find(event => event.type === 'arm.verified').elapsedMs < 7000,
    'a slow lifecycle observer must not starve the native arm verifier after the night gate');

  const armFail = new AdbDeviceLocalArtifactExecutor({ serial: 'fixture-device', adb: fakeAdb,
    readyDelayMs: 1, pollMs: 250,
    observe: async () => 'night',
    observeArm: async () => ({ sequence: ++armSequence, highlights: ['cam:9', 'cam:11'], viewing: null }) });
  await assert.rejects(() => armFail.execute(armRequest), /camera arm verification missed/,
    'a CAM09 + CAM11 observation must never be accepted for a CAM08 arm');
} finally {
  rmSync(fakeRoot, { recursive: true, force: true });
}

console.log('device-local HID executor: semantic schedule, contact discipline, and bounded timing pass');
