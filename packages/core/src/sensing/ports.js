/**
 * Narrow sensing ports. Acquisition and detection are separate so a missing
 * frame is UNKNOWN instead of a detector-invented negative.
 * CONTRACT:raw-sample-v1 CONTRACT:measurement-v1 CONTRACT:detector-v1.
 */
import { validateMeasurement } from '../contracts/index.js';

export class Sensor {
  capabilities() { throw new Error('Sensor.capabilities must be implemented'); }
  sample(_request) { throw new Error('Sensor.sample must be implemented'); }
}

export class Detector {
  capabilities() { throw new Error('Detector.capabilities must be implemented'); }
  detect(_rawSample) { throw new Error('Detector.detect must be implemented'); }
}

export function unknownMeasurement({ id, signal, reason, observedAt, receivedAt, source = {} }) {
  const measurement = { schema: 'measurement-v1', id, signal, state: 'UNKNOWN', reason, confidence: 0, observedAt, receivedAt, source };
  return validateMeasurement(measurement);
}

export function measurementSource(sensor, detector) {
  if (!sensor || typeof sensor.sample !== 'function' || !detector || typeof detector.detect !== 'function')
    throw new TypeError('measurement source needs sensor and detector ports');
  return {
    capabilities: () => ({ sensor: sensor.capabilities(), detector: detector.capabilities() }),
    sample: request => detector.detect(sensor.sample(request)),
  };
}
