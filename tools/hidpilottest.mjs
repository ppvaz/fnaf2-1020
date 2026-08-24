// Simulator pilot for comparing stock-Android HID timing experiments.
//
// The regular device pilot is constrained by `adb shell input swipe`, whose
// helper takes about 170 ms per press on the test phone. Android's `hid -`
// command can instead feed one persistent virtual touchscreen. The verified
// hybrid report holds contact 0 on the camera light while contact 1 gets a
// fresh down/up on each camera; see docs/device/HID-MULTITOUCH.md.
//
// This file's CAM 05 policy is retained as a comparison, not the selected
// Night 6 controller. The intended device route spends HID's saved time on the
// validated lit-left-opening classifier. Likewise, `--no-cam5` removes all BB
// handling; it is a negative control, not a model of that left-opening route.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

const s = C.s;
const TARGETS = [10, 4, 7];
const TARGET_OFFSETS = [1 / 60, 6 / 60, 11 / 60];

class HidPilot {
  constructor(sim, { bbMode = 'left', cam5Light = true, phaseSafeMask = true,
                     alwaysThreat = false, sparseCam5 = false,
                     cam5Hold = s(0.52) } = {}) {
    this.sim = sim;
    this.bbMode = bbMode;
    this.cam5 = bbMode === 'cam5';
    this.cam5Light = cam5Light;
    this.sparseCam5 = sparseCam5;
    this.cam5Hold = cam5Hold;
    this.phaseSafeMask = phaseSafeMask;
    this.alwaysThreat = alwaysThreat;
    this.queue = [];
    this.mode = 'normal';
    this.nextAnchor = s(7);
    // BB starts at CAM 10. Four successful five-second rolls are needed to
    // reach CAM 05, so a pre-boundary sensor cannot first be useful until the
    // fifth boundary at 25 s (the read itself completes at 24.7 s).
    this.cam5SafeAt = sparseCam5 ? s(24.7) : 0;
    this.checks = 0;
    this.detections = 0;
    this.attacks = 0;
    this.missed = 0;
    this.minBox = 1;
    this.opening();
  }

  at(f, kind, act = null) {
    this.queue.push([f, kind, act]);
    this.queue.sort((a, b) => a[0] - b[0]);
  }

  tap(f, act) { this.at(f, 'tap', act); }
  hold(f, frames, act) {
    this.at(f, 'down', act);
    this.at(f + frames, 'up', act);
  }

  opening() {
    this.tap(s(0.18), 'monitor');
    this.tap(s(0.46), 'cam:11');
    this.hold(s(0.52), s(5.58), 'wind');
    // The left-opening cycle deliberately flashes late. Put the opening
    // sweep late as well so its stun cannot expire before cycle zero's sweep.
    const end = this.flashTargets(s(6.25));
    this.tap(end + s(0.05), 'cam:11');
    this.hold(end + s(0.13), s(0.12), 'wind');
  }

  flashTargets(f, targets = TARGETS) {
    const start = f;
    // Three 5-frame camera contacts fit in the final 16 frames before the next
    // drop. CAM 10 and CAM 04 are then refreshed on the exact frame their
    // previous 400-frame stuns expire after a phase-safe BB mask; CAM 07 stays
    // selected and parks the two Withereds on that choke while cameras are
    // down. 83 ms spans more than two 30 Hz Fusion polls on the phone.
    this.hold(start, 16, 'light');
    for (const [i, cam] of targets.entries())
      this.tap(start + s(TARGET_OFFSETS[i]), `cam:${cam}`);
    return start + 16;
  }

  // Drop, clear a possible office Golden Freddy, reset Foxy, then raise.
  // These gaps retain the sourced Android flip/mask animation durations while
  // letting the HID contacts themselves stay short.
  normalFront(a) {
    this.tap(a, 'monitor');
    this.tap(a + s(0.40), 'mask');
    this.tap(a + s(0.70), 'mask');
    this.hold(a + s(1.10), s(0.08), 'light');
    this.tap(a + s(1.30), 'monitor');
    this.flashTargets(a + s(1.60));
  }

  normal(a) {
    if (this.bbMode === 'left') {
      this.leftNormal(a);
      return;
    }
    this.normalFront(a);
    const shouldCheck = this.cam5 && a + s(2.70) >= this.cam5SafeAt;
    if (shouldCheck) {
      this.tap(a + s(2.10), 'cam:5');
      if (this.cam5Light) this.hold(a + s(2.18), this.cam5Hold, 'light');
      this.at(a + s(2.70), 'cam5-before', a);
    } else {
      this.tap(a + s(2.12), 'cam:11');
      this.hold(a + s(2.20), s(2.75), 'wind');
    }
  }

  // The selected Night 6 route. Lower first, then hold the free left vent
  // light across the phone's measured 350 ms draw delay. The raw frame is
  // immutable once screencap starts, so HID can put the mask on while the
  // ~206 ms capture/analysis tail finishes. That makes the mask fully on
  // before the +1 s scheduler event if the result is BB, while an empty result
  // simply turns the ordinary Golden-Freddy flick back off.
  leftNormal(a) {
    this.tap(a, 'monitor');
    this.hold(a + s(0.36), s(0.40), 'ventL');
    this.at(a + s(0.72), 'left-snapshot', a);
    this.tap(a + s(0.78), 'mask');
  }

  onLeftSnapshot(a) {
    this.checks++;
    const sample = { a, bb: this.alwaysThreat || this.sim.bb.inOpening,
                     inside: this.sim.bb.inside };
    // Measured raw capture plus both classifiers is about 250 ms after the
    // frame becomes available. The result deliberately arrives after the
    // prophylactic mask press above.
    this.at(this.sim.frame + s(0.26), 'left-result', sample);
  }

  // Empty-frame continuation. A second down/mask/hall beat straddles the next
  // five-second movement opportunity. It clears any late Golden Freddy,
  // resets Foxy only ~1.3 s before the following BB check, and leaves the
  // camera sweep as late as possible. Two short winding windows still exceed
  // the sourced box break-even rate.
  leftClear(a, resultAt) {
    this.tap(resultAt + s(0.02), 'mask');
    this.hold(a + s(1.28), s(0.08), 'light');
    this.tap(a + s(1.38), 'monitor');
    this.tap(a + s(1.62), 'cam:11');
    this.hold(a + s(1.74), a + s(2.68) - (a + s(1.74)), 'wind');

    this.tap(a + s(2.72), 'monitor');
    this.tap(a + s(3.10), 'mask');
    this.tap(a + s(3.45), 'mask');
    this.hold(a + s(3.73), s(0.08), 'light');
    this.tap(a + s(3.85), 'monitor');
    this.tap(a + s(4.08), 'cam:11');
    this.hold(a + s(4.20), s(0.48), 'wind');
    this.flashTargets(a + s(4.733));
  }

  // A positive left-opening frame was captured before the prophylactic mask.
  // Keep that same mask down through ticks +1..+5. The late hall beat in the
  // previous cycle makes Foxy's +3 s roll safe; the previous late camera
  // sweep remains live until this response refreshes it after tick five.
  leftAttack(a) {
    this.attacks++;
    const phaseMargin = this.phaseSafeMask ? s(1) : 0;
    const off = a + s(5.02) + phaseMargin;
    this.tap(off, 'mask');
    // The hall press is queued before the simultaneous monitor raise. It
    // therefore resets Foxy during the raise frame without spending another
    // 120 ms before the recovery sweep.
    this.hold(off + s(0.25), s(0.08), 'light');
    this.tap(off + s(0.25), 'monitor');
    const end = this.flashTargets(off + s(0.45));
    this.tap(end + s(0.05), 'cam:11');
    this.hold(end + s(0.13), Math.max(1, a + s(9.46) - (end + s(0.13))), 'wind');
    this.flashTargets(a + s(9.733));
    this.nextAnchor = a + s(10);
  }

  onLeftResult(sample) {
    if (!sample.bb) {
      if (sample.inside) this.missed++;
      this.leftClear(sample.a, this.sim.frame);
      return;
    }
    this.detections++;
    this.leftAttack(sample.a);
  }

  // BB has already been seen on CAM 05. Refresh the normal defences, lower
  // before the next five-second movement boundary, then raise just after it.
  // A pending final hop is thereby spent at a chosen time with the cameras
  // already up, which leaves time for a pre-mask stun sweep.
  tracking(a) {
    this.normalFront(a);
    this.tap(a + s(2.12), 'cam:11');
    this.hold(a + s(2.20), s(0.47), 'wind');
    this.tap(a + s(2.70), 'monitor');
    this.tap(a + s(3.15), 'monitor');
    this.tap(a + s(3.38), 'cam:5');
    if (this.cam5Light) this.hold(a + s(3.45), this.cam5Hold, 'light');
    this.at(a + s(3.97), 'cam5-after', a);
  }

  // With BB now in the opening, refresh every stall camera before lowering.
  // The always-taken mask flick clears an unseen office Golden Freddy before
  // the hall flash. The final mask becomes fully on just before the next
  // one-second tick; five ticks later, HID has enough stun margin to unmask,
  // reset Foxy and refresh all three cameras again.
  attack(a) {
    const start = a + s(0.10);
    this.attacks++;
    this.flashTargets(start);
    this.tap(start + s(0.45), 'monitor');
    this.tap(start + s(0.85), 'mask');
    this.tap(start + s(1.08), 'mask');
    this.hold(start + s(1.38), s(0.08), 'light');
    this.tap(start + s(1.50), 'mask');

    this.tap(start + s(5.95), 'mask');
    this.hold(start + s(6.25), s(0.08), 'light');
    this.tap(start + s(6.38), 'monitor');
    const end = this.flashTargets(start + s(6.62));
    this.tap(end, 'cam:11');
    this.hold(end + s(0.08), a + s(10) - (end + s(0.10)), 'wind');

    // Resume CAM 05 on the first cycle after recovery; delaying by route
    // timing created a small blind window when fresh Night-6 rolls lined up
    // with the recovery boundary. `cam5Light=false` is retained only as a
    // hypothetical bound: the 2026-08-24 phone run rejected unlit vision.
    // A fully phased attack can expel BB at the first one-second mask tick.
    // In sparse mode, resume just before the fifth following movement
    // boundary: four successful rolls may have put him back on CAM 05, but a
    // final hop cannot have occurred yet.
    this.cam5SafeAt = this.sparseCam5 ? a + s(22.7) : a + s(10);
    this.mode = 'normal';
    this.nextAnchor = a + s(10);
  }

  onCam5Before(a) {
    this.checks++;
    if (this.sim.bb.stage !== C.BB_STAGES - 1) {
      if (this.sim.bb.inOpening || this.sim.bb.inside) this.missed++;
      this.tap(this.sim.frame + 2, 'cam:11');
      this.hold(this.sim.frame + 6, a + s(5) - (this.sim.frame + 8), 'wind');
      return;
    }
    this.detections++;
    this.mode = 'tracking-inline';
    this.tap(this.sim.frame + 2, 'monitor');
    this.tap(a + s(3.15), 'monitor');
    this.tap(a + s(3.38), 'cam:5');
    if (this.cam5Light) this.hold(a + s(3.45), this.cam5Hold, 'light');
    this.at(a + s(3.97), 'cam5-after', a);
  }

  onCam5After(a) {
    this.checks++;
    if (this.sim.bb.inOpening) {
      this.mode = 'attack-pending';
    } else if (this.sim.bb.stage === C.BB_STAGES - 1) {
      this.mode = 'tracking';
    } else {
      // A non-BB view is fail-closed in the real classifier. In the exact
      // simulator this branch means our state assumption was violated.
      this.missed++;
      this.mode = 'attack-pending';
    }
    this.tap(this.sim.frame + 2, 'cam:11');
    this.hold(this.sim.frame + 6, a + s(5) - (this.sim.frame + 8), 'wind');
  }

  scheduleAnchor(a) {
    if (this.mode === 'attack-pending') {
      this.attack(a);
      return;
    }
    if (this.mode === 'tracking' || this.mode === 'tracking-inline') {
      this.mode = 'tracking';
      this.tracking(a);
    } else {
      this.normal(a);
    }
    this.nextAnchor = a + s(5);
  }

  step() {
    const f = this.sim.frame;
    if (f === this.nextAnchor) this.scheduleAnchor(f);
    while (this.queue.length && this.queue[0][0] <= f) {
      const [, kind, act] = this.queue.shift();
      if (kind === 'left-snapshot') this.onLeftSnapshot(act);
      else if (kind === 'left-result') this.onLeftResult(act);
      else if (kind === 'cam5-before') this.onCam5Before(act);
      else if (kind === 'cam5-after') this.onCam5After(act);
      else if (kind === 'up') this.sim.release(act);
      else this.sim.press(act);
    }
    this.minBox = Math.min(this.minBox, this.sim.box);
  }
}

export function run(opts = {}) {
  const sim = new Sim(Object.assign({ seed: 1, night: 6 }, opts.sim));
  const bot = new HidPilot(sim, opts);
  while (sim.alive && !sim.won) {
    bot.step();
    sim.tick();
  }
  return { sim, bot };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = +(process.argv[2] || 500);
  const worst = process.argv.includes('--worst');
  const sparseCam5 = process.argv.includes('--sparse-cam5');
  const bbMode = process.argv.includes('--cam5') || sparseCam5 ? 'cam5'
    : (process.argv.includes('--no-bb') || process.argv.includes('--no-cam5')) ? 'none'
      : 'left';
  const cam5Light = !process.argv.includes('--hypothetical-unlit');
  const cam5MsArg = (process.argv.find(v => v.startsWith('--cam5-light-ms=')) || '').split('=')[1];
  const cam5Hold = cam5MsArg ? s(+cam5MsArg / 1000) : s(0.52);
  const phaseSafeMask = !process.argv.includes('--tick-aligned-mask');
  const alwaysThreat = process.argv.includes('--always-threat');
  const nightArg = (process.argv.find(v => v.startsWith('--night=')) || '').split('=')[1];
  const night = nightArg ? +nightArg : 6;
  let wins = 0, minBox = 1, minPower = Infinity, checks = 0, detections = 0;
  let attacks = 0, missed = 0;
  const fails = {};
  for (let i = 0; i < n; i++) {
    const { sim, bot } = run({ bbMode, cam5Light, sparseCam5, cam5Hold,
      phaseSafeMask, alwaysThreat,
      sim: { seed: (i * 2246822519) >>> 0, night, worst } });
    minBox = Math.min(minBox, bot.minBox);
    minPower = Math.min(minPower, sim.power);
    checks += bot.checks;
    detections += bot.detections;
    attacks += bot.attacks;
    missed += bot.missed;
    if (sim.won) wins++;
    else {
      const key = `${sim.death.reason}: ${sim.death.detail}`;
      fails[key] = (fails[key] || 0) + 1;
    }
  }
  const mode = bbMode === 'left' ? 'lit left-opening detection'
    : bbMode === 'cam5' ? `${sparseCam5 ? 'sparse phase-aligned ' : ''}CAM 05 tracking ` +
        `(${cam5Light ? `${cam5Hold}f lit` : 'unlit'})`
      : 'blind cycle';
  console.log(`${wins}/${n} survived night ${night} — HID multitouch + ${mode}` +
    `, ${phaseSafeMask ? 'phase-safe' : 'tick-aligned'} BB mask` +
    (worst ? ' (worst luck)' : ''));
  for (const [key, count] of Object.entries(fails).sort((a, b) => b[1] - a[1]))
    console.log(`  ${count}x  ${key}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower} | ` +
    `${checks} BB reads, ${detections} detections, ${attacks} attacks, ${missed} missed states`);
}
