// The gate-aware controller that tools/gatesearch.mjs searches over: a short,
// human-readable policy reacting to visible office threats, Balloon Boy and the
// box gauge, rather than a learned agent.
//
// It lives apart from the search so the worker pool can import it as a task
// module. A pool must never be pointed at the CLI script that is driving it:
// the worker inherits process.argv and would re-run the search, and on the
// single-threaded path the self-import deadlocks against its own top-level
// await.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';

export class GateBot {
  constructor(sim, policy) {
    this.sim = sim;
    this.policy = policy;
    this.nextAnchor = C.s(2);
    this.plan = [];
    this.busyUntil = -1;
    this.windMode = false;
    this.reactiveMask = false;
    this.inputs = 0;
    this.branches = { wind: 0, skip: 0, threat: 0, gfHold: 0 };
  }

  // A decision cycle starts at :X2/:X7 and is back down before the movement
  // check three seconds later. Camera anchors are refreshed on every cycle;
  // winding is conditional on the box crossing the low/high thresholds.
  queue(anchor) {
    const s = this.sim, p = this.policy;
    // A clock-phased policy names one camera set per stretch of the night.
    // Kept as data rather than a closure so a policy can cross to a worker.
    const targets = p.phases
      ? p.phases[Math.min(p.phases.length - 1, Math.floor(anchor / p.phaseSplit))]
      : p.targets;
    if (s.box <= p.windLow) this.windMode = true;
    else if (s.box >= p.windHigh) this.windMode = false;
    const wind = this.windMode;
    this.branches[wind ? 'wind' : 'skip']++;

    const rows = [
      [0, 'set-down', 'monitor'],
      [18, 'tap', 'mask'], [27, 'tap', 'mask'],
      [30, 'down', 'light'], [32, 'up', 'light'],
    ];
    // A camera anchor must be refreshed every five seconds, even in a cycle
    // where the box is healthy enough to skip winding.
    if (wind || targets.length) {
      rows.push([42, 'set-up', 'monitor']);
      let t = 57;
      for (const cam of targets) {
        rows.push([t, 'tap', `cam:${cam}`], [t + 2, 'down', 'light'], [t + 4, 'up', 'light']);
        t += 10;
      }
      if (wind) {
        // A low box earns two bounded excursions across a ten-second recovery
        // phase. The split resets both the sourced cams-up entry streak and
        // Foxy's D; one nearly-six-second trip proved entry-safe but left Foxy
        // enough uninterrupted time to lock on.
        rows.push([t, 'tap', `cam:${C.BOX_CAM}`], [t + 3, 'down', 'wind']);
        rows.push([155, 'up', 'wind'], [157, 'set-down', 'monitor'],
          [168, 'down', 'light'], [170, 'up', 'light'],
          [195, 'set-up', 'monitor'], [210, 'tap', `cam:${C.BOX_CAM}`],
          [213, 'down', 'wind']);
        let mid = 305;
        for (const cam of targets) {
          rows.push([mid, 'tap', `cam:${cam}`], [mid + 2, 'down', 'light'], [mid + 4, 'up', 'light']);
          mid += 10;
        }
        if (targets.length) rows.push([mid, 'tap', `cam:${C.BOX_CAM}`], [mid + 3, 'down', 'wind']);
        rows.push([438, 'up', 'wind'], [440, 'set-down', 'monitor'],
          [450, 'down', 'light'], [452, 'up', 'light']);
        this.busyUntil = anchor + 455;
      } else {
        rows.push([t + 2, 'set-down', 'monitor']);
      }
    }
    // Optional second pulse lands just before the movement check. Besides
    // Foxy duty, it re-arms the sourced office-light route stall.
    if (p.lightPulse && !wind) rows.push([168, 'down', 'light'], [170, 'up', 'light']);

    const base = p.jitter ? Math.floor(s.rng.next() * p.jitter) : 0;
    const spread = p.jitter ? Math.max(1, Math.round(p.jitter / 3)) : 0;
    this.plan.push(...rows.map(([o, kind, act]) =>
      [anchor + o + base + (spread ? Math.floor(s.rng.next() * spread) : 0), kind, act])
      .sort((a, b) => a[0] - b[0]));
  }

  act(kind, action) {
    const s = this.sim;
    if (kind === 'set-down') {
      if (s.monitor === 'up' || s.monitor === 'raising') { s.press('monitor'); this.inputs++; }
      return;
    }
    if (kind === 'set-up') {
      if (!this.reactiveMask && s.monitor !== 'up' && s.monitor !== 'raising') {
        s.press('monitor'); this.inputs++;
      }
      return;
    }
    // Hall Golden Freddy is visible when the office light comes on. Holding
    // fire is a real observable branch, and Foxy's arrival evicts him.
    if (action === 'light' && kind === 'down' && s.hallView && s.gf.inHall) {
      this.branches.gfHold++;
      return;
    }
    if (kind === 'up') s.release(action);
    else s.press(action);
    this.inputs++;
  }

  step() {
    const s = this.sim;
    while (this.nextAnchor <= s.frame) {
      if (this.nextAnchor >= this.busyUntil) this.queue(this.nextAnchor);
      this.nextAnchor += C.MO_FRAMES;
    }

    // Toys use the shared continuous cams-up streak and Mangle is parkable in
    // the current vent-light interpretation. The Withereds are exceptions:
    // their per-unit timers require a mask even when every box trip is short.
    // BB and office Golden Freddy are harmless for the remainder of the
    // *current* continuous cams-up session. Finish the bounded wind, then mask
    // them as soon as the planned drop begins; reacting while still up merely
    // throws away safe box time.
    // React only to represented observable state. An earlier diagnostic read
    // the hidden Withered openingReadyAt and masked one frame before it armed;
    // Android source shows W. Bonnie cannot be cleared until his separate
    // office overlay appears, so that privileged shortcut was invalid.
    const threat = s.blackout.active ||
      (!s.camsUp && (s.bb.inOpening || s.gf.present));
    if (threat) {
      if (!this.reactiveMask) this.branches.threat++;
      this.reactiveMask = true;
      this.busyUntil = s.frame;
      // Threat handling preempts a box trip. Lower first, then bank mask time
      // until every visible office/vent threat has resolved.
      this.plan = this.plan.filter(([, kind, act]) =>
        kind === 'set-down' || (act !== 'monitor' && act !== 'wind' && !act.startsWith('cam:')));
      if (s.winding) { s.release('wind'); this.inputs++; }
      if (s.monitor === 'up' || s.monitor === 'raising') { s.press('monitor'); this.inputs++; }
      if (!s.maskOn) { s.press('mask'); this.inputs++; }
    } else if (this.reactiveMask) {
      if (s.maskOn) { s.press('mask'); this.inputs++; }
      this.reactiveMask = false;
      // A long BB/blackout mask hold feeds Foxy's D. Pay the hall flash back
      // immediately on mask-off instead of waiting for the next clock anchor.
      if (s.foxy.loc === 'hall' && !s.foxy.gotYou && !s.gf.inHall) {
        s.press('light'); s.release('light'); this.inputs += 2;
      }
    }

    while (this.plan.length && this.plan[0][0] <= s.frame) {
      const [, kind, act] = this.plan.shift();
      // Scripted mask flicks and camera raises never override an emergency hold.
      if (this.reactiveMask && (act === 'mask' || kind === 'set-up')) continue;
      this.act(kind, act);
    }
  }
}

export function runPolicy(opts = {}) {
  const sim = new Sim({ seed: opts.seed ?? 999, worst: !!opts.worst, record: false });
  const bot = new GateBot(sim, {
    targets: opts.targets || [],
    phases: opts.phases || null,
    phaseSplit: opts.phaseSplit || 0,
    windLow: opts.windLow ?? 0.55,
    windHigh: opts.windHigh ?? 0.85,
    lightPulse: !!opts.lightPulse,
    jitter: opts.jitter || 0,
  });
  let minBox = 1;
  while (sim.alive && !sim.won) {
    bot.step(); sim.tick(); minBox = Math.min(minBox, sim.box);
  }
  return { sim, bot, minBox };
}

// Pool task: one night reduced to a structured-cloneable summary. A worker
// cannot hand back a Sim, so everything sample() ranks on comes through here.
export function summarizePolicy(opts) {
  const { sim, bot, minBox } = runPolicy(opts);
  return { won: sim.won, reason: sim.death?.reason || 'unknown',
           minBox, power: sim.power, inputs: bot.inputs };
}
