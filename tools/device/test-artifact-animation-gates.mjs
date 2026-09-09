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

// --- the monitor raise animation -------------------------------------------
{
  const raise = { at: 5300, kind: 'tap', control: 'monitor', duration: 33 };
  const early = [raise, { at: 5300 + MONITOR_ANIM_UP_MS - 1, kind: 'hold', control: 'wind', duration: 3200 }];
  const clear = [raise, { at: 5300 + MONITOR_ANIM_UP_MS, kind: 'hold', control: 'wind', duration: 3200 }];
  check(refuses(early, down, 'monitor raise'),
    'a wind hold inside the monitor raise animation was compiled');
  check(!refuses(clear, down, 'monitor raise'),
    'a wind hold clearing the raise animation by 0 ms was refused');
  // the exact regression: wind moved from +500 ms to +100 ms after the raise
  check(refuses([raise, { at: 5400, kind: 'hold', control: 'wind', duration: 3600 }], down, 'monitor raise'),
    'the 2026-09-08 wind-at-5400 regression still compiles');
  check(!refuses([raise, { at: 5800, kind: 'hold', control: 'wind', duration: 3200 }], down, 'monitor raise'),
    'the shipped wind-at-5800 timing was refused');
  // a camera select is bound by the same window
  check(refuses([raise, { at: 5350, kind: 'tap', control: 'cam11', duration: 33 }], down, 'monitor raise'),
    'a camera select inside the monitor raise animation was compiled');
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
  `artifact animation gates: a press needing the monitor refuses inside the ${MONITOR_ANIM_UP_MS} ms raise ` +
  `(including the wind-at-5400 regression that wound nothing on device), and every non-mask press refuses ` +
  `inside the ${MASK_ANIM_OFF_MS} ms mask-off animation, while the shipped timings still compile`);
