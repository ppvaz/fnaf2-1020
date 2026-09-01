/**
 * Logical-time trajectory dispatcher. It schedules semantic commands through
 * an injected actuator; it never knows coordinates, adb, HID, or strategy.
 * CONTRACT:trajectory-v1 CONTRACT:actuator-v1.
 */
import { validateActuationResult, validateControlCommand, validateMeasurement } from '@fnaf2-1020/core/contracts';

export function validateTrajectory(trajectory) {
  if (!trajectory || trajectory.schema !== 'trajectory-v1' || typeof trajectory.id !== 'string')
    throw new TypeError('trajectory schema or id is invalid');
  if (!Array.isArray(trajectory.commands) || trajectory.commands.length > 256)
    throw new TypeError('trajectory commands must be a bounded array');
  let previous = -Infinity;
  for (const command of trajectory.commands) {
    validateControlCommand(command);
    const value = command.requestedAt.value;
    if (command.deadline && command.deadline.clock !== command.requestedAt.clock) throw new TypeError('trajectory deadline must use the requested clock');
    if (command.deadline && command.deadline.value < value) throw new TypeError('trajectory deadline precedes requested time');
    if (value < previous) throw new TypeError('trajectory commands are not ordered');
    previous = value;
  }
  return trajectory;
}

/** @param {any} options */
export async function dispatchTrajectory(trajectory, options = {}) {
  const {
    actuator, supervisor, signal, clock = () => performance.now(), clockName = 'device-monotonic-ms',
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    advance, observe, requireObserved = false,
  } = options;
  validateTrajectory(trajectory);
  if (!actuator || typeof actuator.apply !== 'function') throw new TypeError('trajectory actuator is required');
  if (typeof clock !== 'function' || typeof sleep !== 'function') throw new TypeError('trajectory clock and sleep must be functions');
  if (requireObserved && typeof observe !== 'function') throw new TypeError('live trajectory requires a sensor/detector observer');
  const results = [];
  let virtualNow = -Infinity;
  let cleanupDone = false;
  const now = () => Math.max(virtualNow, clock());
  const rejected = (command, reason) => ({ schema: 'actuation-result-v1', commandId: command.id,
    status: 'REJECTED', backend: actuator.id ?? 'unknown', uncertaintyMs: 0, reason });
  const cleanup = async reason => {
    if (cleanupDone) return;
    cleanupDone = true;
    supervisor?.abort?.(reason);
    if (typeof actuator.abort !== 'function' || typeof actuator.releaseAll !== 'function')
      throw new Error('trajectory abort requires actuator.abort and actuator.releaseAll');
    await actuator.abort(reason);
    await actuator.releaseAll();
  };
  try {
    for (const command of trajectory.commands) {
      if (signal?.aborted) { await cleanup('signal-aborted'); break; }
      if (command.requestedAt.clock !== clockName)
        throw new TypeError(`trajectory clock ${command.requestedAt.clock} does not match executor clock ${clockName}`);
      let current = now();
      if (current < command.requestedAt.value) {
        const delay = command.requestedAt.value - current;
        if (typeof advance === 'function') {
          await advance(delay);
          virtualNow = command.requestedAt.value;
        } else {
          await sleep(delay);
        }
        current = now();
        if (current < command.requestedAt.value)
          throw new Error(`executor clock did not advance to requested time for ${command.id}`);
      }
      if (command.deadline && current > command.deadline.value) {
        results.push(rejected(command, 'deadline-expired'));
        continue;
      }
      const measurement = observe ? await observe({ command, at: current }) : null;
      if (measurement) {
        validateMeasurement(measurement);
        if (requireObserved && measurement.state !== 'OBSERVED') {
          results.push(rejected(command, 'observation-unknown'));
          await cleanup('observation-unknown');
          break;
        }
      } else if (requireObserved) {
        results.push(rejected(command, 'observation-missing'));
        await cleanup('observation-missing');
        break;
      }
      const approved = supervisor?.review ? supervisor.review(command) : command;
      if (!approved) {
        results.push(rejected(command, 'supervisor-rejected'));
        continue;
      }
      const result = await actuator.apply(approved);
      validateActuationResult(result);
      const completed = now();
      if (command.deadline && completed > command.deadline.value &&
          !['REJECTED', 'FAILED', 'UNKNOWN'].includes(result.status)) {
        results.push({ ...result, status: 'UNKNOWN', reason: 'deadline-expired-during-actuation',
          uncertaintyMs: Math.max(result.uncertaintyMs, completed - command.deadline.value) });
      } else {
        results.push(result);
      }
    }
  } catch (error) {
    await cleanup(error.message);
    throw error;
  }
  return results;
}
