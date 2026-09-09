// Usage: node tools/device/night5-modal-observer.mjs OUTPUT_DIR SERIAL [DURATION_MS]
// Passive collection only: no game inputs, classifiers, or correction requests.
// FRAME and READ are separately timestamped; they are never claimed to be one frame.
import { appendFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { AdbCueHelperPort } from '../../apps/device/src/physical-ports.js';
import { CueHelperControlTransport } from '../../packages/adapters/src/transports/cue-helper.js';

const [out, serial, durationText = '620000'] = process.argv.slice(2);
const duration = Number(durationText);
if (!out || !serial || !Number.isFinite(duration) || duration < 1000 || duration > 650000)
  throw new Error('usage: night5-modal-observer.mjs OUTPUT_DIR SERIAL [DURATION_MS]');
const port = new AdbCueHelperPort({ serial });
const endpoint = port.discover();
const cue = new CueHelperControlTransport({ request: line => port.request(line), token: endpoint.token });
const file = `${out}/modal-observations.jsonl`;
await writeFile(file, '', { flag: 'wx' });
const log = row => appendFile(file, JSON.stringify(row) + '\n');
const now = () => process.hrtime.bigint();
const start = performance.now();
let stop = false, samples = 0, errors = 0;
process.on('SIGTERM', () => { stop = true; });
process.on('SIGINT', () => { stop = true; });
process.on('message', message => {
  if (message?.type === 'stop') stop = true;
  else if (message?.type === 'clock') void log({ type: 'schedule.clock', ...message });
});
await log({ type: 'observer.start', hostNs: String(now()), utc: new Date().toISOString(),
  periodMs: 300, activeCorrection: false, maskModelLimitations: ['night-1-corpus', 'animation-unproven', 'blackout-unproven'] });
process.send?.({ type: 'ready' });
while (!stop && performance.now() - start < duration) {
  const pollStart = performance.now();
  for (const kind of ['frame', 'read']) {
    const before = now();
    try {
      const observation = cue[kind]();
      const after = now();
      await log({ type: kind, hostBeforeNs: String(before), hostAfterNs: String(after),
        roundTripMs: Number(after - before) / 1e6, observation });
      samples++;
    } catch (error) {
      errors++;
      await log({ type: 'read.error', kind, hostNs: String(now()),
        message: String(error.message).replaceAll(endpoint.token, '[REDACTED]') });
    }
  }
  await sleep(Math.max(0, 300 - (performance.now() - pollStart)));
}
await log({ type: 'observer.end', hostNs: String(now()), samples, errors });
console.log(JSON.stringify({ observer: 'finished', samples, errors }));
process.disconnect?.();
