// Gate-aware strategy search (plan 06).
//
// The sourced route graph exposes a strategy family that a fixed camera-cover
// permutation cannot express: keep the monitor down across movement checks,
// make short trips for the music box, and optionally refresh one camera anchor
// on those trips. Music-box trips use visible box thresholds with hysteresis,
// rather than a fixed metronome, so recovery time is spent only when needed.
//
// The controller is deliberately a short, human-readable policy, not a learned
// agent. It reacts to visible office threats, Balloon Boy and the box gauge.
// Results remain model claims: camera-light stalling is still not located in
// the mobile source, and several office/vent details are approximated.
//
//   node tools/gatesearch.mjs [--quick]
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

const F = C.FPS;
const QUICK = process.argv.includes('--quick');
const SEED = i => (i * 2246822519) >>> 0;

// A decision cycle starts at :X2/:X7 and is back down before the movement
// check three seconds later. Camera anchors are refreshed on every cycle;
// winding is conditional on the box crossing the low/high thresholds.
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

  queue(anchor) {
    const s = this.sim, p = this.policy;
    const targets = typeof p.targets === 'function' ? p.targets(anchor, s) : p.targets;
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
    // Perfect-information upper bound: finish any safe winding before a
    // Withered's individual opening timer arms, then drop/mask one frame early.
    // A human version would need vent cues or a conservative earlier cutoff.
    const maskRequired = s.units.some(u => u.atOpening && u.openingRule === 'mask' &&
      s.frame + 1 >= u.openingReadyAt);
    const threat = s.blackout.active || maskRequired ||
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

function sample(policy, n, extras = {}) {
  let survived = 0, minBox = 1, minPower = C.POWER_FRAMES, inputs = 0;
  const deaths = {};
  for (let i = 0; i < n; i++) {
    const r = runPolicy({ ...policy, ...extras, seed: SEED(i) });
    minBox = Math.min(minBox, r.minBox);
    minPower = Math.min(minPower, r.sim.power);
    inputs += r.bot.inputs;
    if (r.sim.won) survived++;
    else {
      const reason = r.sim.death?.reason || 'unknown';
      deaths[reason] = (deaths[reason] || 0) + 1;
    }
  }
  return { survived, n, minBox, minPower, inputs: Math.round(inputs / n), deaths };
}

const pct = r => `${Math.round(r.survived / r.n * 100)}%`;
const structures = [
  { name: 'monitor denial', targets: [] },
  { name: 'Minus Right / CAM 06', targets: [6] },
  { name: 'CAM 07-only', targets: [7] },
  { name: 'Minus Two / CAM 03', targets: [3] },
  { name: 'CAM 06 + 07 hybrid', targets: [6, 7] },
];
const phaseSets = [
  { label: 'none', cams: [] }, { label: '03', cams: [3] },
  { label: '06', cams: [6] }, { label: '07', cams: [7] },
  { label: '67', cams: [6, 7] },
];
const thresholds = [[0.35, 0.65], [0.50, 0.80], [0.65, 0.90], [0.80, 0.95],
  [0.90, 1.00], [0.99, 1.00]];

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const searchN = QUICK ? 16 : 40;
  const validN = QUICK ? 40 : 150;
  console.log('gate-aware search: reactive winding + documented hybrid candidates (night 7)');
  console.log('caveat: model claims only; camera-flash stall is still unlocated in the mobile source\n');

  for (const structure of structures) {
    let best = null;
    for (const [windLow, windHigh] of thresholds) {
      for (const lightPulse of [false, true]) {
        const policy = { ...structure, windLow, windHigh, lightPulse };
        const clean = sample(policy, searchN);
        const score = clean.survived * 1e6 + clean.minBox * 1e3 - clean.inputs;
        if (!best || score > best.score) best = { policy, clean, score };
      }
    }
    const clean = sample(best.policy, validN);
    const pinned = sample(best.policy, validN, { worst: true });
    const j100 = sample(best.policy, validN, { jitter: Math.round(0.100 * F) });
    const j200 = sample(best.policy, validN, { jitter: Math.round(0.200 * F) });
    const p = best.policy;
    console.log(`  ${structure.name.padEnd(24)} low/high ${p.windLow.toFixed(2)}/${p.windHigh.toFixed(2)}${p.lightPulse ? ' +light' : '       '}`);
    console.log(`    clean ${pct(clean).padStart(4)}  pinned ${pct(pinned).padStart(4)}  j100 ${pct(j100).padStart(4)}  j200 ${pct(j200).padStart(4)}  box ${(clean.minBox * 100).toFixed(0)}%  pw ${clean.minPower}  inputs ${clean.inputs}`);
    const top = Object.entries(clean.deaths).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) console.log(`    deaths: ${top.map(([k, v]) => `${v}x ${k}`).join(', ')}`);
  }

  // Three clock-readable phases: 0-2 AM, 2-4 AM and 4-6 AM. This is the
  // bounded version of plan 06's phase-based branch; hidden route state is not
  // used, so any survivor can be played from the night clock alone.
  const phaseN = QUICK ? 10 : 24;
  let phaseBest = null;
  for (const a of phaseSets) for (const b of phaseSets) for (const c of phaseSets) {
    const targets = anchor => [a, b, c][Math.min(2, Math.floor(anchor / (140 * F)))].cams;
    const policy = { targets, windLow: 0.65, windHigh: 0.90, lightPulse: false };
    const clean = sample(policy, phaseN);
    const j200 = sample(policy, phaseN, { jitter: Math.round(0.200 * F) });
    const score = [clean.survived, j200.survived, Math.round(clean.minBox * 1000), -clean.inputs];
    if (!phaseBest || score.some((v, i) => v !== phaseBest.score[i] &&
        v > phaseBest.score[i] && score.slice(0, i).every((x, j) => x === phaseBest.score[j]))) {
      phaseBest = { labels: [a.label, b.label, c.label], policy, score };
    }
  }
  const phaseClean = sample(phaseBest.policy, validN);
  const phasePinned = sample(phaseBest.policy, validN, { worst: true });
  const phaseJ100 = sample(phaseBest.policy, validN, { jitter: Math.round(0.100 * F) });
  const phaseJ200 = sample(phaseBest.policy, validN, { jitter: Math.round(0.200 * F) });
  console.log(`\n  best clock-phased set      ${phaseBest.labels.join(' -> ')}`);
  console.log(`    clean ${pct(phaseClean).padStart(4)}  pinned ${pct(phasePinned).padStart(4)}  j100 ${pct(phaseJ100).padStart(4)}  j200 ${pct(phaseJ200).padStart(4)}  box ${(phaseClean.minBox * 100).toFixed(0)}%  pw ${phaseClean.minPower}  inputs ${phaseClean.inputs}`);
  console.log('\nMinus 7 regression: node tools/bbtest.mjs 200');
}
