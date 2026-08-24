#!/usr/bin/env node
// Measure the first office HUD and 1 AM transitions in a trial recording.
//
// FNaF 2 right-aligns the hour text. At 12 AM, the extra leading digit makes
// a small strip at x=1110..1155 persistently white; at 1 AM that same strip is
// empty. Requiring several consecutive frames with the surrounding Night/hour
// HUD present rejects camera flips, static, and full-white transition frames.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function usage(message = '') {
  if (message) console.error(message);
  console.error(
    'usage: clocktrace.mjs VIDEO [--fps=N] [--expect-ms=N --tolerance-ms=N]',
  );
  process.exit(2);
}

const video = process.argv[2];
if (!video || video.startsWith('--')) usage();
if (!fs.existsSync(video)) usage(`video does not exist: ${video}`);

let fps = 20;
let expectMs = null;
let toleranceMs = null;
for (const argument of process.argv.slice(3)) {
  const [name, raw] = argument.split('=', 2);
  const value = Number(raw);
  if (name === '--fps' && Number.isInteger(value) && value >= 5 && value <= 60)
    fps = value;
  else if (name === '--expect-ms' && Number.isInteger(value) && value > 0)
    expectMs = value;
  else if (name === '--tolerance-ms' && Number.isInteger(value) && value >= 0)
    toleranceMs = value;
  else usage(`invalid argument: ${argument}`);
}
if ((expectMs === null) !== (toleranceMs === null))
  usage('--expect-ms and --tolerance-ms must be supplied together');

const width = 190;
const height = 80;
const frameBytes = width * height;
const decoded = spawnSync('ffmpeg', [
  '-loglevel', 'error', '-i', video,
  '-vf', `scale=1280:576,fps=${fps},crop=${width}:${height}:1070:10`,
  '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
], { maxBuffer: 96 * 1024 * 1024 });
if (decoded.error) {
  console.error(`could not run ffmpeg: ${decoded.error.message}`);
  process.exit(2);
}
if (decoded.status !== 0) {
  process.stderr.write(decoded.stderr);
  process.exit(decoded.status || 2);
}

const frameCount = Math.floor(decoded.stdout.length / frameBytes);
const scores = [];
for (let frame = 0; frame < frameCount; frame++) {
  const offset = frame * frameBytes;
  let hudWhite = 0;
  let leadingDigitWhite = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (decoded.stdout[offset + y * width + x] <= 180) continue;
      hudWhite++;
      if (x >= 40 && x < 85 && y >= 35 && y < 75)
        leadingDigitWhite++;
    }
  }
  scores.push({ hudWhite, leadingDigitWhite });
}

const stableFrames = Math.max(3, Math.ceil(fps * 0.15));
const hudVisible = ({ hudWhite }) => hudWhite >= 800 && hudWhite <= 5000;
function firstStable(start, predicate) {
  let run = 0;
  for (let frame = start; frame < scores.length; frame++) {
    run = predicate(scores[frame]) ? run + 1 : 0;
    if (run >= stableFrames) return frame - run + 1;
  }
  return -1;
}

const hudFrame = firstStable(0, hudVisible);
if (hudFrame < 0) {
  console.error('clocktrace: office HUD was not found');
  process.exit(3);
}
const oneAmFrame = firstStable(
  hudFrame + fps * 30,
  score => hudVisible(score) && score.leadingDigitWhite <= 60,
);
const hudMs = Math.round(hudFrame * 1000 / fps);
if (oneAmFrame < 0) {
  console.error(`clocktrace: HUD first=${hudMs}ms; 1 AM was not found`);
  process.exit(3);
}

const oneAmMs = Math.round(oneAmFrame * 1000 / fps);
const deltaMs = oneAmMs - hudMs;
console.log(`HUD first=${hudMs}ms; 1 AM=${oneAmMs}ms; delta=${deltaMs}ms; resolution=${Math.round(1000 / fps)}ms`);
if (expectMs !== null) {
  const errorMs = deltaMs - expectMs;
  console.log(`expected=${expectMs}ms; error=${errorMs}ms; tolerance=±${toleranceMs}ms`);
  if (Math.abs(errorMs) > toleranceMs) process.exit(1);
}
