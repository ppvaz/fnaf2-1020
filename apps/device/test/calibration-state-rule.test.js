/** Calibration-state rule conformance. All grids and rules are synthetic:
 * nothing here measures a handset, and an unfitted or refused artifact can
 * never become an OBSERVED state. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calibrationStateRuleDigest, maskRuleDigest,
  parseCalibrationStateRule, measureCalibrationState } from '@fnaf2-1020/adapters';
import { monitorRuleDigest } from '@fnaf2-1020/adapters';
import { composeSeamFixtureLive } from '../src/live-seam-composition.js';

const cell = (red, green, blue) => (red << 16) | (green << 8) | blue;
const grid = new Array(180).fill(cell(40, 40, 40));
// Monitor UP: cell 10 shows the map (present anchor high), cell 20 is the
// covered office (absent anchor reads its low/up side).
grid[10] = cell(200, 200, 120);
grid[20] = cell(10, 10, 10);
// Mask OFF: cell 30 has no overlay (present anchor low), cell 40 shows the
// office (absent anchor reads its high/not-up side).
grid[30] = cell(40, 40, 40);
grid[40] = cell(200, 200, 120);

const monitorRule = { schema: 'monitor-rule-v1', schema_version: 1, status: 'calibrated',
  fact: { id: 'monitorUp', labels: ['down', 'mask', 'up'],
    unknown_reasons: ['frame-stale', 'frame-dark', 'ambiguous-threshold', 'grid-unavailable'] },
  sensor: { geometry: [2400, 1080], sampling: 'helper-grid-20x9-cell-center' },
  adapter: { anchors: [
    { cell: 10, feature: 'yellowness', kind: 'present', rule: { kind: 'threshold', threshold: 30, refuse_band: 5 }, separation_margin: 40 },
    { cell: 20, feature: 'luma', kind: 'absent', rule: { kind: 'threshold', threshold: 60, refuse_band: 10 }, separation_margin: 90 },
  ], guard: { kind: 'floor', feature: 'helper_grid_mean_luma', min: 5, reason: 'frame-dark' } } };
const maskRule = { schema: 'mask-rule-v1', schema_version: 1, status: 'calibrated',
  fact: { id: 'maskOn', labels: ['off', 'on'],
    unknown_reasons: ['frame-dark', 'ambiguous-threshold', 'grid-unavailable'] },
  sensor: { geometry: [2400, 1080], sampling: 'helper-grid-20x9-cell-center' },
  adapter: { anchors: [
    { cell: 30, feature: 'yellowness', kind: 'present', rule: { kind: 'threshold', threshold: 30, refuse_band: 5 }, separation_margin: 40 },
    { cell: 40, feature: 'luma', kind: 'absent', rule: { kind: 'threshold', threshold: 60, refuse_band: 10 }, separation_margin: 90 },
  ], guard: { kind: 'floor', feature: 'helper_grid_mean_luma', min: 5, reason: 'frame-dark' } } };
const stateRule = { schema: 'calibration-state-v1', schema_version: 1, status: 'calibrated',
  fact: { id: 'calibrationState', labels: ['NIGHT', 'UP', 'DOWN', 'ON', 'OFF'] },
  screen: { identity: 'FNAF2_NIGHT' },
  monitor: { rule: monitorRule, digest: monitorRuleDigest(monitorRule) },
  mask: { rule: maskRule, digest: maskRuleDigest(maskRule) } };

const parsed = parseCalibrationStateRule(stateRule);
assert.equal(calibrationStateRuleDigest(parsed), calibrationStateRuleDigest(stateRule));
assert.equal(parsed.monitor.digest, monitorRuleDigest(monitorRule));

const snapshot = { screen: 'FNAF2_NIGHT', ageUs: 1000, seq: 7, gridSeq: 7, cells: grid };
const observed = measureCalibrationState(snapshot, parsed);
assert.equal(observed.signal, 'calibrationState');
assert.equal(observed.state, 'OBSERVED');
assert.deepEqual(observed.value, { screen: 'NIGHT', monitor: 'UP', mask: 'OFF' });

// Mask on, monitor down: invert both anchor pairs and the frame resolves.
const maskOnGrid = [...grid];
maskOnGrid[10] = cell(10, 10, 10);
maskOnGrid[20] = cell(200, 200, 120);
maskOnGrid[30] = cell(210, 170, 120);
maskOnGrid[40] = cell(15, 15, 15);
const masked = measureCalibrationState({ ...snapshot, cells: maskOnGrid }, parsed);
assert.deepEqual(masked.value, { screen: 'NIGHT', monitor: 'DOWN', mask: 'ON' });

// Any UNKNOWN refuses the whole state; both sub-rules must resolve.
assert.equal(measureCalibrationState({ ...snapshot, screen: 'FNAF2_MENU' }, parsed).state, 'UNKNOWN');
assert.equal(measureCalibrationState({ ...snapshot, ageUs: 900000 }, parsed).state, 'UNKNOWN');
const ambiguous = [...grid];
ambiguous[30] = cell(160, 160, 130); // yellowness 30: inside the refuse band
assert.equal(measureCalibrationState({ ...snapshot, cells: ambiguous }, parsed).reason, 'ambiguous-threshold');
assert.equal(measureCalibrationState({ ...snapshot, gridSeq: 6 }, parsed).reason, 'grid-seq-mismatch');
assert.equal(measureCalibrationState(snapshot, null).reason, 'calibration-refused');

// Refused artifacts are evidence, never rules.
for (const patch of [
  { schema: 'calibration-state-v2' }, { schema_version: 2 }, { status: 'refitted', reason: 'x' },
  { fact: { id: 'monitorUp', labels: ['NIGHT', 'UP', 'DOWN', 'ON', 'OFF'] } },
  { screen: { identity: 'FNAF2_MENU' } },
  { monitor: { rule: monitorRule, digest: '0'.repeat(64) } },
  { mask: { rule: maskRule, digest: 'f'.repeat(64) } },
  { mask: { rule: { ...maskRule, status: 'exploratory' }, digest: maskRuleDigest({ ...maskRule, status: 'exploratory' }) } },
]) assert.throws(() => parseCalibrationStateRule({ ...stateRule, ...patch }), /calibration-state-v1/);
assert.throws(() => parseCalibrationStateRule({ ...stateRule,
  mask: { rule: { ...maskRule, adapter: { ...maskRule.adapter, anchors: maskRule.adapter.anchors.slice(0, 1) } },
    digest: maskRuleDigest({ ...maskRule, adapter: { ...maskRule.adapter, anchors: maskRule.adapter.anchors.slice(0, 1) } }) } }),
  /at least two anchors/);

// The live seam composition gate: binding, digest match, and qualification.
const handset = JSON.parse(await readFile(new URL('../profiles/hid-mediaprojection.json', import.meta.url), 'utf8'));
const digest = calibrationStateRuleDigest(stateRule);
const spec = JSON.parse(await readFile(new URL('../fixtures/seam-calibration.json', import.meta.url), 'utf8'));
const artifactRoot = await mkdtemp(join(tmpdir(), 'fnaf2-live-seam-'));
const boundProfile = { ...handset, calibrations: { ...handset.calibrations, 'calibration-state': digest } };

// Unbound profile keeps refusing live calibration.
await assert.rejects(() => composeSeamFixtureLive({ profile: handset, spec, stateRule: null, artifactRoot }),
  /positive office\/mask state calibration is not bound/);
// Bound profile with a mismatched artifact refuses composition.
await assert.rejects(() => composeSeamFixtureLive({ profile: { ...handset,
  calibrations: { ...handset.calibrations, 'calibration-state': '0'.repeat(64) } }, spec, stateRule, artifactRoot }),
  /digest does not match/);
// Fully bound: the campaign completes and stays UNVERIFIED.
const qualified = await composeSeamFixtureLive({ profile: boundProfile, spec, stateRule, artifactRoot });
assert.equal(qualified.result.outcome, 'UNVERIFIED');
assert.equal(qualified.result.calibration.workflow, 'COMPLETED');
assert.equal(qualified.result.calibration.calibration, 'UNVERIFIED');
// Missing or foreign qualification records refuse the live gate.
await assert.rejects(() => composeSeamFixtureLive({ profile: boundProfile, spec, stateRule, artifactRoot,
  qualification: { schema: 'qualification-v1', verdict: 'QUALIFIED' } }), /seam actuator qualification/);
await assert.rejects(() => composeSeamFixtureLive({ profile: boundProfile, spec, stateRule, artifactRoot,
  bindProfileHash: 'fnv1a-deadbeef' }), /profile-bound/);

console.log('calibration-state rule: binding, both-positive resolution, and live seam gates pass');
