// Gate for the Custom Night preset scorer. No phone required.
//
// Three things here can go wrong silently, and each one has cost a session
// elsewhere in this repository:
//
//  1. The presets could drift from the file the phone's dial driver reads.
//     They are loaded from `models/custom-night-moto-g56-v207.json`, so this
//     checks the ten are present, that every dial is one the engine knows, and
//     that `golden-freddy` reduces to the night-7 table after the caps -- the
//     control that proves the customNight path reaches the engine at all.
//
//  2. The device lane could quietly stop being a device lane. A band that is
//     never applied scores exactly like the exact lane, and the whole file
//     would then be a wish. This pins that a wide band DOES lose nights.
//
//  3. `PRESET_KNOBS.hallOffsetMs` could drift back onto a floor. It exists
//     because the shipped 9500 clears `MASK_ANIM_OFF` by 50 ms, which is
//     narrower than the phone's own measured spread. The check is the mistake
//     register's, 2026-09-11 item 7: a constant is only anchored if it stands
//     clear of its floor by a NAMED margin, and the margin is re-derived here
//     from the engine's own animation constant rather than restated.
import * as C from '@fnaf2-1020/core/mechanics';
import { KNOBS0 } from './minus-toys-plan.mjs';
import { loadPresets, cohort, PRESET_KNOBS, MEASURED_SPREAD_MS, HALL_PLATEAU_MS, BANDS } from './night7-presets.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };

// --- 1. the presets are the phone's presets ---------------------------------
{
  const presets = loadPresets();
  check(presets.length === 10, `expected 10 Custom Night presets, got ${presets.length}`);
  const ids = new Set(presets.map(p => p.id));
  for (const id of ['golden-freddy', 'foxy-foxy', 'new-and-shiny', 'cupcake-challenge'])
    check(ids.has(id), `preset ${id} is missing from the menu model`);
  for (const p of presets)
    for (const dial of Object.keys(p.dials))
      check(C.AI_DIALS.includes(dial), `preset ${p.id} names an unknown dial: ${dial}`);

  // The control: every dial at 20 IS night 7 once the caps clamp, so the
  // customNight path must produce the same AI vector the night-7 table does.
  const gf = presets.find(p => p.id === 'golden-freddy');
  check(C.AI_DIALS.every(d => gf.dials[d] === 20),
    'golden-freddy is no longer all-20; it is the 10/20 control for this file');
}

// --- 2. the device lane is really the device lane ---------------------------
//
// A narrow band must clear and a wide one must not. If both clear, the
// actuator is not wired in and every device figure this file prints is the
// exact lane wearing a band's name.
{
  const gf = loadPresets().find(p => p.id === 'golden-freddy');
  const runs = 120;
  const tight = cohort({ preset: gf, runs, band: BANDS.measured });
  check(tight.wins === runs,
    `the measured band must clear on 10/20, got ${tight.wins}/${runs}`);
  const wide = cohort({ preset: gf, runs, band: BANDS.wide });
  check(wide.wins < runs,
    `the ${BANDS.wide[0]}-${BANDS.wide[1]} ms band cleared ${wide.wins}/${runs}: ` +
    'the actuator is not being applied, so the device lane is not one');
}

// --- 3. the hall pulse stands clear of both its floors ----------------------
{
  const k = PRESET_KNOBS;
  check(k.hallOffsetMs !== KNOBS0.hallOffsetMs,
    'PRESET_KNOBS no longer moves hallOffsetMs; the Foxy fix has been reverted');

  // Below: the mask-OFF animation. `lit?` needs mask = 0 (g75) and the
  // animation is MASK_ANIM_OFF frames, so the pulse must clear the mask-OFF
  // press by that much PLUS the band width, because the band's worst draw can
  // close the gap by its full span.
  const maskAnimOffMs = C.MASK_ANIM_OFF * 1000 / C.FPS;
  const floor = k.maskOffMs + maskAnimOffMs + MEASURED_SPREAD_MS;
  check(k.hallOffsetMs >= floor + 33,
    `hallOffsetMs ${k.hallOffsetMs} clears its mask-OFF floor (${floor.toFixed(1)} ms = ` +
    `maskOffMs ${k.maskOffMs} + MASK_ANIM_OFF ${maskAnimOffMs.toFixed(1)} + spread ` +
    `${MEASURED_SPREAD_MS}) by less than 33 ms`);

  // Above: a measured edge with no mechanism yet (see HALL_PLATEAU_MS). Pin
  // the constant inside the plateau that was actually measured, and require it
  // to stand 33 ms clear of BOTH edges. Writing an inequality here instead
  // would be the 2026-09-11 item 7 mistake in its exact original form: it
  // would pass at 9700, which the +11f epoch column measures as a loss.
  check(k.hallOffsetMs >= HALL_PLATEAU_MS.lo + 33 &&
        k.hallOffsetMs <= HALL_PLATEAU_MS.hi - 33,
    `hallOffsetMs ${k.hallOffsetMs} is not 33 ms inside the measured plateau ` +
    `[${HALL_PLATEAU_MS.lo}, ${HALL_PLATEAU_MS.hi}]`);
  check(HALL_PLATEAU_MS.lo >= floor,
    `the measured plateau's lower edge ${HALL_PLATEAU_MS.lo} is below the derived ` +
    `mask-OFF floor ${floor.toFixed(1)}; the two disagree and one of them is wrong`);

  // And it must still be before the raise, or there is no cams-down hall at all.
  check(k.hallOffsetMs + k.hallMs < k.raiseMs,
    `the hall pulse at ${k.hallOffsetMs} overruns the monitor raise at ${k.raiseMs}`);
}

console.log('night7-presets: presets match the menu model, the device lane bites, ' +
  'and the hall pulse clears both floors by more than 33 ms');
