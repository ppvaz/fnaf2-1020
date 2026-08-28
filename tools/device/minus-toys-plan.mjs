// Emit and replay the measured-device port of the Minus Toys schedule.
// The file format is consumed by trial.sh's existing on-phone plan interpreter.
import { pathToFileURL } from 'node:url';
import * as C from '../../src/config.js';
import { Sim } from '../../src/engine.js';

export const OPENING = [
  [0,    'tap',     'monitor', 33],
  [300,  'tap',     'cam11',   33],
  [833,  'tap',     'cam9',    33],
  // 17 ms released time after CAM 09: the geometry that deliberately armed
  // the split on the Moto g56, still inside g263's 200 ms stale-sample window.
  [883,  'tap',     'monitor', 33],
  [1616, 'tap',     'monitor', 33],
  [2050, 'hold',    'wind',  1750],
  [3800, 'camdrop', 200, 33, 67],
  [4400, 'tap',     'mask',     33],
];

// Base is the start of each ten-second interval. The actions deliberately
// cross into the next interval: office until :X9, raise after :X0, wind to :X3,
// then exit at :X4. The five full mask ticks are 5/6/7/8/9 in each interval.
export const LOOP = [
  [9200,  'tap',     'mask',     33],
  [9500,  'hall',     33],
  [10100, 'tap',     'monitor',  33],
  // The camera-feed light button (`ventl` in plan_control_xy; the office's left
  // vent light shares the coordinate). A 100 ms hold refreshes the glitched
  // CAM 09 stun right after the raise.
  [10400, 'hold',    'ventl',   100],
  [10550, 'hold',    'wind',   3250],
  [13850, 'camdrop', 150, 33, 67],
  [14400, 'tap',     'mask',     33],
];

const frame = ms => Math.round(ms * C.FPS / 1000);

export function replay({ night = 7, seed = 1, worst = false, splitCamera = true } = {}) {
  const sim = new Sim({ night, seed, worst });
  const queue = [];
  const add = (base, row) => {
    const [at, kind, a, b, c] = row;
    const when = base + at;
    // The interpreter's control vocabulary is not the engine's: a camera button
    // is `camN`, the feed light is `ventl`. Map both to the sim's action names.
    const actionFor = action =>
      action.startsWith('cam') ? `cam:${action.slice(3)}`
      : action === 'ventl' ? 'light'
      : action;
    if (kind === 'tap') queue.push([frame(when), 'press', actionFor(a)]);
    else if (kind === 'hold' || kind === 'hall') {
      const action = kind === 'hall' ? 'light' : actionFor(a);
      const duration = kind === 'hall' ? a : b;
      queue.push([frame(when), 'press', action],
                 [frame(when + duration), 'release', action]);
    } else if (kind === 'camdrop') {
      queue.push([frame(when), 'press', 'light'],
                 [frame(when + a), 'press', 'monitor'],
                 [frame(when + a + b + c), 'release', 'light']);
    }
  };
  for (const row of OPENING) {
    if (!splitCamera && row[2] === 'cam9') continue;
    add(0, row);
  }
  for (let base = 0; base < 420000; base += 10000)
    for (const row of LOOP) add(base, row);
  queue.sort((x, y) => x[0] - y[0]);

  let i = 0, splitAt = -1, minBox = 1, minPower = sim.power;
  while (sim.alive && !sim.won) {
    while (i < queue.length && queue[i][0] <= sim.frame) {
      const [, kind, action] = queue[i++];
      sim[kind](action);
    }
    sim.tick();
    if (splitAt < 0 && sim.camsUp && sim.viewing === 11 && sim.cam === 9)
      splitAt = sim.frame;
    minBox = Math.min(minBox, sim.box);
    minPower = Math.min(minPower, sim.power);
  }
  return { sim, splitAt, minBox, minPower };
}

export function emitPlan(night) {
  const lines = [`#policy minus-toys`, `#night ${night}`, '#cycle opening'];
  for (const row of OPENING) lines.push(row.join(' '));
  lines.push('#cycle toys');
  for (const row of LOOP) lines.push(row.join(' '));
  return lines.join('\n') + '\n';
}

function gate(night, runs = 200) {
  for (const worst of [false, true]) {
    const n = worst ? Math.min(100, runs) : runs;
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const r = replay({ night, worst, seed: (i * 2654435761) >>> 0 });
      if (r.sim.won && r.splitAt >= 0) wins++;
    }
    console.log(`Minus Toys device plan night ${night} ${worst ? 'worst' : 'normal'}: ${wins}/${n}`);
    if (wins !== n) return false;
  }
  let controlWins = 0;
  for (let i = 0; i < runs; i++)
    if (replay({ night, splitCamera: false, seed: (i * 2654435761) >>> 0 }).sim.won) controlWins++;
  console.log(`Minus Toys device plan night ${night} no-split control: ${controlWins}/${runs}`);
  // On early story nights the weak AI can let an unstalled control survive;
  // the load-bearing control is canonical 10/20, where it must clear none.
  return night === 7 ? controlWins === 0 : true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nightArg = (process.argv.find(v => v.startsWith('--night=')) || '--night=7').slice(8);
  const night = +nightArg;
  if (!Number.isInteger(night) || night < 1 || night > 7)
    throw new Error('--night must be 1..7');
  if (process.argv.includes('--gate')) {
    if (!gate(night)) process.exitCode = 1;
  } else {
    process.stdout.write(emitPlan(night));
  }
}
