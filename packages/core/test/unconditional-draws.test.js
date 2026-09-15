// The Office frame's unconditional random draws under sourcedUnconditionalDraws (dump g58/g59/g192/g822).
import assert from 'node:assert/strict';
import { Sim } from '../src/mechanics/plant-model.js';
import { RNG_MULTIPLIER, RNG_INCREMENT, RNG_MASK } from '../src/mechanics/rng.js';

const lcg = (s, n = 1) => { for (let i = 0; i < n; i++) s = (s * RNG_MULTIPLIER + RNG_INCREMENT) & RNG_MASK; return s; };
const QUIET = { night: 7, seed: 77, lethal: false, stalledEnabled: false, bbEnabled: false, gfEnabled: false,
                boxEnabled: false, foxyEnabled: false };

// A quiet simulator draws nothing by itself, so the stream moves only by the new draws.
{
  const off = new Sim(QUIET); const s0 = off.rng.state;
  for (let i = 0; i < 600; i++) off.tick();
  assert.equal(off.rng.state, s0, 'the quiet baseline makes no draws of its own');
}

// Counts: g822 every frame; g58 and g192 every 6 frames; g59 every 490 ms (29/30 frames).
{
  const s = new Sim({ ...QUIET, sourcedUnconditionalDraws: true }); const s0 = s.rng.state;
  for (let i = 0; i < 29; i++) s.tick();
  assert.equal(s.unconditionalDraws, 29 + 4 + 4 + 0, 'frame 29: g59 has not fired');
  s.tick();
  assert.equal(s.unconditionalDraws, 30 + 5 + 5 + 1, 'frame 30: g59 fires first');
  for (let i = 30; i < 600; i++) s.tick();
  assert.equal(s.unconditionalDraws, 600 + 100 + 100 + 20);
  assert.equal(s.rng.state, lcg(s0, 820), 'every counted draw advanced the one LCG');
}

// g59 alternates 29 and 30 frames.
{
  const s = new Sim({ ...QUIET, sourcedUnconditionalDraws: true });
  const fires = []; let prev = s.unconditionalTimers[1].counter;
  for (let i = 0; i < 130; i++) {
    s.tick();
    const now = s.unconditionalTimers[1].counter;
    if (now > prev) fires.push(s.frame);
    prev = now;
  }
  assert.deepEqual(fires, [30, 59, 89, 118]);
}

// Order within a 5 s frame: g58/g59/g192, then the g337 rolls, then g822.
{
  const s = new Sim({ ...QUIET, foxyEnabled: true, sourcedUnconditionalDraws: true });
  const order = [];
  const draw = s.drawUnconditional.bind(s), five = s.onFiveSecond.bind(s);
  s.drawUnconditional = phase => { if (s.frame === 300) order.push(phase); return draw(phase); };
  s.onFiveSecond = () => { if (s.frame === 300) order.push('rolls'); return five(); };
  for (let i = 0; i < 300; i++) s.tick();
  assert.deepEqual(order, ['early', 'rolls', 'late']);
}

// Off: the default is unchanged.
{
  const run = opts => { const x = new Sim({ night: 7, seed: 11, lethal: false, ...opts }); for (let i = 0; i < 3600; i++) x.tick(); return JSON.stringify([x.events, x.rng.state]); };
  if (new Sim({ night: 7, seed: 1 }).opts.sourcedUnconditionalDraws === false)
    assert.equal(run({}), run({ sourcedUnconditionalDraws: false }), 'explicit off equals the default');
}
console.log('unconditional draws: g822 every frame, g58/g192 every 6 frames, g59 at 29/30, early before the g337 rolls and g822 late; off unchanged');
