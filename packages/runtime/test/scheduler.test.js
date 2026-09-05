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
// A slow read must not inject a late toggle, or allow a dependent later row.
const observedMeasurement = () => ({ schema: 'measurement-v1', id: 'observed',
  signal: 'monitorUp', state: 'OBSERVED', value: true, confidence: 1,
  observedAt: { clock: 'device-monotonic-ms', value: 0 },
  receivedAt: { clock: 'device-monotonic-ms', value: current },
  source: { sensor: 'fixture', detector: 'fixture' } });
current = 0;
const before = sent.length;
const expired = await dispatchTrajectory(trajectory([command('slow-read', 0, 10), command('dependent', 20)]), {
  actuator, clock: () => current, requireObserved: true,
  observe: async () => { current = 11; return observedMeasurement(); },
});
assert.equal(sent.length, before, 'neither the expired toggle nor its dependent row may send');
assert.equal(expired[0].reason, 'deadline-expired-during-observation');
assert.deepEqual(cleanup.slice(-2), ['abort:deadline-expired-during-observation', 'release']);
const controller = new AbortController();
current = 0;
await dispatchTrajectory(trajectory([command('cancel-read', 0)]), {
  actuator, clock: () => current, signal: controller.signal,
  observe: async () => { controller.abort(); return observedMeasurement(); },
});
assert.equal(sent.length, before, 'cancellation during capture must be checked before input');
assert.deepEqual(cleanup.slice(-2), ['abort:signal-aborted', 'release']);
console.log('runtime scheduler: temporal dispatch, post-observation deadline/cancellation, and cleanup pass');
