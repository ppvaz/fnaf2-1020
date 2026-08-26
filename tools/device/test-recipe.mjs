// Gate for the device pilot's cycle recipes. No phone required.
//
// This exists because the same class of bug reached the phone three times: a
// duration that is correct as simulator frames and wrong as an Android
// contact. The simulator counts frames of light, so 83 ms is five frames and
// perfectly valid there; on the phone Fusion polls touch per frame and a
// graded run that scheduled ten 83 ms hall pulses produced zero visible beams.
// Nothing caught it, because nothing checked the stream the runner emits.
import { build, track, devicePlan, MIN_CONTACT_MS, DEVICE_SPACING_MS, MODEL_SLOT_MS } from './recipe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };

// These are the options `tools/test.mjs --engine` pins as `hidpilot n6 target`
// (3000/3000 ordinary, 3000/3000 pinned-worst). The recipe must be built from
// the policy that was actually verified, not a neighbouring one.
const PINNED = { night: 6, sweepSlotMs: MODEL_SLOT_MS, maskMarginMs: 900, pilotOffset: 10 };
const recipe = build({ ...PINNED, readLatencyMs: 550, hallPulseMs: 130 });
for (const [key, want] of Object.entries(PINNED))
  check(recipe.options[key] === want,
    `recipe option ${key} is ${recipe.options[key]}, but the verified contract pins ${want}`);
check(recipe.options.deviceSweep && recipe.options.pulseLight,
  'the device recipe must use the device sweep and the pulsed light');
check(recipe.options.prophylacticMask,
  'the device recipe must clear Golden Freddy with the prophylactic mask');

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

// The device plan is what the phone executes, so it gets the same scrutiny as
// the recipe it comes from -- including every sweep, not just the first.
const plan = devicePlan(recipe);
const clearMaskRaise = plan.clear.find(line => line.includes(' maskraise '));
check(clearMaskRaise?.split(' ')[3] === 'hall',
  `the post-read clear raise must carry its first Foxy reset, got "${clearMaskRaise}"`);
check(+clearMaskRaise.split(' ')[4] >= MIN_CONTACT_MS,
  `the post-read Foxy reset is under the ${MIN_CONTACT_MS} ms contact floor`);
for (const [name, lines] of Object.entries(plan)) {
  let sweeps = 0;
  for (const line of lines) {
    const [at, kind, ...rest] = line.split(' ');
    check(Number.isInteger(+at) && +at >= 0, `${name}: bad offset in "${line}"`);
    if (kind === 'sweep') {
      sweeps++;
      const [spacing, contact, cams] = rest;
      check(+spacing > 0 && +spacing <= DEVICE_SPACING_MS,
        `${name}: sweep spacing ${spacing} ms is not a landed device spacing`);
      check(+contact >= MIN_CONTACT_MS, `${name}: sweep contact ${contact} ms is under the floor`);
      check(cams === '10,4,7', `${name}: sweep covers ${cams}, not Minus 7's 10,4,7`);
    } else if (kind === 'tap' || kind === 'hold') {
      check(+rest[1] >= MIN_CONTACT_MS, `${name}: "${line}" is under the contact floor`);
    } else if (kind === 'hall' || kind === 'hallraise') {
      check(+rest[0] >= MIN_CONTACT_MS, `${name}: "${line}" is under the contact floor`);
    } else if (kind === 'maskraise') {
      const [gap, mode, duration] = rest;
      check(+gap >= 180,
        `${name}: maskraise puts the monitor ${gap} ms after the mask; the device ` +
        'lost 9/15 below 180 ms and 0/17 at or above it');
      check(mode === 'up' || mode === 'hall', `${name}: unknown maskraise mode "${mode}"`);
      if (mode === 'hall')
        check(+duration >= MIN_CONTACT_MS, `${name}: maskraise hall contact is under the floor`);
    } else {
      check(kind === 'read', `${name}: unknown device instruction "${kind}"`);
      check(+rest[1] >= 33,
        `${name}: the read leaves ${rest[1]} ms between the vent light and the ` +
        'mask; one 30 Hz Fusion poll is 33 ms and a lost mask press sticks the ' +
        'mask on, which blinds every later read');
    }
  }
  check(sweeps >= 1, `${name}: no camera sweep, so nothing refreshes the stalls`);

  // No two contacts at different controls may abut. Fusion polls touch once
  // per frame, so a release and a press inside one 33 ms poll can read as a
  // single finger moving between two buttons, and the second button never
  // fires. A recorded run measured 0 ms between the WIND release and the
  // CAM 10 press, and 0 ms between the hall pulse and the monitor raise it
  // was supposed to precede.
  const span = e => {
    if (e.kind === 'sweep') return [e.at, e.at + 2 * +e.rest[0] + +e.rest[1]];
    // A read owns its prophylactic mask: light, released gap, mask contact.
    if (e.kind === 'read') return [e.at, e.at + +e.rest[0] + +e.rest[1] + MIN_CONTACT_MS];
    if (e.kind === 'maskraise')
      return [e.at, e.at + +e.rest[0] + (e.rest[1] === 'hall' ? +e.rest[2] : MIN_CONTACT_MS)];
    if (e.kind === 'hold') return [e.at, e.at + +e.rest[1]];
    return [e.at, e.at + +e.rest[e.rest.length - 1]];
  };
  const control = e => e.kind === 'tap' || e.kind === 'hold' ? e.rest[0] : e.kind;
  const acts = lines.map(l => l.split(' '))
    .map(([at, kind, ...rest]) => ({ at: +at, kind, rest }))
    .sort((a, b) => a.at - b.at);
  for (let i = 1; i < acts.length; i++) {
    // hallraise deliberately taps the monitor on a second contact while the
    // hall light is held; that is one gesture, not two buttons in sequence.
    if (acts[i - 1].kind === 'hallraise' || acts[i].kind === 'hallraise') continue;
    if (control(acts[i - 1]) === control(acts[i])) continue;
    const released = acts[i].at - span(acts[i - 1])[1];
    check(released >= 33,
      `${name}: only ${released} ms between ${control(acts[i - 1])} ending ` +
      `+${span(acts[i - 1])[1]} ms and ${control(acts[i])} at +${acts[i].at} ms; ` +
      'one 30 Hz Fusion poll is 33 ms');
  }

  // Sweeps follow a wind hold, and the phone needs released time between the
  // two. A recorded run's own HID trace measured 0 ms between the WIND release
  // and the CAM 10 press: Fusion polls touch per frame, so that reads as one
  // finger dragging from the wind button onto the camera, and the sweep's
  // first select is the one that disappears.
  const timed = lines.map(l => l.split(' ')).map(([at, kind, ...rest]) => ({ at: +at, kind, rest }));
  for (const sweep of timed.filter(e => e.kind === 'sweep')) {
    const wind = timed.filter(e => e.kind === 'hold' && e.rest[0] === 'wind' && e.at < sweep.at).pop();
    if (!wind) continue;
    const released = sweep.at - (wind.at + +wind.rest[1]);
    check(released >= 33,
      `${name}: only ${released} ms between the wind release and the sweep at ` +
      `+${sweep.at} ms; one 30 Hz Fusion poll is 33 ms`);
  }
}

// The cycle seam.
//
// Every released-time check above measures *within* one cycle. This pair
// straddles two, and nothing was looking: both steady cycles finish 7 ms past
// their own length, so the next cycle's anchor press lands on top of the
// sweep's last camera release. Fusion reads that as one finger moving from the
// camera onto the monitor button and the monitor press never fires.
//
// Everything else followed from that one lost press, and it cost nights 6-22 to 6-24:
// the cams stay up, the monitor toggle desyncs permanently because nothing
// reads the state back, the vent-light press with cams up is the *camera*
// light so the classifier is handed a camera frame and answers `unknown`, the
// schedule fails closed into an attack every cycle, attack cycles do not wind,
// and the box empties. Cycle 1 was clean in every run because it follows the
// opening, which ends 200 ms clear of its anchor.
//
// The sweep is deliberately not moved earlier: HID-MULTITOUCH.md records that
// one frame of tail costs 272 of 400 nights, because that stun has to bridge
// the five-tick mask with nothing to spare. The runner instead delays the next
// anchor, spending phase-window slack. This asserts the overrun stays small
// enough for that to be a compensation rather than a reschedule.
const FUSION_POLL_MS = 33;
const needsSeamDelay = [];
const instrSpan = (kind, rest) =>
  kind === 'sweep' ? 2 * +rest[0] + +rest[1]
  : kind === 'tap' || kind === 'hold' ? +rest[1]
  : kind === 'hall' || kind === 'hallraise' ? +rest[0]
  : kind === 'maskraise' ? +rest[0] + (rest[1] === 'hall' ? +rest[2] : MIN_CONTACT_MS)
  : +rest[0] + +rest[1] + MIN_CONTACT_MS;

for (const [name, lines] of Object.entries(plan)) {
  const [at, kind, ...rest] = lines[lines.length - 1].split(' ');
  const end = +at + instrSpan(kind, rest);
  const overrun = end - recipe.cycles[name].lengthMs;
  check(overrun <= FUSION_POLL_MS,
    `${name}: the last instruction ends ${overrun} ms past the cycle's own ` +
    `${recipe.cycles[name].lengthMs} ms length. Past one Fusion poll the next ` +
    "anchor cannot be delayed into a released gap -- that is a reschedule, not " +
    'a compensation, and the route has to change instead.');
  // Report which cycles depend on the runner's seam delay. This is the link
  // between the two halves of the check: test-runner-plan.mjs asserts the
  // runner leaves that gap, and this names the cycles that would be broken
  // without it rather than asserting something vacuous here.
  if (overrun > -FUSION_POLL_MS)
    needsSeamDelay.push(`${name} (${overrun >= 0 ? '+' : ''}${overrun} ms)`);
}

// The branch is only known after the read, so both steady cycles must begin
// with the identical prefix: lower, read, mask.
const prefix = lines => lines.slice(0, 2).join('|');
check(prefix(plan.clear) === prefix(plan.attack),
  `clear and attack disagree before the classifier answers:\n  ${prefix(plan.clear)}\n  ${prefix(plan.attack)}`);

console.log(`  seam: ${needsSeamDelay.length ? needsSeamDelay.join(', ') + ' rely on the runner delaying the next anchor' : 'every cycle clears its own boundary'}`);
console.log('recipe checks passed: ' + Object.entries(recipe.cycles)
  .map(([n, c]) => `${n} ${c.budget.windMarginMs >= 0 ? '+' : ''}${c.budget.windMarginMs} ms wind`)
  .join(', ') + `; ${recipe.powerFramesSpentIfAllClear}/${recipe.powerFramesAvailable} power`);
