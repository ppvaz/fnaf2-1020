/** Acquisition adapters return raw samples or explicit UNKNOWN measurements. */
import { validateMeasurement, validateRawSample } from '@fnaf2-1020/core/contracts';
import { Detector, Sensor } from '@fnaf2-1020/core/sensing';
import { unknownMeasurement } from '@fnaf2-1020/core/sensing';

export class FixtureRawSensor extends Sensor {
  constructor({ samples = [], clock = 'host-monotonic-ms' } = {}) { super(); this.samples = [...samples]; this.clock = clock; }
  capabilities() { return { adapter: 'fixture-visual', clock: this.clock, format: 'fixture-rgba-v1' }; }
  sample(request = {}) {
    const sample = this.samples.shift() ?? { schema: 'raw-sample-v1', id: `sample-${request.id ?? 'unknown'}`, format: 'fixture-rgba-v1', dimensions: { width: 16, height: 16 }, rate: 60, acquisition: { clock: this.clock, at: request.at ?? 0 }, source: { sensor: 'fixture-visual' }, loss: null, calibration: { profile: 'fixture-visual-v1' }, payload: null };
    return validateRawSample(sample);
  }
}

export class FixtureVisualDetector extends Detector {
  capabilities() { return { adapter: 'fixture-detector', format: 'fixture-rgba-v1', output: 'measurement-v1' }; }
  detect(rawSample) {
    validateRawSample(rawSample);
    return validateMeasurement({ schema: 'measurement-v1', id: `${rawSample.id}-measurement`, signal: 'visual', state: 'UNKNOWN', reason: 'fixture-detector-no-label', confidence: 0, observedAt: { clock: rawSample.acquisition.clock, value: rawSample.acquisition.at }, receivedAt: { clock: rawSample.acquisition.clock, value: rawSample.acquisition.at }, source: { sensor: rawSample.source.sensor, detector: 'fixture-detector', calibrationProfile: rawSample.calibration.profile } });
  }
}

export class FixtureVisualSensor {
  constructor({ samples = [], clock = 'host-monotonic-ms' } = {}) { this.samples = [...samples]; this.clock = clock; }
  capabilities() { return { adapter: 'fixture-visual', clock: this.clock, format: 'fixture-rgba-v1' }; }
  sample(request = {}) {
    const sample = this.samples.shift();
    if (!sample) return { schema: 'measurement-v1', id: `measurement-${request.id ?? 'unknown'}`, signal: request.signal ?? 'visual', state: 'UNKNOWN', reason: 'fixture-exhausted', confidence: 0, observedAt: { clock: this.clock, value: request.at ?? 0 }, receivedAt: { clock: this.clock, value: request.at ?? 0 }, source: { sensor: 'fixture-visual', detector: null, calibrationProfile: null } };
    validateMeasurement(sample); return sample;
  }
}

export class SimTruthSensor {
  constructor(plant) { this.plant = plant; }
  capabilities() { return { adapter: 'sim-truth', privileged: true, claimLevel: 'MODEL_ONLY' }; }
  sample() { return this.plant.truthSensor(); }
}

class TransportRawSensor extends Sensor {
  /** @param {any} options */
  constructor(options = {}) {
    const { id, format, capture, clock = 'device-monotonic-ms', dimensions = { width: 1, height: 1 }, rate = 60, calibration = `${id}-calibration-v1` } = options;
    super();
    if (typeof id !== 'string' || typeof capture !== 'function') throw new TypeError('transport sensor needs an id and capture function');
    this.id = id; this.format = format; this.capture = capture; this.clock = clock;
    this.dimensions = dimensions; this.rate = rate; this.calibration = calibration;
  }

  capabilities() { return { adapter: this.id, clock: this.clock, format: this.format, claimLevel: 'DEVICE_MEASURED' }; }

  sample(request = {}) {
    const at = request.at ?? 0;
    try {
      const payload = this.capture(request);
      if (payload?.schema === 'raw-sample-v1') return validateRawSample(payload);
      return validateRawSample({
        schema: 'raw-sample-v1', id: `${this.id}-${request.id ?? at}`, format: this.format,
        dimensions: this.dimensions, rate: this.rate,
        acquisition: { clock: this.clock, at }, source: { sensor: this.id },
        calibration: { profile: this.calibration }, loss: null, payload,
      });
    } catch (error) {
      return validateRawSample({
        schema: 'raw-sample-v1', id: `${this.id}-${request.id ?? at}`, format: this.format,
        dimensions: this.dimensions, rate: this.rate,
        acquisition: { clock: this.clock, at }, source: { sensor: this.id },
        calibration: { profile: this.calibration }, loss: { reason: error.message }, payload: null,
      });
    }
  }
}

export class ScreencapSensor extends TransportRawSensor {
  /** @param {any} options */
  constructor(options = {}) { super({ id: 'screencap', format: 'rgba8888', ...options }); }
}

export class MediaProjectionSensor extends TransportRawSensor {
  /** @param {any} options */
  constructor(options = {}) { super({ id: 'mediaprojection', format: 'rgba8888', ...options }); }
}

export class A2dpPcmSensor extends TransportRawSensor {
  /** @param {any} options */
  constructor(options = {}) { super({ id: 'a2dp-pcm', format: 'pcm-s16le', dimensions: { width: 1, height: 1 }, ...options }); }
}

class TransportDetector extends Detector {
  /** @param {any} options */
  constructor(options = {}) {
    const { id, read, output = 'measurement-v1' } = options;
    super();
    if (typeof id !== 'string' || typeof read !== 'function') throw new TypeError('transport detector needs an id and read function');
    this.id = id; this.read = read; this.output = output;
  }

  capabilities() { return { adapter: this.id, output: this.output, claimLevel: 'DEVICE_MEASURED' }; }

  detect(rawSample) {
    validateRawSample(rawSample);
    const observedAt = { clock: rawSample.acquisition.clock, value: rawSample.acquisition.at };
    try {
      const value = this.read(rawSample);
      if (value?.schema === 'measurement-v1') return validateMeasurement(value);
      if (!value || value.state === 'UNKNOWN') return unknownMeasurement({
        id: `${rawSample.id}-${this.id}`, signal: value?.signal ?? 'visual',
        reason: value?.reason ?? 'detector-unavailable', observedAt,
        receivedAt: observedAt, source: { sensor: rawSample.source.sensor, detector: this.id, calibrationProfile: rawSample.calibration.profile },
      });
      return validateMeasurement({
        schema: 'measurement-v1', id: `${rawSample.id}-${this.id}`, signal: value.signal ?? 'visual',
        state: 'OBSERVED', value: value.value ?? value, confidence: value.confidence ?? 1,
        observedAt, receivedAt: observedAt,
        source: { sensor: rawSample.source.sensor, detector: this.id, calibrationProfile: rawSample.calibration.profile },
      });
    } catch (error) {
      return unknownMeasurement({ id: `${rawSample.id}-${this.id}`, signal: 'visual', reason: error.message, observedAt, receivedAt: observedAt, source: { sensor: rawSample.source.sensor, detector: this.id, calibrationProfile: rawSample.calibration.profile } });
    }
  }
}

export class CueHelperDetector extends TransportDetector {
  /** @param {any} options */
  constructor(options = {}) { super({ id: 'cue-helper-detector', ...options }); }
}

export class ScreencheckDetector extends TransportDetector {
  /** @param {any} options */
  constructor(options = {}) { super({ id: 'screencheck-detector', ...options }); }
}
