// Assertions for the engine's load-bearing SOURCED rules.
//
// Every other engine check is a population statistic: bbtest says the Minus 7
// bot survives 200/200, simtest sweeps seeds. Those pass or fail on aggregate
// behaviour, which means a wrong *rule* can hide behind a right *outcome* --
// a rule can be inverted, deleted, or invented and the survival rate barely
// moves, because the bot is not stressing that rule on most seeds.
//
// That is not hypothetical. An unsourced "masking with the monitor up lowers
// the cams" rule was added to setMask and removed again, and simtest, bbtest
// and bbtest --worst all passed identically in both directions. Nothing in
// the suite could see it.
//
// So this file asserts the mechanisms directly, one case per group citation,
// against a hand-driven Sim. A failure here names the group that broke.
//
//   node tools/sourcetest.mjs
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

let pass = 0;
const fails = [];
const ok = (group, what, cond) => {
  if (cond) { pass++; return; }
  fails.push(`${group}: ${what}`);
};

// A sim with only the mechanism under test alive, so unrelated characters
// cannot end the night mid-assertion.
const bare = (opts = {}) => new Sim(Object.assign({
  seed: 12345, bbEnabled: false, foxyEnabled: false, gfEnabled: false,
  boxEnabled: false, powerEnabled: false, stalledEnabled: false,
}, opts));
const step = (s, n) => { for (let i = 0; i < n; i++) s.tick(); };
// Settle a monitor/mask animation.
const settle = (s) => step(s, Math.max(C.MONITOR_ANIM_UP, C.MASK_ANIM_ON) + 2);

// ---------------------------------------------------------------- input gates
{
  // The mask cannot go on with the monitor up: there is no state with both
  // raised, so the press is unreachable rather than a toggle.
  const s = bare();
  s.press('monitor'); settle(s);
  ok('input', 'monitor is up before the mask press', s.camsUp);
  s.press('mask'); settle(s);
  ok('input', 'a mask press with the cams up does nothing', !s.maskOn);
}
{
  // g75/g84 input half: while the mask is on, only the mask answers.
  const s = bare();
  s.press('mask'); settle(s);
  ok('input', 'mask goes on with the cams down', s.maskOn);
  s.press('monitor'); settle(s);
  ok('g75/g84', 'a monitor press while masked does nothing', !s.camsUp);
  s.press('mask'); settle(s);
  ok('g75/g84', 'the mask itself still answers', !s.maskOn);
}
{
  // g75/g84 effect half: a masked player lights nothing.
  const s = bare();
  s.press('mask'); settle(s);
  s.lightHeld = true;
  ok('g75/g84', 'the hall light is dead while masked', !s.hallLightOn);
  ok('g302/304', 'no office light reads as held while masked', !s.anyOfficeLightHeld);
}

// ------------------------------------------------------------- Golden Freddy
{
  // g336: he spawns only on a 5 s interval with the monitor fully up.
  const s = bare({ gfEnabled: true, seed: 7 });
  step(s, C.FPS * 30);
  ok('g336', 'never spawns while the cams are down', !s.gf.present);
}
{
  // g776 mask clear, g777 kill on a raise.
  const s = bare({ gfEnabled: true });
  s.gf.present = true;
  s.press('mask'); settle(s);
  ok('g776', 'the mask clears him', !s.gf.present);

  const t = bare({ gfEnabled: true });
  t.gf.present = true;
  t.press('monitor');
  ok('g777', 'raising the monitor with him present kills', !t.alive &&
    t.death.reason === 'golden-freddy');
}
{
  // g778: kill on a hall flash, which is the cams-down light.
  const s = bare({ gfEnabled: true });
  s.gf.present = true;
  ok('g778', 'the hall view is the cams-down state', s.hallView);
  s.press('light');
  ok('g778', 'flashing the hall with him present kills', !s.alive &&
    s.death.reason === 'golden-freddy');
}
{
  // g780: the hallway figure kills above 100 frames of held light, not at 100.
  ok('g780', 'the hall kill threshold is 100 frames', C.GF_HALL_KILL_FRAMES === 100);
  ok('g781', 'his hall presence is a 1-in-10 roll', C.GF_HALL_ROLL === 10);
}

// --------------------------------------------------------------- Balloon Boy
{
  // g907 counts one per one-second event while fully masked; g294 sends him
  // back at five. Five ticks span four boundaries, so a hold that becomes
  // fully-on just after a boundary pays the full 5.000 s.
  const s = bare({ bbEnabled: true });
  s.bb.inOpening = true;
  // Align to a boundary, then mask.
  while ((s.frame + 1) % C.FPS !== 0) s.tick();
  s.tick();
  s.press('mask');
  step(s, C.MASK_ANIM_ON + 1);
  ok('g907', 'the mask is fully on', s.maskFullyOn);
  const start = s.frame;
  while (s.bb.inOpening && s.frame - start < C.FPS * 8) s.tick();
  const held = (s.frame - start) / C.FPS;
  ok('g294', `five ticks clear him in 4.0-5.0 s (measured ${held.toFixed(3)})`,
    !s.bb.inOpening && held > 3.9 && held <= 5.05);
}
{
  // g293: the counter is zeroed on every entry into the fully-on state, so
  // nothing banks between flicks. Four ticks, unmask, re-mask -> not cleared.
  const s = bare({ bbEnabled: true });
  s.bb.inOpening = true;
  s.press('mask'); step(s, C.MASK_ANIM_ON + 1);
  step(s, C.FPS * 3 + 30);            // some ticks, short of five
  const banked = s.bb.maskTicks;
  ok('g907', 'ticks accumulate while held', banked > 0);
  s.press('mask'); step(s, C.MASK_ANIM_OFF + 1);
  s.press('mask'); step(s, C.MASK_ANIM_ON + 1);
  ok('g293', 're-entering the mask zeroes the counter', s.bb.maskTicks === 0);
  ok('g294', 'he is still at the opening after the flick', s.bb.inOpening);
}
{
  // The counter is a per-tick count, not a cumulative frame budget: BB must
  // still be at the opening for it to run at all.
  ok('g294', 'the leave threshold is five ticks', C.VENT_MASK_TICKS === 5);
  ok('g292', 'the early leave is a 10%/s roll', C.VENT_EARLY_LEAVE_CHANCE === 0.1);
}
{
  // e8fcf2f / g96 / g301 / g303: BB inside the office is permanent and takes
  // the lights away -- he is not a death, and nothing moves him back out.
  const s = bare({ bbEnabled: true });
  s.bb.inside = true;
  s.lightHeld = true;
  ok('g96', 'BB inside kills the hall light', !s.hallLightOn);
  ok('g301/303', 'BB inside kills every office light', !s.anyOfficeLightHeld);
  step(s, C.FPS * 20);
  ok('e8fcf2f', 'BB inside is not itself a death', s.alive);
  ok('e8fcf2f', 'and nothing moves him back out', s.bb.inside);
  // g77/g86: the `viewing = 10` pair has no BB exclusion, so CAM 10 keeps its
  // camera light even with him inside.
  const t = bare({ bbEnabled: true });
  t.bb.inside = true;
  t.press('monitor'); settle(t);
  t.press('cam:10'); t.press('light');
  ok('g77/g86', 'CAM 10 keeps its camera light with BB inside', t.camLightOn);
  t.press('cam:4');
  ok('g76/g85', 'other cameras do not', !t.camLightOn);
}

// ------------------------------------------------------------------ forcedown
{
  // g141 set, g262 monitor, g274 mask, g612 clear -- and it is spent one frame
  // after it is raised.
  const s = bare();
  s.press('monitor'); settle(s);
  s.press('mask');    // ignored, cams up -- so mask separately below
  ok('input', 'setup: cams up, no mask', s.camsUp && !s.maskOn);
  s.dropEverything = true;
  s.tick();
  ok('g262', 'the forcedown lowers the monitor', !s.camsUp);
  ok('g612', 'and clears its own flag', !s.dropEverything);

  const t = bare();
  t.press('mask'); settle(t);
  ok('input', 'setup: masked, cams down', t.maskOn);
  t.dropEverything = true;
  t.tick();
  ok('g274', 'the forcedown takes the mask off', !t.maskOn);
}

// ------------------------------------------------------------ marker parking
{
  // Lowering the monitor sets `viewing = 0` but never moves the marker, so the
  // selected camera survives the monitor-down stretch.
  const s = bare();
  s.press('monitor'); settle(s);
  s.press('cam:7');
  ok('g16-27', 'the camera is selected', s.cam === 7);
  s.press('monitor'); settle(s);
  ok('g262', 'lowering the monitor keeps the marker on CAM 07', s.cam === 7);
}

// ------------------------------------------------------------- camera stun
{
  ok('stun time', 'a camera flash loads a 400-frame stun', C.STUN_FRAMES === 400);
}

// ------------------------------------------------------------------- report
const total = pass + fails.length;
if (fails.length) {
  console.log(`sourced-rule checks: ${pass}/${total} pass`);
  for (const f of fails) console.log(`  FAIL  ${f}`);
} else {
  console.log(`sourced-rule checks: ${total}/${total} pass`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(fails.length ? 1 : 0);
}
