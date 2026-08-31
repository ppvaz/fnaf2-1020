/** Bounded deterministic interlock for semantic commands. CONTRACT:supervisor-v1. */
import { validateControlCommand } from '@fnaf2-1020/core/contracts';

export class SafetySupervisor {
  constructor({ profile, maxActions = 256, dryRun = true } = {}) {
    if (!profile || typeof profile !== 'object') throw new TypeError('supervisor needs a resolved profile');
    if (!Number.isInteger(maxActions) || maxActions < 1) throw new RangeError('maxActions must be positive');
    this.profile = profile;
    this.maxActions = maxActions;
    this.dryRun = dryRun;
    this.count = 0;
    this.aborted = false;
  }

  review(command) {
    if (this.aborted) return null;
    validateControlCommand(command);
    if (this.count >= this.maxActions) return null;
    const control = command.action.control;
    if (!this.profile.capabilities.controls.includes(control)) return null;
    this.count += 1;
    return command;
  }

  abort() { this.aborted = true; }

  status() {
    return { schema: 'supervisor-status-v1', dryRun: this.dryRun, actions: this.count, aborted: this.aborted, profile: this.profile.id };
  }
}
