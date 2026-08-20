// Reactive "perfect player" including Balloon Boy. This is the real test of the
// model: if a correctly-played Minus 7 cannot clear the night here, either the
// routine in MINUS-7-STRATEGY.md is wrong or the engine is.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

// The scripted half of the routine, as frame offsets from the cycle anchor.
// tools/cyclesearch.mjs optimises alternatives to this table; everything the
// bot does reactively (BB phases, recovery) is built around whichever table
// is in use.
export const DEFAULT_CYCLE = [
  [0, 'tap', 'monitor'], [18, 'tap', 'mask'], [27, 'tap', 'mask'],
  [30, 'down', 'light'], [32, 'up', 'light'], [36, 'tap', 'monitor'],
  [55, 'tap', 'cam:10'], [57, 'down', 'light'], [59, 'up', 'light'],
  [67, 'tap', 'cam:4'], [69, 'down', 'light'], [71, 'up', 'light'],
  [79, 'tap', 'cam:7'], [81, 'down', 'light'], [83, 'up', 'light'],
  [90, 'tap', 'cam:11'], [93, 'down', 'wind'],
];

const A = (f) => { // next frame landing on a :X2 / :X7 second boundary
  for (let k = 0; k < 12 * C.FPS; k++) {
    const g = f + k;
    if (g % C.FPS === 0) { const d = (g / C.FPS) % 10; if (d === 2 || d === 7) return g; }
  }
  return f;
};

export class Bot {
  constructor(sim, table = DEFAULT_CYCLE, targets = null) {
    this.sim = sim; this.table = table;
    // The BB attack/recovery path has to refresh the same camera set as the
    // regular cycle.  Derive it from the table by default so search tools can
    // evaluate structurally different cycles without silently falling back to
    // Minus 7's 10/04/07 sweep.
    this.targets = targets || [...new Set(table
      .filter(([, , act]) => act.startsWith('cam:') && act !== `cam:${C.BOX_CAM}`)
      .map(([, , act]) => +act.slice(4)))];
    this.plan = []; this.waiting = null; this.kind = 'start';
    this.plan = [[2, 'tap', 'monitor'], [20, 'tap', 'cam:11'], [24, 'down', 'wind']];
    this.nextAt = C.s(7);
  }

  cycle(a) {
    return this.table.map(([o, k, act]) => [a + o, k, act]);
  }

  // BB is in the vent camera: same cycle, but the cams must be DOWN across the
  // next 5s interval. That defers his last movement rather than denying it
  // (g417 latches), which is what buys a prepared arrival instead of a random one.
  phaseA(a) {
    const p = this.cycle(a);
    const drop = a + 150;                     // :X4.5 — before the interval
    const back = a + 150 + C.MONITOR_ANIM_DOWN * 3; // safely after it
    p.push([drop, 'tap', 'monitor'], [back, 'tap', 'monitor']);
    return p;
  }

  // BB is in the opening: flash everything, drop, mask, and wait for his bang.
  attack(a) {
    const p = [[a, 'down', 'light']];
    this.targets.forEach((cam, i) => p.push([a + 3 + i * 6, 'tap', `cam:${cam}`]));
    const drop = a + 4 + this.targets.length * 6;
    p.push([drop, 'tap', 'monitor'], [drop + 12, 'tap', 'mask'],
      [drop + 14, 'wait', 'bbgone']);
    return p;
  }

  recover(f) {
    // Raising the monitor re-exposes the final camera from attack() while the
    // light is still held, so only the preceding cameras need explicit taps.
    const p = [[f + 2, 'tap', 'mask'], [f + 5, 'tap', 'monitor']];
    this.targets.slice(0, -1).forEach((cam, i) =>
      p.push([f + 22 + i * 4, 'tap', `cam:${cam}`]));
    const lightUp = f + 22 + Math.max(1, this.targets.length - 1) * 4;
    p.push([lightUp, 'up', 'light'], [lightUp + 4, 'tap', `cam:${C.BOX_CAM}`],
      [lightUp + 7, 'down', 'wind']);
    return p;
  }

  step() {
    const s = this.sim, f = s.frame;

    // Waiting out a mask: the cams must stay down until BB's leaving bang.
    if (this.waiting === 'bbgone') {
      if (!s.bb.inOpening) { this.waiting = null; this.kind = 'recover'; this.plan = this.recover(f); }
      return;
    }

    // BB stepping into the opening overrides whatever we were doing. The attack
    // has to start with the cams already up, so we never queue a raise first.
    if (s.bb.inOpening && this.kind !== 'attack' && this.kind !== 'recover') {
      this.kind = 'attack';
      this.plan = this.attack(A(f + 1));
    }

    while (this.plan.length && this.plan[0][0] <= f) {
      const [, kind, act] = this.plan.shift();
      if (kind === 'wait') { this.waiting = act; return; }
      if (kind === 'up') s.release(act); else s.press(act);
    }
    if (this.plan.length) return;

    const a = A(f + 1);
    if (s.bb.inOpening) { this.kind = 'attack'; this.plan = this.attack(a); }
    else if (s.bb.stage >= C.BB_STAGES - 1) { this.kind = 'phaseA'; this.plan = this.phaseA(a); }
    else { this.kind = 'cycle'; this.plan = this.cycle(a); }
  }
}

export function run(opts = {}) {
  const jitter = opts.jitter || 0;
  const sim = new Sim(Object.assign({ seed: 999 }, opts));
  const bot = new Bot(sim, opts.cycle || DEFAULT_CYCLE, opts.targets || null);
  if (jitter) {
    // Human sloppiness: the whole cycle lands late by a random amount, with a
    // little spread inside it. Order is preserved -- this models a late player,
    // not one pressing things in the wrong sequence.
    const wrap = (fn) => (a) => {
      const base = Math.floor(sim.rng.next() * jitter);
      const spread = Math.max(1, Math.round(jitter / 3));
      return fn.call(bot, a)
        .map(([f, k, act]) => [f + base + Math.floor(sim.rng.next() * spread), k, act])
        .sort((x, y) => x[0] - y[0]);
    };
    bot.cycle = wrap(Bot.prototype.cycle);
    bot.phaseA = wrap(Bot.prototype.phaseA);
    bot.attack = wrap(Bot.prototype.attack);
    bot.recover = wrap(Bot.prototype.recover);
  }
  let minBox = 1;
  while (sim.alive && !sim.won) { bot.step(); sim.tick(); minBox = Math.min(minBox, sim.box); }
  return { sim, minBox };
}

// Pool task (tools/pool.mjs): one night reduced to a structured-cloneable
// summary. A worker cannot hand back a Sim, so everything the search tools
// rank on has to come through here.
export function summarize(opts) {
  const { sim, minBox } = run(opts);
  return { won: sim.won, reason: sim.death?.reason || 'unknown', minBox, power: sim.power };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const n = +(process.argv[2] || 200);
const fails = {}; let minB = 1, minP = C.POWER_FRAMES, lapses = 0;
for (let i = 0; i < n; i++) {
  const jf = (process.argv.find(a => a.startsWith('--jitter=')) || '').split('=')[1];
  const r = run({ seed: (i * 2246822519) >>> 0, worst: process.argv.includes('--worst'),
                  jitter: jf ? Math.round(+jf / 1000 * C.FPS) : 0,
                  record: true });   // the stun-lapse count below reads sim.rec
  minB = Math.min(minB, r.minBox); minP = Math.min(minP, r.sim.power);
  for (let k = 0; k < 3; k++)
    for (let j = 1; j < r.sim.rec.n; j++)
      if (r.sim.rec.stun[k][j] === 0 && r.sim.rec.stun[k][j - 1] > 0) lapses++;
  if (!r.sim.won) {
    const key = `${r.sim.death.reason}: ${r.sim.death.detail}`;
    fails[key] = (fails[key] || 0) + 1;
  }
}
const failed = Object.values(fails).reduce((a, b) => a + b, 0);
console.log(`${n - failed}/${n} survived${process.argv.includes('--worst') ? ' (worst luck)' : ''}`);
for (const [k, v] of Object.entries(fails)) console.log(`  ${v}x  ${k}`);
console.log(`min box ${(minB * 100).toFixed(0)}% | min power ${minP} | stun lapses total ${lapses}`);
}
