// Mock regression for the human gate. No phone, no adb.
//
// Three claims: the plan auditor prices presses the way the runner delivers
// them (sweep slots expanded, reads ignored, unknown verbs refused, cycle
// wraparound included); the shipped Night 6 plan is REFUSED -- the 2026-08-25
// grounding is a recorded fact, and this line flips only when a
// human-executable route ships; and the two copies of the floor (this gate's
// and the runner's live one) cannot drift apart silently.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, pressOnsets, HUMAN_GAP_FLOOR_MS } from './human-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) { failed++; console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
};

// A humanly spaced plan passes, wraparound included.
const humane = `#cycle calm 5000
0 tap monitor 100
400 tap cam11 100
800 hold wind 1000
2000 read 600 40
4600 tap monitor 100
`;
check('humane plan passes', audit(humane).length === 0, JSON.stringify(audit(humane)));

// Two taps 200 ms apart are named, with the offending pair.
const tight = `#cycle rush 5000
0 tap monitor 100
200 tap cam11 100
`;
const tv = audit(tight);
check('tight taps refused', tv.length === 1 && tv[0].gapMs === 200 &&
  tv[0].a === 'tap monitor' && tv[0].b === 'tap cam11', JSON.stringify(tv));

// A sweep is one press per slot: 120 ms spacing yields slot-to-slot gaps.
const sweep = `#cycle swept 10000
0 tap monitor 100
5000 sweep 120 100 10,4,7
`;
const sv = audit(sweep);
check('sweep slots expanded and refused', sv.length === 2 &&
  sv.every(v => v.gapMs === 120 && v.cycle === 'swept'), JSON.stringify(sv));

// The wraparound gap: last press near the period end, next repetition's first
// press near zero.
const wrap = `#cycle wrapped 5000
100 tap monitor 100
4900 tap mask 100
`;
const wv = audit(wrap);
check('wraparound gap refused', wv.length === 1 && wv[0].gapMs === 200, JSON.stringify(wv));

// A verb the gate cannot price is a plan it must not pass.
let threw = false;
try { audit('#cycle x 1000\n0 teleport monitor 100\n'); } catch { threw = true; }
check('unknown verb refused', threw);

// read rows are observations, not inputs.
check('reads are not presses',
  pressOnsets('#cycle r 1000\n0 read 600 40\n')[0].onsets.length === 0);

// The two copies of the floor: the runner's live constant and this gate's.
const runner = readFileSync(join(HERE, 'trial-minus7.sh'), 'utf8');
const m = runner.match(/^HUMAN_FLOOR_MS=(\d+)$/m);
check('runner floor pinned to the gate', m && Number(m[1]) === HUMAN_GAP_FLOOR_MS,
  `runner=${m?.[1]} gate=${HUMAN_GAP_FLOOR_MS}`);

// The runner actually invokes the gate on the plan path, and the live check
// sits inside the delivering primitives -- a silently removed guard is the
// graded-nothing pipeline again.
check('runner pre-flights the plan', /human-gate\.mjs" "\$RUN_TMP\/device-plan\.txt"/.test(runner));
for (const fn of ['press_at', 'hold_at', 'pulsed_sweep_at', 'hall_reset_and_raise_at']) {
  const body = runner.split(new RegExp(`^${fn}\\(\\) \\{`, 'm'))[1]?.split('\n}')[0] || '';
  check(`${fn} enforces the floor`, /human_floor_(check|abort)/.test(body));
}

// The shipped plan is refused. This is the decision, recorded: the 120 ms
// route stays grounded until a human-executable route replaces it, and
// whoever ships that route flips this assertion deliberately.
const shipped = execFileSync(process.execPath, [join(HERE, 'recipe.mjs'), '--device-plan'],
  { encoding: 'utf8' });
const shippedViolations = audit(shipped);
check('shipped n6 plan is refused', shippedViolations.length > 0,
  'the shipped plan now passes the human floor -- if a human-executable route shipped, update this check and the CLAUDE.md grounding note together');

if (failed) { console.error(`${failed} human-gate check(s) failed`); process.exit(1); }
console.log(`human gate: auditor verified; shipped plan refused (${shippedViolations.length} gaps under ${HUMAN_GAP_FLOOR_MS} ms)`);
