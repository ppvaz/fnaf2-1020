import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeCampaignSpec } from '../src/campaign.js';
import { validateCampaignBundle } from '../src/campaign-bundle.js';
import { composeCampaignPorts } from '../src/campaign-composition.js';

const profile = JSON.parse(await readFile(fileURLToPath(new URL('../profiles/fixture-hid-screencap.json', import.meta.url)), 'utf8'));
const full = makeCampaignSpec({ profile: profile.id, targetBuild: profile.targetBuild });
const spec = { ...full, nights: [full.nights[0]] };
const block = { schema: 'artifact-action-block-v1', id: 'opening', cycle: 'opening', atMs: 0,
  actions: [{ schema: 'artifact-action-v1', id: 'opening-action', cycle: 'opening', atMs: 0,
    kind: 'press', control: 'mask', requiresMonitorUp: false, durationMs: 33 }] };
const bundle = validateCampaignBundle({ spec, plans: [{ night: 6, timing: spec.nights[0].timing,
  cycles: { opening: { blocks: [block] }, toys: { blocks: [block] } } }] });
let request;
const composed = composeCampaignPorts({ spec, bundle, profile,
  devicePreflight: async () => ({ status: 'READY', serial: 'fixture' }),
  menu: async ({ target }) => ({ target: target.menuTarget, visible: true, selected: true }),
  intro: async ({ target }) => ({ night: target.night, identity: target.mode, observed: true }),
  terminal: async ({ target }) => ({ night: target.night, identity: target.mode, outcome: 'sixam', sixAm: true }),
  terminalVerification: async () => ({ sixAm: true, positive: true }),
  save: async () => ({ cursorNight: 7, observed: true }),
  retryReady: async () => ({ menuReady: true }),
  localExecutor: { execute: async value => { request = value; return { status: 'COMPLETED', outcome: 'UNVERIFIED' }; },
    abort: async () => {}, releaseAll: async () => {} },
});
const result = await composed.runner.run();
assert.equal(result.state, 'COMPLETE');
assert.deepEqual(result.completedNights, [6]);
assert.equal(result.attempts[0].save.cursorNight, 7);
assert.equal(request.artifact.plans[0].timing.stopAtMs, 420000);
assert.equal(request.mode, 'live');
console.log('campaign composition: bundle-to-local-executor binding and result handoff pass');
