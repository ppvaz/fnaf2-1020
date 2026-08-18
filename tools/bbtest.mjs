// Reactive "perfect player" including Balloon Boy. This is the real test of the
// model: if a correctly-played Minus 7 cannot clear the night here, either the
// routine in MINUS-7-STRATEGY.md is wrong or the engine is.
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

const A = (f) => { // next frame landing on a :X2 / :X7 second boundary
  for (let k = 0; k < 12 * C.FPS; k++) {
    const g = f + k;
    if (g % C.FPS === 0) { const d = (g / C.FPS) % 10; if (d === 2 || d === 7) return g; }
  }
  return f;
};

class Bot {
  constructor(sim) {
    this.sim = sim; this.plan = []; this.waiting = null; this.kind = 'start';
    this.plan = [[2, 'tap', 'monitor'], [20, 'tap', 'cam:11'], [24, 'down', 'wind']];
    this.nextAt = C.s(7);
  }

  cycle(a) {
    return [
      [a + 0, 'tap', 'monitor'], [a + 18, 'tap', 'mask'], [a + 27, 'tap', 'mask'],
      [a + 30, 'down', 'light'], [a + 32, 'up', 'light'], [a + 36, 'tap', 'monitor'],
      [a + 55, 'tap', 'cam:10'], [a + 57, 'down', 'light'], [a + 59, 'up', 'light'],
      [a + 67, 'tap', 'cam:4'], [a + 69, 'down', 'light'], [a + 71, 'up', 'light'],
      [a + 79, 'tap', 'cam:7'], [a + 81, 'down', 'light'], [a + 83, 'up', 'light'],
      [a + 90, 'tap', 'cam:11'], [a + 93, 'down', 'wind'],
    ];
  }

  // BB is in the vent camera: same cycle, but the cams must be DOWN across the
  // next 5s interval so he cannot take his fourth movement.
  phaseA(a) {
    const p = this.cycle(a);
    const drop = a + 150;                     // :X4.5 — before the interval
    const back = a + 150 + C.MONITOR_ANIM * 3; // safely after it
    p.push([drop, 'tap', 'monitor'], [back, 'tap', 'monitor']);
    return p;
  }

  // BB is in the opening: flash everything, drop, mask, and wait for his bang.
  attack(a) {
    return [
      [a + 0, 'down', 'light'],
      [a + 3, 'tap', 'cam:10'], [a + 9, 'tap', 'cam:4'], [a + 15, 'tap', 'cam:7'],
      [a + 22, 'tap', 'monitor'], [a + 34, 'tap', 'mask'],
      [a + 36, 'wait', 'bbgone'],
    ];
  }

  recover(f) {
    return [
      [f + 2, 'tap', 'mask'], [f + 5, 'tap', 'monitor'],
      [f + 22, 'tap', 'cam:10'], [f + 26, 'tap', 'cam:4'],
      [f + 30, 'up', 'light'],
      [f + 34, 'tap', 'cam:11'], [f + 37, 'down', 'wind'],
    ];
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
    else if (s.bb.stage >= 3) { this.kind = 'phaseA'; this.plan = this.phaseA(a); }
    else { this.kind = 'cycle'; this.plan = this.cycle(a); }
  }
}

export function run(opts = {}) {
  const jitter = opts.jitter || 0;
  const sim = new Sim(Object.assign({ seed: 999 }, opts));
  const bot = new Bot(sim);
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

const n = +(process.argv[2] || 200);
const fails = {}; let minB = 1, minP = C.POWER_FRAMES, lapses = 0;
for (let i = 0; i < n; i++) {
  const jf = (process.argv.find(a => a.startsWith('--jitter=')) || '').split('=')[1];
  const r = run({ seed: (i * 2246822519) >>> 0, worst: process.argv.includes('--worst'),
                  jitter: jf ? Math.round(+jf / 1000 * C.FPS) : 0 });
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
