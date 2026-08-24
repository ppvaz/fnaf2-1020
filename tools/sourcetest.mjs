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

// ------------------------------------------------------- the office light gate
// Every light in the office resolves through `lit?` (g75 hall, g76/g77 camera)
// and the vent pair (g301/g303/g320), and all of them carry the same two
// conditions: `mask` = 0 and `in danger` = 0.
{
  // g10/g11: `mask` returns to 0 only when the mmaskOff animation completes,
  // so the post-mask flash lockout IS that animation. Taking the mask off does
  // not restore the light -- finishing the animation does.
  const s = bare();
  s.press('mask'); settle(s);
  s.press('mask');                       // mask off: `mask` enters state 3
  s.lightHeld = true;
  ok('g10/g11', 'the mask-off press alone does not restore the light', !s.hallLightOn);
  step(s, C.MASK_ANIM_OFF - 1);
  ok('g10/g11', 'still dark one frame short of the animation', !s.hallLightOn);
  step(s, 2);
  ok('g75', 'the hall light returns the frame `mask` reaches 0', s.hallLightOn);
}
{
  // g489 -> g745: the reset Foxy actually depends on runs through `lit?`, so
  // the lockout gates it too. This is the rule that retimed the Minus 7 cycle:
  // a hall flash inside the mask-off animation resets nothing.
  const s = bare({ foxyEnabled: true });
  s.foxy.loc = 'hall'; s.foxy.D = 9;
  s.press('mask'); settle(s);
  s.press('mask'); s.lightHeld = true;
  step(s, C.MASK_ANIM_OFF - 1);
  ok('g489/g745', 'a flash inside the lockout does not zero Foxy D', s.foxy.D >= 9);
  step(s, 3);
  ok('g489/g745', 'the flash zeroes Foxy D once the mask clears', s.foxy.D === 0);
}
{
  // g75/g76/g77 and g83/g88: `in danger` -- the office-encounter latch raised
  // by g443-447/g490 and cleared by the endpoint resolutions g538-555 -- kills
  // every light, and the flashlight hitbox does not even register the touch.
  const s = bare();
  s.lightHeld = true;
  ok('g75', 'the hall light works with no encounter running', s.hallLightOn);
  s.startBlackout('test', null);
  ok('g75', 'no hall light while `in danger` is set', !s.hallLightOn);
  s.press('monitor'); settle(s);
  ok('g76/g77', 'no camera light while `in danger` is set', !s.camLightOn);
}
{
  // g299 clears both vent lights on a 200 ms timer and only g301/g303/g320
  // re-assert them, each requiring `mask` = 0 -- so a vent light already held
  // goes out the moment the mask starts going on. Toy Bonnie's g428 stall
  // reads the light, not the finger.
  const s = bare();
  s.press('ventR');
  ok('g303/g320', 'the right vent light is live with the mask off', s.ventLightROn);
  s.press('mask');
  ok('g299/g303', 'a held vent light dies the instant the mask goes on', !s.ventLightROn);
  ok('g284', 'the finger is still down -- it is the light that went out', s.ventLightR);
}
{
  // g267/g270: the mask press itself needs `being attacked by` = 0.
  const s = bare({ stalledEnabled: true });
  const u = s.units.find(x => x.id === 'withfreddy');
  u.inside = true;
  s.armInsideAttack(u, 'test');
  s.press('mask');
  ok('g267/g270', 'the mask will not go on once an attack is executing', !s.maskOn);
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
  // g691-694: sounds are dispatched through `cam 01` v21, and 18 edges across
  // seven characters write it. So BB's departure and a Toy's departure are the
  // same sample, and no detector can tell them apart. Plan 08 removed early
  // unmasking from scope on exactly this fact; the assertion exists so a
  // future controller cannot quietly start trusting the `who` field again.
  const leaveSample = (id) => {
    const s = bare({ bbEnabled: true, stalledEnabled: true });
    if (id === 'bb') {
      s.bb.inOpening = true;
    } else {
      const u = s.units.find(x => x.id === id);
      u.atOpening = true; u.openingSince = s.frame;
    }
    s.press('mask'); step(s, C.MASK_ANIM_ON + 1);
    for (let i = 0; i < C.FPS * 8 && !s.events.some(
      e => e.type === 'vent-bang' && e.data?.leaving); i++) s.tick();
    return s.events.find(
      e => e.type === 'vent-bang' && e.data?.leaving)?.data?.sample;
  };
  const fromBb = leaveSample('bb');
  const fromToy = leaveSample('toychica');
  ok('g292/294', 'BB leaving the opening plays the shared thud',
    fromBb === C.THUD_SAMPLE);
  ok('g439/440', 'Toy Chica leaving plays the same handle',
    fromToy === C.THUD_SAMPLE);
  ok('g691-694', 'so departure identity is not audible',
    fromBb !== undefined && fromBb === fromToy);
  ok('g608-611', 'the vocal bank is the three sourced handles',
    C.BB_VOCAL_SAMPLES.join(',') === '21,24,23');
  ok('g607', 'arrival at 122 adds a sample the departure never has',
    C.BB_ARRIVAL_SAMPLE === 21 && C.BB_ARRIVAL_SAMPLE !== C.THUD_SAMPLE);
  // g60 defaults channel 14 to 50; g414-416 play a route hop at 25; g906 plays
  // at 60 when he is on the viewed camera. Level, not sample identity, is what
  // separates those two meanings, and a 285 s device recording found no vocal
  // above threshold precisely because the approach cue is the quiet one.
  ok('g414-416', 'a route-hop vocal is played below the channel default',
    C.BB_VOCAL_VOLUME === 25 && C.BB_VOCAL_VOLUME < C.BB_VOCAL_CHANNEL_DEFAULT);
  ok('g906', 'a vocal on the viewed camera is played above it',
    C.BB_VIEW_VOCAL_VOLUME === 60
      && C.BB_VIEW_VOCAL_VOLUME > C.BB_VOCAL_CHANNEL_DEFAULT);
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

// ------------------------------------------------- sourced constant values
//
// Cheap, and exactly the failure mode the population checks cannot see: a
// sourced number silently edited. Each line names the group or dump the value
// came from, so a failure points at the claim rather than at the symptom.
const eq = (group, what, got, want) =>
  ok(group, `${what} = ${want} (got ${got})`, got === want);

// clock
eq('decompile', 'the night is 420 s', C.NIGHT_FRAMES, C.s(420));
eq('decompile', 'an in-game hour is 70 s', C.HOUR_FRAMES, C.s(70));
eq('g450-457', 'one flash stuns for 400 frames', C.STUN_FRAMES, 400);
eq('decompile', 'movement opportunities are 5 s apart', C.MO_FRAMES, C.s(5));
eq('decompile', 'a blackout lasts 5 s', C.BLACKOUT_FRAMES, C.s(5));

// endpoint resolution order -- group index decides, not arrival
ok('g537/g538-555', 'the defended resolve order is by group index',
  C.RESOLVE_ORDER_DEFENDED.join() ===
  'withfreddy,withbonnie,withchica,toyfreddy,toybonnie,toychica');
ok('g532/g533', 'the failed order moves Toy Freddy last',
  C.RESOLVE_ORDER_FAILED.join() ===
  'withfreddy,withbonnie,withchica,toybonnie,toychica,toyfreddy');
ok('g402/403', 'Mangle is absent from the resolve table',
  !C.RESOLVE_ORDER_DEFENDED.includes('mangle') &&
  !C.RESOLVE_ORDER_FAILED.includes('mangle'));

// the `time allowed` -> `time left` fuse, by night
eq('time allowed', 'the night-7 mask fuse is 45 frames', C.maskGraceFrames(7), 45);
eq('time allowed', 'the night-1 fuse is 100 frames', C.maskGraceFrames(1), 100);
ok('time allowed', 'the fuse shortens every night up to 7', (() => {
  for (let n = 2; n <= 7; n++)
    if (C.maskGraceFrames(n) > C.maskGraceFrames(n - 1)) return false;
  return true;
})());

// Foxy
eq('g829', "Foxy's AI caps at 17, not the shared 15", C.FOXY_AI, 17);
eq('g824/825', 'his exposure threshold is 100*night', C.foxyExposureFrames(7), 700);
eq('g872-874', 'the lit hall pins him for 50 frames', C.FOXY_HALL_PIN_FRAMES, 50);
eq('g846', 'a retreat writes B = 500 + Random(500), min', C.FOXY_RETURN_MIN, 500);
eq('g846', '...and max', C.FOXY_RETURN_MAX, 999);
ok('g337', 'he first enters between 5 s and 10 s',
  C.FOXY_ENTER_MIN === C.s(5) && C.FOXY_ENTER_MAX === C.s(10));

// Balloon Boy
eq('g294', 'five masked ticks send him back', C.VENT_MASK_TICKS, 5);
eq('g292', 'the early leave is 10%/s', C.VENT_EARLY_LEAVE_CHANCE, 0.1);
eq('g342', 'his move roll is 3/4', C.BB_MOVE_CHANCE, 0.75);
eq('g413-418', 'his route is five moves, not four', C.BB_STAGES, 5);
eq('g414-416', 'only the first hop is silent', C.BB_SILENT_HOPS, 1);

// the shared cams-up entry streak and the two per-unit timers
eq('value25', 'the night-7 entry streak is 6 s', C.entryStreakFrames(7), C.s(6));
eq('value25', 'the night-1 streak is 18 s', C.entryStreakFrames(1), C.s(18));
eq('decompile', "Toy Bonnie's night-7 cooldown is 300 frames",
  C.toyBonnieOpeningFrames(7), 300);
eq('decompile', "Toy Chica's opening edge is 5 s", C.TOY_CHICA_OPENING_FRAMES, C.s(5));
eq('g436-441', "Toy Bonnie's overlay rolls every 500 ms", C.TOY_BONNIE_CUE_FRAMES, C.s(0.5));
eq('g436-441', '...at 1 in 2', C.TOY_BONNIE_CUE_CHANCE, 0.5);

// marker 123
eq('g556-569', '`danger 2` is a 40-frame transition', C.INSIDE_ATTACK_FRAMES, 40);
eq('g729-731', 'Mangle arms on a 1-in-20 cams-up second', C.MANGLE_INSIDE_ARM_CHANCE, 0.05);
eq('g747-750', 'a marker-123 leave writes B = 500 flat', C.INSIDE_LEAVE_COOLDOWN, 500);
eq('g538-555', 'a defended repel rolls Random(500)/night', C.REPEL_COOLDOWN_ROLL, 500);

// Golden Freddy
eq('g830', 'his office roll is 1 in 2 at the 10 cap', C.GF_SPAWN_CHANCE, 0.5);
eq('g875-880', '`hall movement` blocks him for 300 frames', C.HALL_MOVEMENT_FRAMES, 300);

// the shared cap and the movement roll
eq('g830', 'everyone else caps at 15 AI', C.STALLED_AI, 15);
eq('MO', 'AI 15 is a 75% movement roll', C.MO_CHANCE(15), 0.75);
eq('g494-497', "the Puppet's bare <= roll is 16/20 at AI 15",
  C.PUPPET_MO_CHANCE(15), 0.8);

// the AI table, by night and hour
{
  // Night 6 is the on-device target, and it is the only night the pilot has
  // ever been run on: two rows, two in-game hours apart.
  const s = bare({ night: 6, stalledEnabled: true });
  ok('g683', 'night 6 opens the three Withereds at 5',
    s.ai.withfreddy === 5 && s.ai.withbonnie === 5 && s.ai.withchica === 5);
  eq('g683', '...W. Foxy at 10', s.ai.foxy, 10);
  eq('g683', '...Mangle at 3', s.ai.mangle, 3);
  eq('g683', '...and Balloon Boy at 5', s.ai.bb, 5);
  ok('g683', 'the three Toys are switched off until 2 AM',
    s.ai.toyfreddy === 0 && s.ai.toybonnie === 0 && s.ai.toychica === 0);
  eq('g820', 'the Puppet is at 15 from midnight', s.ai.puppet, 15);
  eq('g683', 'Golden Freddy opens on a one-in-ten roll',
    bare({ night: 6, worst: true }).ai.golden, 1);

  step(s, C.HOUR_FRAMES * 2 - 1);
  eq('g673-684', 'the midnight levels hold through the frame before 2 AM', s.ai.bb, 5);
  // g333-342 read the counters above g673-684, so the new hour reaches the
  // rolls on the following frame rather than on the boundary itself.
  step(s, 1);
  eq('g684', '2 AM takes Balloon Boy to 9', s.ai.bb, 9);
  ok('g684', '...switches all three Toys on at 5',
    s.ai.toyfreddy === 5 && s.ai.toybonnie === 5 && s.ai.toychica === 5);
  eq('g684', '...W. Foxy to 15', s.ai.foxy, 15);
  eq('g684', '...and Golden Freddy to a real 3', s.ai.golden, 3);
}
{
  // g804 zeroes Golden Freddy below night 6, but it runs once at night start,
  // so it only cancels the rows written in that same instant.
  eq('g804', 'night 3 writes him at midnight and loses it',
    bare({ night: 3, worst: true }).ai.golden, 0);
  const s = bare({ night: 2, worst: true });
  eq('g804', 'night 2 is also zero at midnight', s.ai.golden, 0);
  step(s, C.HOUR_FRAMES);
  eq('g676', "...but its 1 AM row lands after g804's one shot", s.ai.golden, 1);
}
{
  // 10/20 is the same table with the dials copied in, so the levels the rest
  // of this file asserts have to fall out of it.
  const s = bare({ night: 7 });
  eq('g787', 'every 10/20 dial is 20', C.AI_BY_NIGHT[7][0].set.bb, C.AI_10_20);
  eq('g856-863', '...held at 15 for the seven', s.ai.toychica, C.STALLED_AI);
  eq('g829', '...at 17 for Foxy', s.ai.foxy, C.FOXY_AI);
  eq('g830', '...and at 10 for Golden Freddy',
    C.MO_CHANCE(s.ai.golden), C.GF_SPAWN_CHANCE);
  eq('g342', 'the capped Balloon Boy level is the 3/4 roll',
    C.MO_CHANCE(s.ai.bb), C.BB_MOVE_CHANCE);
  eq('g821', 'the Puppet has no dial and stays at 15', s.ai.puppet, C.PUPPET_AI);
}

// power and box
eq('battery life', 'night 7 gives 3000 frames of light', C.powerFrames(7), 3000);
eq('battery life', 'night 1 gives 7000', C.powerFrames(1), 7000);
eq('battery life', 'the indicator blinks at 500', C.POWER_BLINK, 500);
eq('decompile', 'a full box drains in 16.67 s', C.BOX_DRAIN_FRAMES, C.s(16.67));
eq('g638-645', 'empty to full takes 5.66 s', C.BOX_WIND_FRAMES, C.s(5.66));
eq('g404-411', 'the Puppet walks five hops', C.PUPPET_STAGES, 4);
ok('g404-411', "the Puppet's two routes are the sourced ones",
  C.PUPPET_ROUTE.left.join() === '10,7,3,1,office' &&
  C.PUPPET_ROUTE.right.join() === '10,7,4,2,office');

// animation bank -- the asymmetry is the load-bearing part
ok('build 296', 'lowering the monitor is slower than raising it',
  C.MONITOR_ANIM_DOWN > C.MONITOR_ANIM_UP);
ok('build 296', 'taking the mask off is slower than putting it on',
  C.MASK_ANIM_OFF > C.MASK_ANIM_ON);

// the seven's sourced routes and gates
{
  const by = Object.fromEntries(C.STALLED.map(u => [u.id, u]));
  ok('route graph', 'seven stalled characters', C.STALLED.length === 7);
  ok('g875-880', 'Toy Freddy owns the uncovered 9 -> 10 -> blind -> office route',
    by.toyfreddy.path.join() === '9,10,blindA,blindB,office');
  ok('route graph', 'Withered Freddy is held at CAM 07',
    by.withfreddy.path.includes(7));
  ok('value25', 'the four mutex holders are the streak users',
    C.STALLED.filter(u => u.mutex).map(u => u.id).join() ===
    'withfreddy,withbonnie,withchica,toyfreddy' &&
    C.STALLED.filter(u => u.mutex).every(u => u.openingRule === 'streak'));
  ok('g402/403', "Mangle's opening rule is the monitor raise",
    by.mangle.openingRule === 'raise');
  ok('g428', 'Toy Bonnie enters from the cams-down state',
    by.toybonnie.entryGate === 'camsDown');
  ok('g456', 'Mangle transits CAM 11, where the flash stun is excluded',
    by.mangle.path.includes(11));
}

// ------------------------------------------------------- driven behaviours
{
  // `battery life` drains 1 per frame while any light is on, and not
  // otherwise.
  const s = bare({ powerEnabled: true });
  const p0 = s.power;
  step(s, 60);
  ok('battery life', 'no drain with every light off', s.power === p0);
  s.press('light');
  step(s, 60);
  ok('battery life', 'the office light drains 1/frame', p0 - s.power === 60);
}
{
  // The box drains full -> empty in 16.67 s with nobody winding.
  const s = bare({ boxEnabled: true });
  ok('box', 'the box starts full', s.box === 1);
  step(s, C.BOX_DRAIN_FRAMES);
  ok('box', 'and is empty after the sourced drain', s.box <= 0.001);
}
{
  // Winding only counts on the box camera: a finger anywhere else does
  // nothing, which is what makes CAM 11 part of the cycle.
  const s = bare({ boxEnabled: true });
  step(s, C.FPS * 5);
  const low = s.box;
  s.press('monitor'); settle(s);
  s.press('cam:10');
  s.press('wind');
  step(s, C.FPS);
  ok('box', 'winding off CAM 11 does nothing', s.box < low);
  s.press('cam:11');
  const before = s.box;
  step(s, C.FPS);
  ok('g638-645', 'winding on CAM 11 refills', s.box > before);
}
{
  // The cams-up entry streak resets the moment the monitor starts down --
  // it is a *current session* counter, not a running total.
  const s = bare();
  s.press('monitor'); settle(s);
  step(s, C.FPS * 3);
  ok('value25', 'the cams-up session is running', s.camsUpSince >= 0);
  s.press('monitor'); settle(s);
  ok('value25', 'lowering the monitor ends the session', !s.camsUp);
  s.press('monitor'); settle(s);
  const restarted = s.frame - s.camsUpSince;
  ok('value25', 'and the next raise starts a fresh one',
    restarted < C.FPS * 3);
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
