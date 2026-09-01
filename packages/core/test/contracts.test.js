/** Fast contract lane: semantic data is runtime-validated and unknown-safe. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PlantModel } from '../src/mechanics/plant.js';
import {
  canonicalJson, stableHash, validateActuationResult, validateControlCommand,
  validateMeasurement, validateClockRef,
} from '../src/contracts/index.js';
import { decodeFactMessage } from '../src/telemetry/fact-link.js';

const register = JSON.parse(readFileSync(fileURLToPath(new URL('../contracts/register.json', import.meta.url)), 'utf8'));
const catalog = JSON.parse(readFileSync(fileURLToPath(new URL('../../../docs/architecture/generated/contract-specifications.json', import.meta.url)), 'utf8'));
assert.equal(catalog.specifications.length, register.contracts.length);
for (const entry of register.contracts) assert.ok(catalog.specifications.some(spec => spec.contractId === entry.id && spec.runtimeValidation === entry.validator));

const command = { schema: 'control-command-v1', id: 'cmd-1', action: { kind: 'press', control: 'mask' }, requestedAt: { clock: 'game-frame', value: 0 }, source: { controller: 'test' } };
assert.equal(validateControlCommand(command), command);
assert.throws(() => validateControlCommand({ ...command, coordinates: { x: 1, y: 2 } }), /physical encoding/);
assert.throws(() => validateMeasurement({ schema: 'measurement-v1', id: 'm', signal: 'x', state: 'UNKNOWN', value: false, reason: 'drop', confidence: 0, observedAt: { clock: 'device-monotonic-ms', value: 1 }, receivedAt: { clock: 'host-monotonic-ms', value: 2 }, source: {} }), /UNKNOWN/);
assert.throws(() => validateClockRef({ clock: 'wall-clock', value: 1 }), /declared clock/);
assert.doesNotThrow(() => validateActuationResult({ schema: 'actuation-result-v1', commandId: 'cmd-1', status: 'SENT', backend: 'fixture', uncertaintyMs: 1, sentAt: { clock: 'host-monotonic-ms', value: 1 }, verifiedAt: null }));
assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}\n');
assert.equal(stableHash({ a: 1 }), stableHash({ a: 1 }));
const vectors = readFileSync(fileURLToPath(new URL('./fixtures/fact-message-v1.jsonl', import.meta.url)), 'utf8').trim().split('\n');
assert.equal(decodeFactMessage(vectors[0] + '\n').value, true);
assert.equal(decodeFactMessage(vectors[1] + '\n').state, 'UNKNOWN');
const commandVectors = readFileSync(fileURLToPath(new URL('./fixtures/semantic-control-v1.jsonl', import.meta.url)), 'utf8').trim().split('\n').map(line => JSON.parse(line));
assert.doesNotThrow(() => validateControlCommand(commandVectors[0]));
assert.throws(() => validateControlCommand(commandVectors[1]), /physical encoding/);
const measurementVectors = readFileSync(fileURLToPath(new URL('./fixtures/measurement-v1.jsonl', import.meta.url)), 'utf8').trim().split('\n').map(line => JSON.parse(line));
assert.equal(validateMeasurement(measurementVectors[0]).state, 'UNKNOWN');
assert.throws(() => validateMeasurement(measurementVectors[1]), /UNKNOWN/);

const model = new PlantModel({ seed: 1, night: 7, durationFrames: 8, lethal: false });
model.apply(command); model.advance(8);
assert.equal(model.frame, 8);
assert.equal(model.terminalState().alive, true);
console.log('core contracts: semantic command, unknown measurement, clock, result, and PlantModel pass');
