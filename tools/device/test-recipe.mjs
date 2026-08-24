// Gate for the device pilot's cycle recipes. No phone required.
//
// This exists because the same class of bug reached the phone three times: a
// duration that is correct as simulator frames and wrong as an Android
// contact. The simulator counts frames of light, so 83 ms is five frames and
// perfectly valid there; on the phone Fusion polls touch per frame and a
// graded run that scheduled ten 83 ms hall pulses produced zero visible beams.
// Nothing caught it, because nothing checked the stream the runner emits.
import { build, track, MIN_CONTACT_MS, DEVICE_SPACING_MS } from './recipe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };

// These are the options `tools/test.mjs --engine` pins as `hidpilot n6 target`
// (3000/3000 ordinary, 3000/3000 pinned-worst). The recipe must be built from
// the policy that was actually verified, not a neighbouring one.
const PINNED = { night: 6, sweepSlotMs: 120, maskMarginMs: 900, pilotOffset: 10 };
const recipe = build({ ...PINNED, readLatencyMs: 550, hallPulseMs: 130 });
for (const [key, want] of Object.entries(PINNED))
  check(recipe.options[key] === want,
    `recipe option ${key} is ${recipe.options[key]}, but the verified contract pins ${want}`);
check(recipe.options.deviceSweep && recipe.options.pulseLight,
  'the device recipe must use the device sweep and the pulsed light');

for (const [name, cycle] of Object.entries(recipe.cycles)) {
  const b = cycle.budget;

  // The regression that motivated this file.
  check(b.minContactMs >= MIN_CONTACT_MS,
    `${name}: shortest contact is ${b.minContactMs} ms, below the phone's ` +
    `${MIN_CONTACT_MS} ms floor -- Fusion polls touch per frame and drops it`);
  for (const e of cycle.events)
    check(e.dur >= MIN_CONTACT_MS,
      `${name}: ${e.act} at +${e.at} ms is a ${e.dur} ms contact`);

  // The camera actuator: hid-sweep-probe.sh has landed 120 ms spacing 4/4 and
  // nothing shorter has been measured on a phone.
  check(b.maxSpacingMs <= DEVICE_SPACING_MS,
    `${name}: ${b.maxSpacingMs} ms camera spacing exceeds the ${DEVICE_SPACING_MS} ms proven on the phone`);

  // Every cycle must reach the hall, or Foxy's D never resets. The run that
  // motivated this gate flashed the hall zero times in 71 seconds.
  const hall = cycle.events.filter(e => e.act === 'hall');
  if (name !== 'opening')
    check(hall.length >= 1, `${name}: no hall flash, so nothing resets Foxy`);
  for (const e of hall)
    check(e.dur >= MIN_CONTACT_MS, `${name}: ${e.dur} ms hall flash will be dropped`);
}

// The monitor/mask polarity invariants. These are asserted rather than
// re-derived because getting them wrong is this project's most repeated bug:
// the pilot's whole `--sync` branch exists because a bare monitor toggle
// raised the cams into a waiting Golden Freddy instead of lowering them.
// Recipes now carry the state the engine reached, so the check is real.
for (const [name, cycle] of Object.entries(recipe.cycles)) {
  const monitors = cycle.events.filter(e => e.act === 'monitor');
  const masks = cycle.events.filter(e => e.act === 'mask');
  for (const e of [...monitors, ...masks])
    check(e.want, `${name}: ${e.act} at +${e.at} ms carries no intended state`);

  // The night opens in the office, so the opening raises first. Every steady
  // cycle is entered cams-up from the previous cycle's late sweep, so it
  // lowers first. Stating both is the point: the two differ, and assuming one
  // shape for both is exactly how the polarity gets inverted.
  const entersCamsUp = name !== 'opening';
  check(monitors[0]?.want === (entersCamsUp ? 'down' : 'up'),
    `${name}: the first monitor press wants ${monitors[0]?.want}, but this ` +
    `cycle is entered cams-${entersCamsUp ? 'up' : 'down'}`);
  check(cycle.events[cycle.events.length - 1].camsUp,
    `${name}: does not end cams-up, so the next cycle's first press will invert`);
  for (let i = 1; i < monitors.length; i++)
    check(monitors[i].want !== monitors[i - 1].want,
      `${name}: two consecutive monitor presses both want ${monitors[i].want}`);
  for (let i = 1; i < masks.length; i++)
    check(masks[i].want !== masks[i - 1].want,
      `${name}: two consecutive mask presses both want ${masks[i].want}`);

  // States the game cannot reach, and the reads that depend on the monitor.
  for (const e of masks)
    check(!e.camsUp, `${name}: mask pressed at +${e.at} ms with the cams up, ` +
      'which g75/g84 make unreachable');
  for (const e of cycle.events.filter(e => e.act === 'ventl' || e.act === 'hall'))
    check(!e.camsUp,
      `${name}: ${e.act} at +${e.at} ms needs the cams down to be the office light`);
  for (const e of cycle.events.filter(e => /^cam\d/.test(e.act) || e.act === 'camlight'))
    check(e.camsUp, `${name}: ${e.act} at +${e.at} ms needs the cams up`);
}

// The box: a clear cycle has to wind more than it drains, and a BB response is
// allowed to run a deficit because it is rare and bounded.
check(recipe.cycles.clear.budget.windMarginMs > 0,
  `a clear cycle winds ${recipe.cycles.clear.budget.windMs} ms against a ` +
  `${recipe.cycles.clear.budget.windBreakEvenMs} ms break-even`);
check(recipe.cycles.attack.budget.windMarginMs > -600,
  'a BB response drains more box than one clear cycle can recover');

// The flashlight: night 6 is 3000 frames and a held sweep alone outspends it.
check(recipe.powerFramesSpentIfAllClear < recipe.powerFramesAvailable,
  `a night of clear cycles spends ${recipe.powerFramesSpentIfAllClear} of ` +
  `${recipe.powerFramesAvailable} flashlight frames`);

// The track is how a human reads the same recipe, so it must not silently
// drop actions the phone performs.
for (const [name, cycle] of Object.entries(recipe.cycles)) {
  const steps = track(cycle);
  const nonLight = cycle.events.filter(e => e.act !== 'camlight').length;
  check(steps.length === nonLight,
    `${name}: track renders ${steps.length} steps for ${nonLight} actions`);
  // Round-trip, not re-derivation: the track must carry the same intended
  // states the engine reported, in the same order.
  for (const act of ['monitor', 'mask']) {
    const want = cycle.events.filter(e => e.act === act).map(e => e.want).join(',');
    const got = steps.filter(s => s.action === act).map(s => s.want).join(',');
    check(want === got, `${name}: track ${act} states are ${got}, recipe says ${want}`);
  }
}

console.log('recipe checks passed: ' + Object.entries(recipe.cycles)
  .map(([n, c]) => `${n} ${c.budget.windMarginMs >= 0 ? '+' : ''}${c.budget.windMarginMs} ms wind`)
  .join(', ') + `; ${recipe.powerFramesSpentIfAllClear}/${recipe.powerFramesAvailable} power`);
