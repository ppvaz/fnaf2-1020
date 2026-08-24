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
const TARGETS = [7, 4, 10];

class HidPilot {
  constructor(sim, { cam5 = true, cam5Light = true } = {}) {
    this.sim = sim;
    this.cam5 = cam5;
    this.cam5Light = cam5Light;
    this.queue = [];
    this.mode = 'normal';
    this.nextAnchor = s(7);
    this.cam5SafeAt = 0;
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
    this.hold(s(0.52), s(2.90), 'wind');
    this.flashTargets(s(3.50));
    this.tap(s(4.23), 'cam:11');
    this.hold(s(4.30), s(2.65), 'wind');
  }

  flashTargets(f) {
    const start = f;
    // One 340 ms light hold covers three independent contact-1 taps. Each
    // selected feed receives at least 100 ms (> the sourced 60 ms pulse),
    // while one persistent light contact eliminates the helper gaps.
    this.hold(start, s(0.34), 'light');
    for (const [i, cam] of TARGETS.entries())
      this.tap(start + s(0.03 + i * 0.10), `cam:${cam}`);
    return start + s(0.36);
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
    this.normalFront(a);
    const shouldCheck = this.cam5 && a + s(2.70) >= this.cam5SafeAt;
    if (shouldCheck) {
      this.tap(a + s(2.10), 'cam:5');
      if (this.cam5Light) this.hold(a + s(2.18), s(0.52), 'light');
      this.at(a + s(2.70), 'cam5-before', a);
    } else {
      this.tap(a + s(2.12), 'cam:11');
      this.hold(a + s(2.20), s(2.75), 'wind');
    }
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
    if (this.cam5Light) this.hold(a + s(3.45), s(0.52), 'light');
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
    this.cam5SafeAt = a + s(10);
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
    if (this.cam5Light) this.hold(a + s(3.45), s(0.52), 'light');
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
      if (kind === 'cam5-before') this.onCam5Before(act);
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
  const cam5 = !process.argv.includes('--no-cam5');
  const cam5Light = !process.argv.includes('--hypothetical-unlit');
  const nightArg = (process.argv.find(v => v.startsWith('--night=')) || '').split('=')[1];
  const night = nightArg ? +nightArg : 6;
  let wins = 0, minBox = 1, minPower = Infinity, checks = 0, detections = 0;
  let attacks = 0, missed = 0;
  const fails = {};
  for (let i = 0; i < n; i++) {
    const { sim, bot } = run({ cam5, cam5Light,
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
  console.log(`${wins}/${n} survived night ${night} — HID multitouch + ${cam5 ? `CAM 05 tracking (${cam5Light ? 'lit' : 'unlit'})` : 'blind cycle'}` +
    (worst ? ' (worst luck)' : ''));
  for (const [key, count] of Object.entries(fails).sort((a, b) => b[1] - a[1]))
    console.log(`  ${count}x  ${key}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower} | ` +
    `${checks} CAM 05 reads, ${detections} detections, ${attacks} attacks, ${missed} missed states`);
}
