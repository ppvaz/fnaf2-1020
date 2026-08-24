// The runner must schedule the plan the simulator emits.
//
// The cycle table lived twice: as the recipe and as hand-typed millisecond
// literals in the runner. Fixing one did not fix the other, and a wind lead
// corrected in the model still reached the phone as the old value -- which the
// device's own HID trace then measured as 0 ms of released time before the
// sweep. Nothing compared the two, so nothing noticed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build, devicePlan } from './recipe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'trial-minus7.sh'), 'utf8');
const check = (ok, message) => { if (!ok) throw new Error(message); };

// The guard for this mode and the driver for it are both `if NIGHT6_LEFT`;
// the driver is the later one, after the hid helpers.
const start = src.lastIndexOf('if [ "$NIGHT6_LEFT" -eq 1 ]; then');
const block = src.slice(start, src.indexOf('if [ "$HID_LEFT_SURVIVAL" -eq 1 ]; then', start));
check(block.includes('pulsed_sweep_at'), 'could not find the NIGHT6_LEFT driver block');

// What the runner schedules, as (offset, kind, detail).
const scheduled = new Map();
const add = (at, kind, detail) => scheduled.set(`${at}:${kind}`, detail);
for (const m of block.matchAll(/press_at \$\(\(base \+ (\d+)\)\) "\$(\w+)_X"/g))
  add(+m[1], 'tap', m[2].toLowerCase());
// The anchor press is written "$base", not $((base + 0)).
for (const m of block.matchAll(/press_at "\$base" "\$(\w+)_X"/g))
  add(0, 'tap', m[1].toLowerCase());
for (const m of block.matchAll(/hold_at\s+\$\(\(base \+ (\d+)\)\) "\$(\w+)_X"\s+"\$\w+_Y"\s+(\d+)/g))
  add(+m[1], m[2] === 'WIND' ? 'hold' : 'hall', +m[3]);
for (const m of block.matchAll(/pulsed_sweep_at \$\(\(base \+ (\d+)\)\)/g))
  add(+m[1], 'sweep', true);
for (const m of block.matchAll(/hall_reset_and_raise_at \$\(\(base \+ (\d+)\)\)/g))
  add(+m[1], 'hallraise', true);
// The read follows the monitor press that actually happened, so its offset is
// a floor rather than a literal: light_at = max(base + N, last press + 380).
for (const m of block.matchAll(/light_at=\$\(\(base \+ (\d+)\)\)/g))
  add(+m[1], 'read', true);

const recipe = build({ night: 6, sweepSlotMs: 120, maskMarginMs: 900,
                       readLatencyMs: 550, hallPulseMs: 130, pilotOffset: 10 });
const plan = devicePlan(recipe);

const missing = [];
for (const name of ['clear', 'attack']) {
  for (const line of plan[name]) {
    const [at, kind, ...rest] = line.split(' ');
    // The mask that ends a clear cycle is pressed off the classifier's answer,
    // not off the anchor, so it has no fixed offset to compare.
    if (kind === 'tap' && rest[0] === 'mask' && name === 'clear') continue;
    // Both steady cycles share their anchor, so a +0 monitor press appears once.
    const key = `${+at}:${kind}`;
    if (!scheduled.has(key)) { missing.push(`${name}: no runner action for "${line}"`); continue; }
    if (kind === 'hold' || kind === 'hall') {
      const want = kind === 'hold' ? +rest[1] : +rest[0];
      const got = scheduled.get(key);
      check(got === want,
        `${name}: the runner holds ${got} ms at +${at} ms, the plan says ${want} ms`);
    }
  }
}
check(!missing.length, missing.join('\n  '));

console.log(`runner matches the plan: ${scheduled.size} scheduled actions checked ` +
  `against ${plan.clear.length + plan.attack.length} plan instructions`);
