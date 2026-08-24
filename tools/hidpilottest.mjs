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
                     sparseLeft = false, cam5Hold = s(0.52),
                     pilotOffset = 0, vocalCam5 = false, dropVocal = 0,
                     vocalFalseCount = 0, bangCam5 = false, dropBang = 0,
                     bangFalseCount = 0, deviceSweep = false,
                     sweepSlotMs = 240 } = {}) {
    this.sim = sim;
    this.bbMode = bbMode;
    this.cam5 = bbMode === 'cam5';
    this.cam5Light = cam5Light;
    this.sparseCam5 = sparseCam5;
    this.sparseLeft = sparseLeft;
    this.vocalCam5 = vocalCam5;
    this.bangCam5 = bangCam5;
    this.deviceSweep = deviceSweep;
    this.sweepSlotMs = sweepSlotMs;
    this.sweepFrames = deviceSweep ? s((70 + 3 * sweepSlotMs) / 1000) : 16;
    this.sweepOffsets = deviceSweep
      ? [s(0.070), s((70 + sweepSlotMs) / 1000),
        s((70 + 2 * sweepSlotMs) / 1000)]
      : TARGET_OFFSETS.map(offset => s(offset));
    this.cam5Hold = cam5Hold;
    this.epoch = pilotOffset;
    this.phaseSafeMask = phaseSafeMask;
    this.alwaysThreat = alwaysThreat;
    this.queue = [];
    this.mode = 'normal';
    this.nextAnchor = this.epoch + s(7);
    // BB starts at CAM 10. Four successful five-second rolls are needed to
    // reach CAM 05, so a pre-boundary sensor cannot first be useful until the
    // fifth boundary at 25 s (the read itself completes at 24.7 s).
    this.cam5SafeAt = (vocalCam5 || bangCam5) ? Infinity
      : sparseCam5 ? this.epoch + s(24.7) : 0;
    // A perfect BB reaches the opening on the fifth five-second opportunity.
    // The first five-second pilot anchor after that edge is 27 s. Unlike the
    // CAM-05 bound, this sensor is the battery-free left vent light.
    this.leftSafeAt = sparseLeft ? this.epoch + s(27) : 0;
    this.checks = 0;
    this.detections = 0;
    this.attacks = 0;
    this.missed = 0;
    this.eventCursor = 0;
    this.trueVocals = 0;
    this.vocalsSeen = vocalFalseCount;
    this.dropVocal = dropVocal;
    this.audioMisses = 0;
    // The bang policy counts, because counting is all the phone supports: a
    // Balloon Boy cycle is exactly three bangs (g416 reaches CAM 05, g417
    // enters the opening, g292/294 leaves) and his first three hops are silent.
    this.dropBang = dropBang;
    this.trueBangs = 0;
    this.bangs = 0;
    this.falseBangs = bangFalseCount;
    if (vocalCam5 && this.vocalsSeen >= 3) this.cam5SafeAt = this.epoch;
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
    const e = this.epoch;
    this.tap(e + s(0.18), 'monitor');
    this.tap(e + s(0.46), 'cam:11');
    const openingSweep = this.deviceSweep
      ? e + s(6.5) - this.sweepFrames : e + s(6.25);
    const openingWindEnd = this.deviceSweep ? openingSweep - 1 : e + s(6.10);
    this.hold(e + s(0.52), openingWindEnd - (e + s(0.52)), 'wind');
    // The left-opening cycle deliberately flashes late. Put the opening
    // sweep late as well so its stun cannot expire before cycle zero's sweep.
    const end = this.flashTargets(openingSweep);
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
    this.hold(start, this.sweepFrames, 'light');
    for (const [i, cam] of targets.entries())
      this.tap(start + this.sweepOffsets[i], `cam:${cam}`);
    return start + this.sweepFrames;
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
      if (this.sparseLeft) {
        if (a < this.leftSafeAt) this.leftIdle(a);
        else this.sparseLeftNormal(a);
      } else {
        this.leftNormal(a);
      }
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

  // Night 7's cheap steady cycle while BB provably cannot be in the opening.
  // The sweep finishes on the next anchor, retaining the same five-second
  // refresh cadence as the ordinary left route while maximizing box time.
  leftIdle(a) {
    const sweepStart = a + s(5) - this.sweepFrames;
    this.tap(a, 'monitor');
    this.tap(a + s(0.40), 'mask');
    this.tap(a + s(0.70), 'mask');
    this.hold(a + s(1.10), s(0.08), 'light');
    this.tap(a + s(1.30), 'monitor');
    this.tap(a + s(1.62), 'cam:11');
    this.hold(a + s(1.74), sweepStart - 1 - (a + s(1.74)), 'wind');
    this.flashTargets(sweepStart);
  }

  // Phase-windowed Night 7 candidate. Clear a possible office Golden Freddy
  // and reset Foxy before paying for the free left-opening observation. The
  // 28-frame vent hold exceeds the three observed immutable-buffer latches
  // (360/434/431 ms from light-down) but remains a device promotion gate, not
  // a claim that this exact table has run on the phone.
  sparseLeftNormal(a) {
    this.tap(a, 'monitor');
    this.tap(a + 23, 'mask');
    this.tap(a + 36, 'mask');
    this.hold(a + 52, 5, 'light');
    this.hold(a + 59, 28, 'ventL');
    this.at(a + 86, 'left-snapshot', a);
    this.tap(a + 88, 'mask');
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

  // A negative sparse read rules out the opening at this instant. The monitor
  // may stay up across the next movement opportunity: BB can at most move onto
  // CAM 05 there, and the following sparse read catches a final hop.
  sparseLeftClear(a, resultAt) {
    const sweepStart = a + s(5) - this.sweepFrames;
    this.tap(resultAt + 1, 'mask');
    this.tap(a + 119, 'monitor');
    this.tap(a + 135, 'cam:11');
    this.hold(a + 140, sweepStart - 1 - (a + 140), 'wind');
    this.flashTargets(sweepStart);
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

  // The pre-read hall pulse makes the aligned five-tick hold affordable on
  // Night 7. This is deliberately phase-windowed: extending the mask by the
  // one-second phase-independent margin lets the previous camera stuns expire.
  // `--pilot-offset-ms` prices that dependency against the game's scheduler.
  sparseLeftAttack(a) {
    this.attacks++;
    const lateSweepStart = a + s(10) - this.sweepFrames;
    const off = a + s(6.02);
    this.tap(off, 'mask');
    this.hold(off + s(0.25), s(0.08), 'light');
    this.tap(off + s(0.25), 'monitor');
    const end = this.flashTargets(off + s(0.45));
    this.tap(end + s(0.05), 'cam:11');
    const windEnd = this.deviceSweep ? lateSweepStart - 1 : a + s(9.46);
    this.hold(end + s(0.13), Math.max(1, windEnd - (end + s(0.13))), 'wind');
    this.flashTargets(lateSweepStart);
    // BB can leave on the first masked scheduler tick. Twenty-five seconds
    // from this anchor is therefore the conservative next useful read.
    this.leftSafeAt = a + s(25);
    this.nextAnchor = a + s(10);
  }

  onLeftResult(sample) {
    if (!sample.bb) {
      if (sample.inside) this.missed++;
      if (this.sparseLeft) this.sparseLeftClear(sample.a, this.sim.frame);
      else this.leftClear(sample.a, this.sim.frame);
      return;
    }
    this.detections++;
    if (this.sparseLeft) this.sparseLeftAttack(sample.a);
    else this.leftAttack(sample.a);
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
    this.cam5SafeAt = (this.vocalCam5 || this.bangCam5) ? Infinity
      : this.sparseCam5 ? a + s(22.7) : a + s(10);
    this.mode = 'normal';
    this.nextAnchor = a + s(10);
  }

  onCam5Before(a) {
    this.checks++;
    if (this.sim.bb.stage !== C.BB_STAGES - 1) {
      // The read is the ground truth the bang count is not. He is not on
      // CAM 05, so whatever armed this was wrong: drop the count and wait for
      // a fresh first bang rather than carrying a corrupted phase all night.
      if (this.bangCam5) { this.bangs = 0; this.cam5SafeAt = Infinity; }
      if (this.sim.bb.inOpening || this.sim.bb.inside) this.missed++;
      this.tap(this.sim.frame + 2, 'cam:11');
      this.hold(this.sim.frame + 6, a + s(5) - (this.sim.frame + 8), 'wind');
      return;
    }
    this.detections++;
    // Confirmed on CAM 05: that is bang one of the cycle, whatever the count
    // said before.
    if (this.bangCam5) this.bangs = 1;
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

  // Perfect-cue upper bound for plan 08. The third sourced vocal means BB has
  // just reached CAM 05, so the next pre-boundary visual read can confirm him
  // once instead of scanning every possible movement boundary. `dropVocal`
  // deliberately removes one true vocal per approach to expose the policy's
  // false-negative tolerance; it is not a detector model.
  // The bang is the loud cue (channel 15 at volume 50) and, while Minus 7's
  // stalls hold and the box is wound, Balloon Boy is its only source -- every
  // other writer of that register is one of the seven stun-locked, and W. Foxy
  // and Golden Freddy never write it. So this reads *only* that a bang
  // happened. It deliberately ignores `who`, `cam` and `leaving`: none of them
  // is recoverable from audio, and a controller that consulted them would be
  // modelling a sensor that does not exist. A bang from a unit whose stall
  // lapsed therefore corrupts the count here exactly as it would on device.
  processBangEvents() {
    // A cycle is exactly three bangs -- reaches CAM 05, enters the opening,
    // leaves -- and his first three hops are silent. The count alone is as
    // brittle as the vocal count it replaces, so the CAM 05 read re-syncs it:
    // the read is ground truth about where he is, and the bang only decides
    // when to spend one. There is no cheaper fallback to degrade to, because
    // reading on a fixed schedule is itself 0/300 on power.
    if (this.falseBangs > 0) {
      this.falseBangs--;
      this.bangs++;
      if (this.bangs === 1) this.cam5SafeAt = Math.min(this.cam5SafeAt, this.sim.frame);
    }
    while (this.eventCursor < this.sim.events.length) {
      const event = this.sim.events[this.eventCursor++];
      if (event.type !== 'vent-bang' || event.data?.sample !== C.THUD_SAMPLE)
        continue;
      this.trueBangs++;
      if (this.dropBang === this.trueBangs) { this.audioMisses++; continue; }
      this.bangs++;
      if (this.bangs === 1) {
        this.cam5SafeAt = Math.min(this.cam5SafeAt, this.sim.frame);
      } else if (this.bangs >= 3) {
        this.bangs = 0;
        this.cam5SafeAt = Infinity;
      }
    }
  }

  processAudioEvents() {
    if (this.bangCam5) return this.processBangEvents();
    if (!this.vocalCam5) return;
    while (this.eventCursor < this.sim.events.length) {
      const event = this.sim.events[this.eventCursor++];
      if (event.type === 'laugh') {
        this.trueVocals++;
        if (this.dropVocal === this.trueVocals) {
          this.audioMisses++;
          continue;
        }
        this.vocalsSeen++;
        if (this.vocalsSeen >= 3)
          this.cam5SafeAt = Math.min(this.cam5SafeAt, this.sim.frame);
      } else if (event.type === 'vent-bang' && event.data?.who === 'bb' &&
                 event.data.leaving) {
        this.trueVocals = 0;
        this.vocalsSeen = 0;
        this.cam5SafeAt = Infinity;
      }
    }
  }

  step() {
    const f = this.sim.frame;
    this.processAudioEvents();
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
  const cliArgs = process.argv.slice(2);
  const n = cliArgs[0] && !cliArgs[0].startsWith('--') ? +cliArgs.shift() : 500;
  const exactArgs = new Set(['--worst', '--sparse-cam5', '--sparse-left',
    '--vocal-cam5', '--bang-cam5', '--device-sweep', '--cam5', '--no-bb', '--no-cam5',
    '--hypothetical-unlit', '--tick-aligned-mask', '--always-threat',
    '--assert', '--assert-rejected']);
  const valuedArgs = ['--sweep-slot-ms=', '--cam5-light-ms=',
    '--pilot-offset-ms=', '--drop-vocal=', '--vocal-false-count=',
    '--drop-bang=', '--false-bang=', '--night='];
  const unknownArgs = cliArgs.filter(arg => !exactArgs.has(arg) &&
    !valuedArgs.some(prefix => arg.startsWith(prefix)));
  if (unknownArgs.length) throw new Error(`unknown argument: ${unknownArgs.join(', ')}`);
  const worst = cliArgs.includes('--worst');
  const sparseCam5 = cliArgs.includes('--sparse-cam5');
  const sparseLeft = cliArgs.includes('--sparse-left');
  const vocalCam5 = cliArgs.includes('--vocal-cam5');
  const bangCam5 = cliArgs.includes('--bang-cam5');
  const sweepSlotArg = (cliArgs.find(v => v.startsWith('--sweep-slot-ms=')) || '').split('=')[1];
  const deviceSweep = cliArgs.includes('--device-sweep') || Boolean(sweepSlotArg);
  const sweepSlotMs = sweepSlotArg ? +sweepSlotArg : 240;
  const bbMode = cliArgs.includes('--cam5') || sparseCam5 || vocalCam5 || bangCam5 ? 'cam5'
    : (cliArgs.includes('--no-bb') || cliArgs.includes('--no-cam5')) ? 'none'
      : 'left';
  const cam5Light = !cliArgs.includes('--hypothetical-unlit');
  const cam5MsArg = (cliArgs.find(v => v.startsWith('--cam5-light-ms=')) || '').split('=')[1];
  const cam5Hold = cam5MsArg ? s(+cam5MsArg / 1000) : s(0.52);
  const offsetMsArg = (cliArgs.find(v => v.startsWith('--pilot-offset-ms=')) || '').split('=')[1];
  const pilotOffset = offsetMsArg ? s(+offsetMsArg / 1000) : 0;
  const dropVocalArg = (cliArgs.find(v => v.startsWith('--drop-vocal=')) || '').split('=')[1];
  const dropVocal = dropVocalArg ? +dropVocalArg : 0;
  const falseVocalArg = (cliArgs.find(v => v.startsWith('--vocal-false-count=')) || '').split('=')[1];
  const vocalFalseCount = falseVocalArg ? +falseVocalArg : 0;
  const dropBangArg = (cliArgs.find(v => v.startsWith('--drop-bang=')) || '').split('=')[1];
  const dropBang = dropBangArg ? +dropBangArg : 0;
  const falseBangArg = (cliArgs.find(v => v.startsWith('--false-bang=')) || '').split('=')[1];
  const bangFalseCount = falseBangArg ? +falseBangArg : 0;
  const phaseSafeMask = !cliArgs.includes('--tick-aligned-mask');
  const alwaysThreat = cliArgs.includes('--always-threat');
  const assertSurvival = cliArgs.includes('--assert');
  const assertRejected = cliArgs.includes('--assert-rejected');
  const nightArg = (cliArgs.find(v => v.startsWith('--night=')) || '').split('=')[1];
  const night = nightArg ? +nightArg : 6;
  if (!Number.isInteger(n) || n <= 0 || !Number.isFinite(pilotOffset) || pilotOffset < 0 ||
      !Number.isFinite(sweepSlotMs) || sweepSlotMs < 100 || sweepSlotMs > 500 ||
      !Number.isFinite(cam5Hold) || cam5Hold < 0)
    throw new Error('runs and timing controls must be finite and in their documented ranges');
  if (![0, 1, 2, 3].includes(dropVocal) || ![0, 1, 2, 3].includes(vocalFalseCount))
    throw new Error('--drop-vocal and --vocal-false-count must be integers from 0 to 3');
  if ([sparseLeft, sparseCam5, vocalCam5, bangCam5].filter(Boolean).length > 1)
    throw new Error('--sparse-left, --sparse-cam5, --vocal-cam5 and --bang-cam5 are exclusive');
  if (![0, 1, 2, 3].includes(dropBang) || ![0, 1, 2].includes(bangFalseCount))
    throw new Error('--drop-bang= must be 0-3 and --false-bang= 0-2');
  if (!bangCam5 && (dropBang || bangFalseCount))
    throw new Error('bang error controls require --bang-cam5');
  if (sparseLeft && bbMode !== 'left')
    throw new Error('--sparse-left cannot be combined with a CAM-05 or no-BB mode');
  if (deviceSweep && !sparseLeft)
    throw new Error('--device-sweep requires --sparse-left');
  if (!vocalCam5 && (dropVocal || vocalFalseCount))
    throw new Error('vocal error controls require --vocal-cam5');
  if (assertSurvival && assertRejected)
    throw new Error('--assert and --assert-rejected are exclusive');
  if (assertRejected && !deviceSweep)
    throw new Error('--assert-rejected requires a device sweep profile');
  let wins = 0, minBox = 1, minPower = Infinity, checks = 0, detections = 0;
  let attacks = 0, missed = 0, audioMisses = 0;
  const fails = {};
  for (let i = 0; i < n; i++) {
    const { sim, bot } = run({ bbMode, cam5Light, sparseCam5, sparseLeft,
      vocalCam5, dropVocal, vocalFalseCount, bangCam5, dropBang,
      bangFalseCount, cam5Hold, pilotOffset,
      phaseSafeMask, alwaysThreat, deviceSweep, sweepSlotMs,
      sim: { seed: (i * 2246822519) >>> 0, night, worst } });
    minBox = Math.min(minBox, bot.minBox);
    minPower = Math.min(minPower, sim.power);
    checks += bot.checks;
    detections += bot.detections;
    attacks += bot.attacks;
    missed += bot.missed;
    audioMisses += bot.audioMisses;
    if (sim.won) wins++;
    else {
      const key = `${sim.death.reason}: ${sim.death.detail}`;
      fails[key] = (fails[key] || 0) + 1;
    }
  }
  const mode = bbMode === 'left' ?
      `${sparseLeft ? 'sparse phase-windowed ' : ''}lit left-opening detection`
    : bbMode === 'cam5' ? `${bangCam5 ? 'bang-armed ' : vocalCam5 ? 'third-vocal-armed ' :
        sparseCam5 ? 'sparse phase-aligned ' : ''}CAM 05 tracking ` +
        `(${cam5Light ? `${cam5Hold}f lit` : 'unlit'})`
      : 'blind cycle';
  console.log(`${wins}/${n} survived night ${night} — HID multitouch + ${mode}` +
    `, ${sparseLeft ? `${pilotOffset}f pilot offset${deviceSweep ? `, ${sweepSlotMs}ms device feed slots` : ''}` :
      `${phaseSafeMask ? 'phase-safe' : 'tick-aligned'} BB mask`}` +
    (worst ? ' (worst luck)' : ''));
  for (const [key, count] of Object.entries(fails).sort((a, b) => b[1] - a[1]))
    console.log(`  ${count}x  ${key}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower} | ` +
    `${checks} BB reads, ${detections} detections, ${attacks} attacks, ${missed} missed states` +
    (vocalCam5 ? `, ${audioMisses} forced vocal misses` : '') +
    (bangCam5 ? `, ${audioMisses} forced bang misses` : ''));
  if (assertSurvival && (wins !== n || missed !== 0)) process.exitCode = 1;
  if (assertRejected && wins !== 0) process.exitCode = 1;
}
