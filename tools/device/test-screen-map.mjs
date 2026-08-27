// One screen->raw transform, three languages, held to the same answer.
//
// The device stack is a shell runner driving a JS emitter and Python graders,
// and shell cannot import JS. So `rawX = (1080 - screenY) * 20 / 9` is written
// three times:
//
//   trial-minus7.sh   shell arithmetic     truncates
//   desync-scan.py    `//`                 floors
//   hid-sweep-probe.mjs                    used Math.round until 2026-08-26
//
// They disagreed on four of the thirteen real taps -- cam11 878 vs 877, mute
// 2227 vs 2226, newGame 778 vs 777, continue 978 vs 977 -- and cam11 is one
// the probe actually sweeps. So the probe that measures what the phone accepts
// was sending a coordinate the runner never sends, while the auditor that
// decides what the game did was keyed to a third. Nothing compared them.
//
// This is the pattern the architecture audit names as the one duplication in
// the repository that is a control rather than a hazard: `sourcetest.mjs`'s
// second Fusion LCG, asserted bit-exact against `src/rng.js` over 20,000
// draws. Where a shared module is impossible across a language boundary, a
// test that runs every copy over the real inputs is the answer -- the audit
// says in as many words that this is what finding 6 was missing.
//
// The runner is the authority: it is what presses the phone. The others must
// match it, not the other way round.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toRaw } from './hid-sweep-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const complain = (message) => { console.error(message); failed = 1; };

// The real tap table, read from coords.sh rather than restated here -- a stub
// that drifts from the value it stands in for tests the stub.
const coords = readFileSync(join(HERE, 'coords.sh'), 'utf8');
const taps = new Map();
for (const line of coords.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="(\d+) (\d+)"/);
  if (m) taps.set(m[1], [Number(m[2]), Number(m[3])]);
}
if (taps.size < 8) complain(`only ${taps.size} taps parsed from coords.sh; the ` +
  'table format changed and this check is no longer reading it');

// Every camera button desync-scan.py keys on, so the sweep coordinates are
// covered even though they are not in coords.sh.
const scan = readFileSync(join(HERE, 'desync-scan.py'), 'utf8');
const screenBlock = scan.slice(scan.indexOf('SCREEN = {'), scan.indexOf('}', scan.indexOf('SCREEN = {')));
for (const m of screenBlock.matchAll(/"(\w+)":\s*\((\d+),\s*(\d+)\)/g))
  taps.set(m[1], [Number(m[2]), Number(m[3])]);

const points = [...taps.entries()];
if (points.length < 15) complain(`only ${points.length} points to compare; expected the ` +
  'coords.sh taps plus desync-scan.py\'s camera table');

// --- the shell copy, evaluated by the same shell the runner uses.
const script = points.map(([, [x, y]]) =>
  `echo "$(( (1080 - ${y}) * 20 / 9 )) $(( ${x} * 9 / 20 ))"`).join('\n');
const shellOut = execFileSync('bash', ['-c', script], { encoding: 'utf8' })
  .trim().split('\n').map((l) => l.split(' ').map(Number));

// --- the Python copy, evaluated by python3 exactly as desync-scan.py writes it.
const pyScript = points.map(([, [x, y]]) =>
  `print((1080 - ${y}) * 20 // 9, ${x} * 9 // 20)`).join('\n');
const pyOut = execFileSync('python3', ['-c', pyScript], { encoding: 'utf8' })
  .trim().split('\n').map((l) => l.split(' ').map(Number));

let compared = 0;
points.forEach(([name, point], i) => {
  const js = toRaw(point);
  const sh = shellOut[i];
  const py = pyOut[i];
  compared += 1;
  if (js[0] !== sh[0] || js[1] !== sh[1] || js[0] !== py[0] || js[1] !== py[1])
    complain(`${name} ${JSON.stringify(point)} maps three ways: ` +
      `js=${JSON.stringify(js)} shell=${JSON.stringify(sh)} python=${JSON.stringify(py)}. ` +
      'The runner (shell) is the authority -- it is what presses the phone.');
});

// The transform must also be a truncation, not a rounding, at a point where
// the two differ. Without this the check passes if all three copies are
// changed to round together, which is a different transform from the one the
// phone has been calibrated against.
const halfUp = [400, 730]; // newGame: exact 777.78, floors to 777, rounds to 778
if (toRaw(halfUp)[0] !== 777)
  complain(`the transform no longer truncates: ${JSON.stringify(halfUp)} -> ` +
    `${toRaw(halfUp)[0]}, expected 777. Every device coordinate this project ` +
    'has ever pressed was truncated; changing that silently re-aims all of them.');

if (failed) process.exit(1);
console.log(`screen map: ${compared} taps agree across shell, python and js, and ` +
  'the transform truncates');
