import assert from 'node:assert/strict';
import { dispatchTrajectory } from '../src/scheduler/scheduler.js';

const command = (id, at, deadline = at + 10) => ({
  schema: 'control-command-v1', id, action: { kind: 'press', control: 'mask' },
  requestedAt: { clock: 'device-monotonic-ms', value: at },
  deadline: { clock: 'device-monotonic-ms', value: deadline },
  source: { controller: 'scheduler-test' },
});
const trajectory = commands => ({ schema: 'trajectory-v1', id: 'trajectory-test', commands });
const result = id => ({ schema: 'actuation-result-v1', commandId: id, status: 'SENT', backend: 'fixture', uncertaintyMs: 0 });

let current = 0;
const sent = [];
const cleanup = [];
const actuator = {
  id: 'fixture',
  async apply(value) { sent.push({ id: value.id, at: current }); return result(value.id); },
  abort(reason) { cleanup.push(`abort:${reason}`); },
  releaseAll() { cleanup.push('release'); },
};
const outputs = await dispatchTrajectory(trajectory([command('a', 10), command('b', 20)]), {
  actuator, clock: () => current, advance: async ms => { current += ms; },
});
assert.deepEqual(sent, [{ id: 'a', at: 10 }, { id: 'b', at: 20 }]);
assert.equal(outputs.every(item => item.status === 'SENT'), true);

current = 30;
const late = await dispatchTrajectory(trajectory([command('late', 10, 15)]), { actuator, clock: () => current });
assert.equal(late[0].status, 'REJECTED');
assert.equal(late[0].reason, 'deadline-expired');

current = 0;
let observed = 0;
const blocked = await dispatchTrajectory(trajectory([command('unknown', 0)]), {
  actuator, clock: () => current, requireObserved: true,
  observe: async () => ({ schema: 'measurement-v1', id: `m-${++observed}`, signal: 'visual', state: 'UNKNOWN', reason: 'fixture-unknown', confidence: 0, observedAt: { clock: 'device-monotonic-ms', value: 0 }, receivedAt: { clock: 'device-monotonic-ms', value: 0 }, source: { sensor: 'fixture', detector: 'fixture' } }),
});
assert.equal(blocked[0].reason, 'observation-unknown');
assert.deepEqual(cleanup.at(-2), 'abort:observation-unknown');
assert.equal(cleanup.at(-1), 'release');
console.log('runtime scheduler: temporal dispatch, deadline refusal, observation gate, and cleanup pass');
