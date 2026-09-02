import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeCampaignSpec } from '../src/campaign.js';
import { configureCustomNight, makeCustomNightConfig, validateCustomNightCalibration } from '../src/custom-night.js';
import { evaluateCampaignPreflight } from '../src/campaign-preflight.js';
import { validateCampaignBundle, makeCampaignExecutionRequest } from '../src/campaign-bundle.js';
import { DeviceLocalArtifactExecutor, expandNightBlocks } from '../src/device-local-executor.js';

const profile = JSON.parse(await readFile(fileURLToPath(new URL('../profiles/fixture-hid-screencap.json', import.meta.url)), 'utf8'));
const spec = makeCampaignSpec({ profile: profile.id, targetBuild: profile.targetBuild });
const block = (id, cycle, atMs) => ({ schema: 'artifact-action-block-v1', id, cycle, atMs,
  actions: [{ schema: 'artifact-action-v1', id: `${id}-action`, cycle, atMs,
    kind: 'press', control: 'mask', requiresMonitorUp: false, durationMs: 33 }] });
const plans = spec.nights.map(target => ({ night: target.night, timing: target.timing,
  cycles: { opening: { blocks: [block(`n${target.night}-opening`, 'opening', 0)] },
    toys: { blocks: [block(`n${target.night}-toys`, 'toys', 1)] } } }));
const bundle = validateCampaignBundle({ spec, plans });
assert.equal(bundle.plans.length, 2);
assert.throws(() => makeCampaignExecutionRequest({ bundle,
  plan: { ...bundle.plans[0], cycles: { ...bundle.plans[0].cycles, opening: { blocks: [] } } }, profile }),
  /not bound immutably/);
const request = makeCampaignExecutionRequest({ bundle, plan: bundle.plans[0], profile,
  mode: 'dry-run', artifact: { winnerHash: 'a'.repeat(64), engineHash: 'b'.repeat(64), profileHash: 'c'.repeat(64) } });
assert.equal(request.artifact.plans[0].night, 6);
const shortPlanRequest = { ...request, artifact: { ...request.artifact,
  plans: [{ ...request.artifact.plans[0], timing: { periodMs: 10, loopStartMs: 0,
    stopAtMs: 30, observeUntilMs: 30, idleUntilMs: 0 } }] },
  blocks: [block('opening', 'opening', 0), block('toys', 'toys', 1)].map(item => ({ ...item, night: 6 })) };
assert.equal(expandNightBlocks(shortPlanRequest, 6).length, 4);

const calibration = { schema: 'custom-night-calibration-v1', version: 1, build: profile.targetBuild,
  menu: { target: 'customNight', point: { x: 1, y: 1 }, holdMs: 100 },
  start: { point: { x: 2, y: 2 }, holdMs: 100 },
  dials: Object.fromEntries(Object.keys(makeCustomNightConfig().dials).map(dial => [dial, {
    increment: { x: 3, y: 3 }, decrement: { x: 4, y: 4 },
  }])),
  readback: Object.fromEntries(Object.keys(makeCustomNightConfig().dials).map(dial => [dial, {
    box: { x: 5, y: 5, width: 10, height: 10 }, maxValue: 20,
  }])),
  titleModel: 'title-model-v1', configModel: 'custom-night-model-v1' };
assert.doesNotThrow(() => validateCustomNightCalibration(calibration, { targetBuild: profile.targetBuild }));
const dialTaps = [];
const configured = await configureCustomNight({ target: spec.nights[1], calibration,
  targetBuild: profile.targetBuild, tap: async value => dialTaps.push(value),
  readback: async ({ phase }) => phase === 'before'
    ? { status: 'PASS', dials: Object.fromEntries(Object.keys(spec.nights[1].dials).map(dial => [dial, 0])) }
    : { status: 'PASS', dials: spec.nights[1].dials, puppet: 15 } });
assert.equal(configured.steps, 200);
assert.equal(dialTaps.length, 200);
const held = evaluateCampaignPreflight({ spec, profile, device: { status: 'READY', serial: 'fixture', checks: [] }, calibration, bundle,
  executor: { terminal: true, save: true, deviceLocal: true } });
assert.equal(held.status, 'HOLD', 'fixture profile must never become live-ready');
assert.equal(held.readyForUnattended, false);

let now = 0;
const applied = [];
const executor = new DeviceLocalArtifactExecutor({ now: () => now,
  sleep: async milliseconds => { now += milliseconds; },
  applyBlock: async value => applied.push({ id: value.id, at: now }),
  abort: async () => {}, releaseAll: async () => {} });
const execution = await executor.execute(shortPlanRequest);
assert.equal(execution.outcome, 'UNVERIFIED');
assert.equal(execution.deviceLocal, true);
assert.equal(applied.length, 4, 'the steady block must repeat on each declared period');
assert.equal(now, 30, 'the local clock must cover the full observation envelope');
console.log('campaign infrastructure: custom calibration, bundle binding, preflight hold, and local full-night expansion pass');
