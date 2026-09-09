// The plan compiler must refuse a press scheduled inside an animation the
// engine drops it during. No phone required.
//
// Both rules were written after live nights were lost to them on 2026-09-08.
// The monitor rule is the one that matters most here: a wind press moved to
// 100 ms after the raise tap looked fine in the simulator, because
// `press('wind')` latches `winding = true` and `isWinding` simply waits for
// MON_UP. On the phone the monitor was still animating, the wind button was
// not on screen, the contact hit the office underneath, and the cycle wound
// nothing. The simulator latches presses; the device needs the control to
// exist at contact time, and only the compiler can see the difference.
import * as C from '@fnaf2-1020/core/mechanics';
import { compileCycle } from './artifact-commands.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const MONITOR_ANIM_UP_MS = Math.round(C.MONITOR_ANIM_UP * 1000 / C.FPS);
const MASK_ANIM_OFF_MS = Math.round(C.MASK_ANIM_OFF * 1000 / C.FPS);
const refuses = (rows, initial, needle) => {
  try {
    compileCycle('probe', rows, initial);
  } catch (error) {
    check(error instanceof TypeError && error.message.includes(needle),
      `refused with the wrong error: ${error.message}`);
    return true;
  }
  return false;
};
const down = { monitorUp: false, maskOn: false };

// --- monitor raise readiness, per control ------------------------------------
// The bound is not the animation: it is a DEVICE BRACKET. A wind hold missed at
// raise+100 ms and at raise+200 ms; the lowest gap observed to work is +434 ms,
// the minus-toys opening that armed all four story-night wins. A camera select
// is proven at +300 ms by that same arm.
{
  const raise = { at: 5300, kind: 'tap', control: 'monitor', duration: 33 };
  const wind = at => ({ at, kind: 'hold', control: 'wind', duration: 3200 });
  const cam = at => ({ at, kind: 'tap', control: 'cam11', duration: 33 });
  check(refuses([raise, wind(5400)], down, 'monitor raise'),
    'the wind-at-raise+100 regression still compiles');
  check(refuses([raise, wind(5500)], down, 'monitor raise'),
    'wind at raise+200 ms still compiles, and that timing missed on device twice');
  check(!refuses([raise, wind(5734)], down, 'monitor raise'),
    'wind at raise+434 ms was refused, but that is the proven minus-toys opening gap');
  check(!refuses([raise, wind(5800)], down, 'monitor raise'),
    'the shipped Minus 3 wind timing at raise+500 ms was refused');
  // a camera select is bound by the animation plus RAISE_MARGIN_MS, not by the
  // wind bracket, because +300 ms is the arm that landed every win
  check(!refuses([raise, cam(5600)], down, 'monitor raise'),
    'a camera select at raise+300 ms was refused, but that is the proven arm');
  check(refuses([raise, cam(5400)], down, 'monitor raise'),
    'a camera select inside the raise animation still compiles');
}

// --- the mask-off animation -------------------------------------------------
{
  const maskOff = { at: 9200, kind: 'tap', control: 'mask', duration: 33 };
  const initial = { monitorUp: false, maskOn: true };
  check(refuses([maskOff, { at: 9200 + MASK_ANIM_OFF_MS - 1, kind: 'hall', duration: 350 }], initial, 'mask-off'),
    'a hall flash inside the mask-off animation was compiled');
  check(!refuses([maskOff, { at: 9200 + MASK_ANIM_OFF_MS, kind: 'hall', duration: 350 }], initial, 'mask-off'),
    'a hall flash clearing the mask-off animation was refused');
  // a mask press itself is always allowed: the mask surface owns its own input
  check(!refuses([maskOff, { at: 9250, kind: 'tap', control: 'mask', duration: 33 }], initial, 'mask-off'),
    'a mask press inside its own animation was refused');
}

console.log(
  'artifact animation gates: a wind hold refuses within the 434 ms device bracket after a monitor raise ' +
  '(including the raise+100 and raise+200 timings that missed on the phone) while the proven +434 and +500 ' +
  'gaps compile, a camera select refuses inside the raise animation while the proven +300 arm compiles, and ' +
  `every non-mask press refuses inside the ${MASK_ANIM_OFF_MS} ms mask-off animation`);
