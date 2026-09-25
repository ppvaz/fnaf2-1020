// CONTRACT:supervisor-v1 conformance: the interlock passes only valid commands for controls the
// profile offers, stops at its action budget, and passes nothing after an abort.
import assert from 'node:assert/strict';
import { SafetySupervisor } from '../src/safety/supervisor.js';

const command = (id, control = 'mask') => ({
  schema: 'control-command-v1', id, action: { kind: 'press', control },
  requestedAt: { clock: 'device-monotonic-ms', value: 0 },
  deadline: { clock: 'device-monotonic-ms', value: 10 },
  source: { controller: 'supervisor-test' },
});
const profile = { id: 'fixture', capabilities: { controls: ['mask', 'monitor'] } };

assert.throws(() => new SafetySupervisor({}), /resolved profile/);
assert.throws(() => new SafetySupervisor({ profile, maxActions: 0 }), /maxActions/);

const supervisor = new SafetySupervisor({ profile, maxActions: 2 });
assert.equal(supervisor.review(command('a')).id, 'a');
assert.equal(supervisor.review(command('light', 'hallLight')), null, 'a control the profile does not offer is refused');
assert.throws(() => supervisor.review({ ...command('bad'), schema: 'nope' }), 'a malformed command is an error, not a refusal');
assert.equal(supervisor.review(command('b', 'monitor')).id, 'b');
assert.equal(supervisor.review(command('c')), null, 'the action budget is a hard stop');
assert.deepEqual(supervisor.status(), { schema: 'supervisor-status-v1', dryRun: true, actions: 2, aborted: false, profile: 'fixture' });

const aborted = new SafetySupervisor({ profile });
aborted.abort('test');
assert.equal(aborted.review(command('d')), null, 'nothing passes after an abort');
assert.equal(aborted.status().aborted, true);
console.log('supervisor: profile controls, action budget and abort are enforced');
