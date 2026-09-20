/**
 * Semantic actuator implementations. Physical encodings are injected at the
 * edge, while every implementation returns the same honest result envelope.
 * CONTRACT:actuator-v1.
 */
import { validateActuationResult, validateControlCommand } from '@fnaf2-1020/core/contracts';
import { Actuator } from '@fnaf2-1020/core/actuation';
import { resolveControlPoint } from './control-anchor.js';

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

  /** `extra` is the subclass's physical record -- which point it resolved, at
   *  which view. The contract allows fields it does not name; what it must not
   *  allow is a press whose coordinate cannot be read back afterwards. */
  async apply(command, extra = {}) {
    validateControlCommand(command);
    const status = this.fail ? 'FAILED' : 'SENT';
    const result = { schema: 'actuation-result-v1', commandId: command.id, status, backend: this.id, sentAt: { clock: 'host-monotonic-ms', value: this.now() }, verifiedAt: null, uncertaintyMs: 1, ...(this.fail ? { reason: 'fixture-fault' } : {}), ...extra };
    validateActuationResult(result); this.records.push({ command, result }); return result;
  }
}

export class AdbTapActuator extends FixtureActuator {
  /** @param {any} options */
  constructor(options = {}) {
    const { transport, controlMap, qualification = null, view = {}, ...rest } = options;
    super({ id: 'adb-tap', ...rest });
    if (!transport || typeof transport.tap !== 'function' || typeof transport.abort !== 'function' || typeof transport.releaseAll !== 'function')
      throw new TypeError('ADB actuator needs an injected transport with tap, abort, and releaseAll');
    this.transport = transport; this.controlMap = Object.freeze({ ...controlMap });
    this.qualification = qualification;
    this.claimLevel = qualification?.claimLevel ?? 'FIXTURE';
    // The office's pan when this actuator presses. The default is rest, which
    // is where every existing route presses and where every unstated control
    // in the shipped profiles was measured; a caller that pans says so, and
    // then a control whose anchor is unstated refuses instead of pressing a
    // coordinate nobody measured at that view.
    this.view = Object.freeze({ viewOffset: 0, ...view });
  }

  capabilities() { return { adapter: this.id, verification: 'external', claimLevel: this.claimLevel }; }

  async apply(command) {
    validateControlCommand(command);
    const point = this.controlMap[command.action.control];
    if (!point) return super.apply({ ...command, _reason: 'unmapped-control' });
    let placed;
    try { placed = resolveControlPoint(command.action.control, point, this.view); }
    catch (error) { return super.apply({ ...command, _reason: 'unresolved-at-view' },
      { status: 'REJECTED', reason: error.message, view: { ...this.view } }); }
    await this.transport.tap(placed.x, placed.y);
    return super.apply(command, { view: { offsetPx: placed.viewOffset, anchor: placed.anchor } });
  }

  abort(reason) { return this.transport.abort(reason); }
  releaseAll() { return this.transport.releaseAll(); }
}

export class HidActuator extends FixtureActuator {
  /** @param {any} options */
  constructor(options = {}) {
    const { transport, controlMap, qualification = null, view = {}, ...rest } = options;
    super({ id: 'hid-multi', ...rest });
    if (!transport || typeof transport.send !== 'function' || typeof transport.abort !== 'function' || typeof transport.releaseAll !== 'function')
      throw new TypeError('HID actuator needs an injected transport with send, abort, and releaseAll');
    this.transport = transport; this.controlMap = Object.freeze({ ...controlMap });
    this.qualification = qualification;
    this.claimLevel = qualification?.claimLevel ?? 'FIXTURE';
    this.view = Object.freeze({ viewOffset: 0, ...view });
  }

  capabilities() { return { adapter: this.id, verification: 'external', claimLevel: this.claimLevel }; }

  async apply(command) {
    validateControlCommand(command);
    const point = this.controlMap[command.action.control] ?? null;
    let placed = null;
    if (point) {
      try { placed = resolveControlPoint(command.action.control, point, this.view); }
      catch (error) { return super.apply({ ...command, _reason: 'unresolved-at-view' },
        { status: 'REJECTED', reason: error.message, view: { ...this.view } }); }
    }
    await this.transport.send({ command, point: placed ? { ...point, x: placed.x, y: placed.y } : null });
    return super.apply(command, placed ? { view: { offsetPx: placed.viewOffset, anchor: placed.anchor } } : {});
  }

  abort(reason) { return this.transport.abort(reason); }
  releaseAll() { return this.transport.releaseAll(); }
}
