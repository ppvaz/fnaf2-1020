/**
 * Logical-time trajectory dispatcher. It schedules semantic commands through
 * an injected actuator; it never knows coordinates, adb, HID, or strategy.
 * CONTRACT:trajectory-v1 CONTRACT:actuator-v1.
 */
import { validateActuationResult, validateControlCommand } from '@fnaf2-1020/core/contracts';

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

export async function dispatchTrajectory(trajectory, { actuator, supervisor, signal } = {}) {
  validateTrajectory(trajectory);
  if (!actuator || typeof actuator.apply !== 'function') throw new TypeError('trajectory actuator is required');
  const results = [];
  for (const command of trajectory.commands) {
    if (signal?.aborted) break;
    const approved = supervisor?.review ? supervisor.review(command) : command;
    if (!approved) {
      results.push({ schema: 'actuation-result-v1', commandId: command.id, status: 'REJECTED', backend: actuator.id ?? 'unknown', uncertaintyMs: 0, reason: 'supervisor-rejected' });
      continue;
    }
    const result = await actuator.apply(approved);
    validateActuationResult(result);
    results.push(result);
  }
  return results;
}
