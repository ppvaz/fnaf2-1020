/**
 * Semantic actuator implementations. Physical encodings are injected at the
 * edge, while every implementation returns the same honest result envelope.
 * CONTRACT:actuator-v1.
 */
import { validateActuationResult, validateControlCommand } from '@fnaf2-1020/core/contracts';
import { Actuator } from '@fnaf2-1020/core/actuation';

export class SimActuator extends Actuator {
  constructor(plant, { id = 'sim-actuator' } = {}) {
    super();
    if (!plant || typeof plant.apply !== 'function') throw new TypeError('SimActuator needs a PlantModel');
    this.id = id; this.plant = plant; this.records = [];
  }

  capabilities() { return { adapter: this.id, verification: 'internal', claimLevel: 'MODEL_ONLY' }; }

  async apply(command) {
    validateControlCommand(command);
    const sentAt = { clock: 'simulator-frame', value: this.plant.frame };
    this.plant.apply(command);
    const result = { schema: 'actuation-result-v1', commandId: command.id, status: 'ACCEPTED', backend: this.id, sentAt, verifiedAt: sentAt, uncertaintyMs: 0 };
    validateActuationResult(result); this.records.push(result); return result;
  }
}

export class FixtureActuator extends Actuator {
  constructor({ id = 'fixture-hid', now = () => 0, fail = false } = {}) {
    super();
    this.id = id; this.now = now; this.fail = fail; this.records = [];
  }

  capabilities() { return { adapter: this.id, verification: 'external', claimLevel: 'FIXTURE' }; }

  async apply(command) {
    validateControlCommand(command);
    const status = this.fail ? 'FAILED' : 'SENT';
    const result = { schema: 'actuation-result-v1', commandId: command.id, status, backend: this.id, sentAt: { clock: 'host-monotonic-ms', value: this.now() }, verifiedAt: null, uncertaintyMs: 1, ...(this.fail ? { reason: 'fixture-fault' } : {}) };
    validateActuationResult(result); this.records.push({ command, result }); return result;
  }
}

export class AdbTapActuator extends FixtureActuator {
  constructor({ transport, controlMap, ...options } = {}) {
    super({ id: 'adb-tap', ...options });
    if (!transport || typeof transport.tap !== 'function') throw new TypeError('ADB actuator needs an injected transport');
    this.transport = transport; this.controlMap = Object.freeze({ ...controlMap }); this.claimLevel = transport.claimLevel ?? 'DEVICE_MEASURED';
  }

  capabilities() { return { adapter: this.id, verification: 'external', claimLevel: this.claimLevel }; }

  async apply(command) {
    validateControlCommand(command);
    const point = this.controlMap[command.action.control];
    if (!point) return super.apply({ ...command, _reason: 'unmapped-control' });
    await this.transport.tap(point.x, point.y);
    return super.apply(command);
  }
}

export class HidActuator extends FixtureActuator {
  constructor({ transport, controlMap, ...options } = {}) {
    super({ id: 'hid-multi', ...options });
    if (!transport || typeof transport.send !== 'function') throw new TypeError('HID actuator needs an injected transport');
    this.transport = transport; this.controlMap = Object.freeze({ ...controlMap }); this.claimLevel = transport.claimLevel ?? 'DEVICE_MEASURED';
  }

  capabilities() { return { adapter: this.id, verification: 'external', claimLevel: this.claimLevel }; }

  async apply(command) {
    validateControlCommand(command);
    await this.transport.send({ command, point: this.controlMap[command.action.control] ?? null });
    return super.apply(command);
  }
}
