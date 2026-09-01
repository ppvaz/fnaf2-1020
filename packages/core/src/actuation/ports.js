/** Core actuation port; physical encodings remain adapter-owned. CONTRACT:actuator-v1. */
export class Actuator {
  capabilities() { throw new Error('Actuator.capabilities must be implemented'); }
  apply(_command) { throw new Error('Actuator.apply must be implemented'); }
  abort() {}
  releaseAll() {}
}
