#!/usr/bin/env node
// FNaF 1 on the handset's clock: the simulator driven through the phone's
// own actuation and observation costs instead of by writing its state.
//
// `policy-fnaf1.js`'s policies set `sim.leftDoor` and `sim.viewing` directly
// every frame. That prices nothing: a light lit for one frame, a door that
// shuts the frame it is wanted, a monitor that is up without its 383 ms flip,
// and two doors that are never more than a frame apart although they sit
// 2780 px apart on a 2400 px screen. The census it produces is an idealised
// lane, and this file is the other one.
//
// Here a policy is a generator of *device* actions -- a touch on a control, a
// pan hold, a wait, a read of the helper's native frame regions -- and the
// executor turns each into the game input the phone would deliver:
//
//   - one contact at a time, held `contactMs`, landing `pressLatencyMs` after
//     the touch goes down (sampled per press);
//   - a pan is a `panHoldMs` hold, and a world-anchored control is reachable
//     only at its own pan;
//   - the game then applies its own acceptance rules (`Fnaf1Sim.press`):
//     click cooldown, monitor down, flip lock, door mid-animation;
//   - a read returns what was *rendered* `renderLagMs` before it was asked
//     for, and returns `readMs` later; a doorway behind the monitor or a
//     control off-screen is simply not visible.
//
// Every number comes from `tools/device/models/fnaf1-device-timing-*.json`,
// which states each one's claim level. This is a model lane -- MODEL_ONLY --
// and it cannot be promoted as a device result.
//
//   node tools/fnaf1-device-lane.mjs --seeds 3000 [--start 3000] [--lane typical|worst]
//        [--policy flick4b] [--opt.key value ...]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Fnaf1Sim, DOOR_OPEN, DOOR_SHUT, MS_PER_FRAME } from '../packages/core/src/mechanics/games/sim-fnaf1.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const TIMING_PATH = `${HERE}device/models/fnaf1-device-timing-moto-g56-v207.json`;
export const FOUR_TWENTY = Object.freeze({ freddy: 20, bonnie: 20, chica: 20, foxy: 20 });

// Which pan a world-anchored control needs [controls-fnaf1-moto-g56-v207.json:
// the left pair is measured at pan 0, the right pair at pan 600; the monitor
// tab and the camera map are screen-pinned].
const CONTROL_PAN = { leftLight: 'left', leftDoor: 'left', rightLight: 'right', rightDoor: 'right',
                      monitor: null };

export function loadTiming(path = TIMING_PATH) {
  const model = JSON.parse(readFileSync(path, 'utf8'));
  if (model.schema !== 'fnaf1-device-timing-v1') throw new Error(`${path}: not fnaf1-device-timing-v1`);
  return model;
}

/** mulberry32 -- the lane's own stream, so latency draws never touch the game's RNG. */
function laneRng(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A band `{ min, mode, max }` drawn triangularly, or pinned at `max` in the worst lane. */
function drawer(rng, lane) {
  return (band) => {
    if (lane === 'worst') return band.max;
    if (lane === 'best') return band.min;
    const { min, max } = band;
    const mode = band.mode ?? (min + max) / 2;
    const u = rng();
    const cut = (mode - min) / (max - min || 1);
    return u < cut ? min + Math.sqrt(u * (max - min) * (mode - min))
                   : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  };
}

/**
 * What one rendered frame shows to the helper's native regions. The detectors
 * that will read these on the phone must be calibrated against exactly these
 * classes; the model assumes they classify a visible region correctly and
 * nothing more.
 */
function render(sim, pan) {
  const monitorUp = sim.viewing > 0 && !sim.flip;
  const officeClear = sim.viewing === 0 && !sim.flip;   // no flip drawing over the room
  // A lit doorway shows its occupant whether the door is open or shut:
  // through a shut left door Bonnie changes the shadow, and Chica stands in
  // the right window (operator's play, 2026-09-24). The shut and open views
  // are different images, so a detector needs both calibrated; the class it
  // reports is the same.
  const door = (side) => {
    if (!officeClear || pan !== side) return 'hidden';
    const lit = side === 'left' ? sim.leftLight : sim.rightLight;
    if (!lit) return 'dark';
    const here = side === 'left' ? sim.atLeftDoor() : sim.atRightDoor();
    return here ? 'occupied' : 'clear';
  };
  return {
    frame: sim.frame,
    monitor: monitorUp ? 'up' : sim.flip ? 'flipping' : 'down',
    cam: monitorUp ? sim.viewing : 0,
    // CAM 4B shows Chica over Freddy when both are there (community note; the
    // draw order is not yet read from the dump -- UNKNOWN(cam4b-draw-order)).
    chica4B: monitorUp && sim.viewing === 42 ? sim.chica === 'cam4B' : null,
    left: door('left'),
    right: door('right'),
    leftDoor: sim.leftDoor,
    rightDoor: sim.rightDoor,
    power: sim.power,
    over: sim.over,
  };
}

/**
 * Run one night. `policy(ctx)` is a generator; it yields actions and receives
 * each action's result:
 *
 *   { tap: control }              -> undefined, resumes at release
 *   { tapCam: view }              -> undefined (camera map; screen-pinned)
 *   { pan: 'left' | 'right' }     -> undefined, resumes when the hold ends
 *   { wait: ms }                  -> undefined
 *   { read: true }                -> the rendered frame, as `render` reports it
 *
 * `ctx.now()` is milliseconds since the night's first frame. The policy knows
 * that origin only to `ctx.epochErrorMs`, which the executor draws once.
 */
export function runDeviceNight({ night = 7, seed = 0, custom = FOUR_TWENTY, timing,
                                 lane = 'typical', policy, options = {} }) {
  const sim = new Fnaf1Sim({ night, seed, custom });
  sim.inputLog = [];
  const rng = laneRng(seed * 7919 + 17);
  const draw = drawer(rng, lane);
  const t = timing.values;
  let pan = 'left';                         // every game here starts panned left
  let busyUntil = 0;
  const effects = [];                       // { frame, fn }
  const history = [];                       // rendered frames, newest last
  const epochError = lane === 'typical'
    ? (rng() * 2 - 1) * t.epochErrorMs.max : t.epochErrorMs.max;
  const ctx = {
    now: () => sim.frame * MS_PER_FRAME,
    epochErrorMs: epochError,
    // The policy's belief of the night origin, in its own ms.
    believedRollMs: (periodMs, k) => k * periodMs + epochError,
    options,
  };

  const gen = policy(ctx);
  let resumeAt = 0;
  let sendValue;
  let stats = { presses: 0, refused: 0, reads: 0, pans: 0, policyError: null };
  let lastDelivered = -1;   // the helper's sequence only grows: never hand back an older frame

  const schedule = (atMs, fn) => {
    effects.push({ frame: Math.ceil(atMs / MS_PER_FRAME), fn });
  };

  const advancePolicy = () => {
    while (!sim.over && ctx.now() >= resumeAt) {
      const { value: action, done } = gen.next(sendValue);
      sendValue = undefined;
      if (done) { resumeAt = Infinity; return; }
      const start = Math.max(ctx.now(), busyUntil);
      if ('wait' in action) { resumeAt = start + action.wait; continue; }
      if ('read' in action) {
        // A read needs no finger, so it does not queue behind a held contact.
        stats.reads += 1;
        const asked = ctx.now();
        const lag = draw(t.renderLagMs);
        const wantFrame = Math.floor((asked - lag) / MS_PER_FRAME);
        let seen = null;
        for (let i = history.length - 1; i >= 0; i -= 1) {
          if (history[i].frame <= Math.max(wantFrame, lastDelivered)) { seen = history[i]; break; }
        }
        if (seen) lastDelivered = seen.frame;
        // Delivered on resume: a frame the policy could only have had
        // `readMs` after asking.
        resumeAt = asked + draw(t.readMs);
        sendValue = seen;
        continue;
      }
      if ('pan' in action) {
        stats.pans += 1;
        const end = start + t.panHoldMs.value;
        busyUntil = end;
        resumeAt = end;
        const side = action.pan;
        pan = 'moving';
        schedule(end, () => { pan = side; });
        continue;
      }
      if ('tap' in action || 'tapCam' in action) {
        const control = action.tap ?? 'cam';
        const needed = 'tap' in action ? CONTROL_PAN[control] : null;
        if (needed === undefined) throw new Error(`unknown control ${control}`);
        if (needed !== null && pan !== needed) {
          // The runner refuses this before the transport (control-anchor.js);
          // a policy that asks for it is wrong, not unlucky.
          stats.policyError = `tap ${control} at pan ${pan}`;
          sim.over = sim.over ?? 'policy-error';
          return;
        }
        stats.presses += 1;
        // Lights and doors act on touch-up, the monitor and the map on
        // touch-down (measured, fnaf1-device-timing).
        const onRelease = 'tap' in action && control !== 'monitor';
        const landAt = start + draw(onRelease ? t.releaseLandingMs : t.pressLatencyMs);
        schedule(landAt, () => {
          const ok = 'tap' in action ? sim.press(control) : sim.selectCamera(action.tapCam);
          if (!ok) stats.refused += 1;
        });
        busyUntil = start + t.contactMs.value;
        resumeAt = busyUntil;
        continue;
      }
      throw new Error(`unknown action ${JSON.stringify(action)}`);
    }
  };

  const limit = 60 * 60 * 20;
  while (!sim.over && sim.frame < limit) {
    advancePolicy();
    if (sim.over) break;
    const next = sim.frame + 1;
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      if (effects[i].frame <= next) {
        const e = effects[i];
        effects.splice(i, 1);
        if (e.fn) e.fn();
      }
    }
    sim.step();
    history.push(render(sim, pan));
    if (history.length > 64) history.shift();
  }
  return { outcome: sim.over ?? 'timeout', frames: sim.frame, power: sim.power, stats,
           foxBangs: sim.foxBangs };
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

/**
 * The 2026 community 4/20 line, shaped for one finger on this phone:
 * CAM 4B selected once and flicked all night (Freddy cannot enter while 4B is
 * the raised view, and any raised camera re-rolls Foxy's hold); the left door
 * checked with its light between flicks; Chica, who must stand on CAM 4B
 * before she can reach the right door, watched on the flick itself, and the
 * right door checked only when she leaves 4B.
 *
 * Doors are shut on sight and reopened `reopenMs` after they reach 2. At 20,
 * a blocked character leaves on his next roll -- every roll passes -- so a
 * door that has been at 2 for one full roll period has turned him back.
 */
export function* flick4b(ctx) {
  const o = {
    dwellMs: 120,          // after the camera is seen up: >= one 100 ms attention tick
    leftEvery: 1,          // check the left door every N flicks
    reopenMs: 5200,        // door at 2 for one roll period (4970/4980) plus margin
    lightOff: true,        // press the light out after the read instead of leaving it to g357
    pollMs: 17,
    // A door or light press is refused inside the 10-frame click cooldown
    // (167 ms) of the last one, and it lands up to 82 ms after the touch: a
    // second press on these controls waits 167 + 82 = 249 ms, plus the
    // project's 33 ms seam slack.
    cooldownGapMs: 282,
    idleMs: 0,             // nothing between cycles
    // A monitor press that has not visibly started a flip after this long was
    // not taken: 82 ms landing + 67 ms render + 67 ms read + slack.
    flipConfirmMs: 260,
    ...ctx.options,
  };
  const read = function* () { return yield { read: true }; };
  const waitFor = function* (pred, limitMs = 3000) {
    const until = ctx.now() + limitMs;
    for (;;) {
      const f = yield* read();
      if (f && pred(f)) return f;
      if (ctx.now() > until) return null;
      yield { wait: o.pollMs };
    }
  };
  let lastCooldownPress = -Infinity;
  const cooldownTap = function* (control) {
    const gap = lastCooldownPress + o.cooldownGapMs - ctx.now();
    if (gap > 0) yield { wait: gap };
    lastCooldownPress = ctx.now();
    yield { tap: control };
  };
  // Drive the monitor to a state, from what the frame shows, never from what
  // was last pressed.
  const monitorTo = function* (want) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const f = yield* waitFor((x) => x.monitor !== 'flipping');
      if (!f) return null;
      if (f.monitor === want) return f;
      yield { tap: 'monitor' };
      const moved = yield* waitFor((x) => x.monitor === 'flipping' || x.monitor === want, o.flipConfirmMs);
      if (moved && moved.monitor === want) return moved;
    }
    return null;
  };
  const door = { left: { shutAt: null }, right: { shutAt: null, check: false } };
  let pan = 'left';
  const goPan = function* (side) { if (pan !== side) { yield { pan: side }; pan = side; } };

  // Setup: raise, select CAM 4B, lower.
  yield* monitorTo('up');
  yield { tapCam: 42 };
  yield* waitFor((f) => f.cam === 42);

  let flick = 0;
  let chicaSeen = false;
  for (;;) {
    // Doors due to reopen. A door's reopen needs its own pan and the room.
    for (const side of ['left', 'right']) {
      const d = door[side];
      if (d.shutAt === null || ctx.now() < d.shutAt + o.reopenMs) continue;
      yield* monitorTo('down');
      yield* goPan(side);
      const key = side === 'left' ? 'leftDoor' : 'rightDoor';
      const f = yield* read();
      if (f && f[key] === DOOR_SHUT) {
        yield* cooldownTap(key);
        yield* waitFor((x) => x[key] !== DOOR_SHUT, 600);
      }
      d.shutAt = null;
    }

    // The flick. CAM 4B stays the selected view, so every raise lands on it.
    const up = yield* monitorTo('up');
    if (up) {
      if (up.cam !== 42) { yield { tapCam: 42 }; yield* waitFor((f) => f.cam === 42, 500); }
      const chicaNow = up.chica4B === true;
      if (chicaSeen && !chicaNow) door.right.check = true;
      chicaSeen = chicaNow;
      yield { wait: o.dwellMs };
    }
    yield* monitorTo('down');
    flick += 1;

    const checks = [];
    if (door.left.shutAt === null && flick % o.leftEvery === 0) checks.push('left');
    if (door.right.check && door.right.shutAt === null) checks.push('right');
    if (door.right.check && door.right.shutAt !== null) door.right.check = false;
    for (const side of checks) {
      yield* goPan(side);
      const light = side === 'left' ? 'leftLight' : 'rightLight';
      const key = side === 'left' ? 'leftDoor' : 'rightDoor';
      let seen = null;
      for (let attempt = 0; attempt < 3 && !seen; attempt += 1) {
        yield* cooldownTap(light);
        seen = yield* waitFor((f) => f[side] === 'occupied' || f[side] === 'clear', o.flipConfirmMs);
      }
      const occupied = !seen || seen[side] === 'occupied';   // an unreadable doorway shuts
      if (occupied) {
        yield* cooldownTap(key);
        const shut = yield* waitFor((f) => f[key] === DOOR_SHUT, 1200);
        door[side].shutAt = ctx.now();
        if (!shut) door[side].shutAt -= o.reopenMs / 2;       // re-look sooner
      } else if (o.lightOff) {
        yield* cooldownTap(light);
      }
      if (side === 'right') door.right.check = false;
    }
    yield* goPan('left');
    if (o.idleMs > 0) yield { wait: o.idleMs };
  }
}

/**
 * The roll-grid line: everything above, placed on the three movement grids
 * instead of on a fixed rhythm.
 *
 * `Every 4970/4980/5010 ms` load on the night's first frame and fire at
 * multiples of their period after it [g318, g319, g321; `passEvery`], and the
 * runtime advances them by each frame's real duration, so a measured night
 * origin fixes every roll instant of the night. Three consequences:
 *
 *   - Foxy only acts at his roll, and a raised camera re-sets his hold to at
 *     least 50 frames (833 ms) every 100 ms [g460]. One flick whose view ends
 *     inside the 733 ms before each roll holds him with certainty -- no
 *     flick is needed anywhere else.
 *   - Bonnie and Chica only arrive, and only die or turn back, at their own
 *     rolls. A door therefore needs to be at 2 at one instant per visit, and
 *     a closing door costs nothing [g305-g308], so it is shut just before
 *     that roll and opened just after it.
 *   - A doorway only needs a light after a roll that could have brought
 *     someone to it: Bonnie is at least three rolls from the door after he is
 *     turned back, and Chica reaches the door only from CAM 4B, where the
 *     flick sees her.
 *
 * Every instant carries `margin` for the origin error, the 1-82 ms landing
 * spread and the one-frame quantisation of `Every`.
 */
export function* grid420(ctx) {
  const o = {
    marginMs: 150,         // origin error + landing spread + one frame, each side of a roll
    flickEndBeforeMs: 300, // aim the flick's down-press landing this far ahead of Foxy's roll
    flickLeadMs: 1100,     // start the flick this far ahead of Foxy's roll
    closeLeadMs: 1400,     // shut this far ahead of the latest moment: covers a flick (~900 ms) and a pan
    // Read Chica off CAM 4B to decide when the right door needs a look. Off:
    // look after every roll she could have arrived on, which needs no camera
    // detector at all -- only the lit doorway's.
    chicaByCamera: true,
    taskGuardMs: 2200,     // the longest door task (pan, light, door, pan back) plus a flick
    dwellMs: 120,          // after the camera is seen up: >= one 100 ms attention tick [g460]
    pollMs: 17,
    cooldownGapMs: 282,
    flipConfirmMs: 260,
    // Lights and doors act on touch-up: seen ~166-247 ms after the touch
    // starts, plus up to ~106 ms of frame lag and ~48 ms of read.
    releaseConfirmMs: 450,
    landingMaxMs: 260,     // the latest a touch-up control has been seen to land (247 ms) + a frame
    lightOff: true,
    ...ctx.options,
  };
  const PERIOD = { bonnie: 4970, chica: 4980, foxy: 5010 };
  // The first fire is one period after the load on frame 1 [passEvery], and
  // lands on the first frame at or past it.
  const roll = (who, k) => ctx.believedRollMs(PERIOD[who], k) + 17;
  const rollIndexBefore = (who, ms) => Math.floor((ms - roll(who, 0)) / PERIOD[who]);
  const DOOR_ANIM = 533;

  // --- primitives ----------------------------------------------------------
  const read = function* () { return yield { read: true }; };
  const waitFor = function* (pred, limitMs = 3000) {
    const until = ctx.now() + limitMs;
    for (;;) {
      const f = yield* read();
      if (f && pred(f)) return f;
      if (ctx.now() > until) return null;
      yield { wait: o.pollMs };
    }
  };
  let lastCooldownPress = -Infinity;
  const cooldownTap = function* (control) {
    const gap = lastCooldownPress + o.cooldownGapMs - ctx.now();
    if (gap > 0) yield { wait: gap };
    lastCooldownPress = ctx.now();
    log(`tap ${control}`);
    yield { tap: control };
  };
  const monitorTo = function* (want) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const f = yield* waitFor((x) => x.monitor !== 'flipping');
      if (!f) return null;
      if (f.monitor === want) return f;
      yield { tap: 'monitor' };
      const moved = yield* waitFor((x) => x.monitor === 'flipping' || x.monitor === want, o.flipConfirmMs);
      if (moved && moved.monitor === want) return moved;
    }
    return null;
  };
  let pan = 'left';
  const goPan = function* (side) { if (pan !== side) { yield { pan: side }; pan = side; } };
  const key = (side) => (side === 'left' ? 'leftDoor' : 'rightDoor');

  // --- Foxy: one flick per roll, which also reads CAM 4B for Chica ---------
  const chica = { seenAt4B: new Set(), looked: new Set() };
  let foxK = Math.max(1, rollIndexBefore('foxy', ctx.now()) + 1);
  const flickDue = () => ctx.now() >= roll('foxy', foxK) - o.flickLeadMs;
  const flick = function* () {
    const f = roll('foxy', foxK);
    log(`flick foxy@${foxK}`);
    foxK += 1;
    if (ctx.now() > f) return;                          // this roll is gone; the next flick is due
    const up = yield* monitorTo('up');
    if (up) {
      if (up.cam !== 42) { yield { tapCam: 42 }; yield* waitFor((x) => x.cam === 42, 500); }
      const seenMs = up.frame * MS_PER_FRAME;
      const j = rollIndexBefore('chica', seenMs);
      const clear = seenMs - roll('chica', j) > o.marginMs && roll('chica', j + 1) - seenMs > o.marginMs;
      if (clear) {
        chica.looked.add(j);
        if (up.chica4B === true) chica.seenAt4B.add(j);
      } else if (up.chica4B === true) {
        chica.seenAt4B.add(j); chica.seenAt4B.add(j + 1);
      }
      // Hold the view until the down-press lands inside the hold's reach.
      const downAt = f - o.flickEndBeforeMs - 82;
      const hold = Math.max(o.dwellMs, downAt - ctx.now());
      yield { wait: hold };
    }
    yield* monitorTo('down');
  };

  // Every task runs through this: before each of its actions, a due flick
  // goes first -- preemption at the only granularity a finger has. A task
  // resumed after a flick re-reads the room: its light was put out by the
  // put-down [g357], and its loops retry on what the frame shows.
  const log = (msg) => { if (o.debug) o.debug(`${(ctx.now() / 1000).toFixed(3)} ${msg}`); };
  const run = function* (task, label = 'task') {
    log(`run ${label}`);
    const it = task();
    let v;
    for (;;) {
      const { value, done } = it.next(v);
      if (done) return value;
      // Before a read or a wait only: a touch goes with the read that
      // decided it, never after a flick that has changed the room.
      if (!('tap' in value || 'tapCam' in value || 'pan' in value) && flickDue()) yield* flick();
      v = yield value;
    }
  };

  // --- the doors --------------------------------------------------------------
  // `free` is the first roll at which the character could be at the door.
  // `turnBack` is the roll the shut door is holding for.
  const door = {
    left: { who: 'bonnie', free: 4, turnBack: null, closeAt: null, shutSeenMs: null, checkedThrough: 3 },
    right: { who: 'chica', free: 5, turnBack: null, closeAt: null, shutSeenMs: null, checkedThrough: 4 },
  };
  const lookAt = function* (side) {
    yield* monitorTo('down');
    yield* goPan(side);
    const light = side === 'left' ? 'leftLight' : 'rightLight';
    let seen = null;
    for (let attempt = 0; attempt < 3 && !seen; attempt += 1) {
      yield* cooldownTap(light);
      seen = yield* waitFor((f) => f[side] === 'occupied' || f[side] === 'clear', o.releaseConfirmMs);
    }
    if (o.lightOff && seen) yield* cooldownTap(light);
    return !seen || seen[side] === 'occupied';
  };
  // A door is driven to a state from frames rendered after the last touch
  // could have landed -- an earlier frame still shows the state that touch
  // is changing, and a second touch on it would undo the first.
  const setDoorState = function* (side, want) {
    const d = door[side];
    yield* monitorTo('down');
    yield* goPan(side);
    let notBefore = -Infinity;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const f = yield* waitFor((x) => x.frame * MS_PER_FRAME >= notBefore
        && (x[key(side)] === DOOR_OPEN || x[key(side)] === DOOR_SHUT), 1500);
      if (!f) continue;
      if (f[key(side)] === want) {
        if (want === DOOR_SHUT) d.shutSeenMs = f.frame * MS_PER_FRAME;
        return f;
      }
      yield* cooldownTap(key(side));
      notBefore = ctx.now() + o.landingMaxMs;
    }
    return null;
  };
  const shut = function* (side) { return yield* setDoorState(side, DOOR_SHUT); };
  const open = function* (side) { return yield* setDoorState(side, DOOR_OPEN); };

  // What each door wants done now, in priority order.
  const doorWork = (side) => {
    const d = door[side];
    const now = ctx.now();
    const k = rollIndexBefore(d.who, now - o.marginMs);   // last roll surely behind us
    if (d.turnBack !== null && d.closeAt !== null) {
      if (now < d.closeAt) return null;
      return { prio: 0, label: `close-${side}`, run: function* () { yield* shut(side); d.closeAt = null; } };
    }
    if (d.turnBack !== null) {
      // Shut and holding. Once the turn-back roll is behind us, the light
      // through the shut door says whether he left -- which is how the door
      // is reopened, not the roll arithmetic.
      if (k < d.turnBack) return null;
      const turnedAt = d.turnBack;
      return { prio: 2, label: `reopen-${side}@${turnedAt}`, run: function* () {
        if (yield* lookAt(side)) { d.turnBack = rollIndexBefore(d.who, ctx.now() - o.marginMs) + 1; return; }
        yield* open(side);
        d.turnBack = null;
        d.shutSeenMs = null;
        // Turned back to 1B / 4A: Bonnie needs three rolls to return, Chica two
        // and a stand on 4B. Any roll the reopen was late for is re-checked.
        d.free = turnedAt + (side === 'left' ? 3 : 2);
        d.checkedThrough = Math.max(turnedAt, Math.min(k, d.free - 1));
        if (k >= d.free) d.checkedThrough = turnedAt;   // late enough that he may be back
      } };
    }
    if (k < d.free || k <= d.checkedThrough) return null;
    if (side === 'right' && o.chicaByCamera) {
      // She reaches the door only from 4B: after roll k she can be there only
      // if she stood on 4B through interval k-1 -- or nobody looked.
      let needed = false;
      for (let j = d.checkedThrough; j < k; j += 1) {
        if (chica.seenAt4B.has(j) || !chica.looked.has(j)) needed = true;
      }
      if (!needed) { d.checkedThrough = k; return null; }
    }
    return { prio: 1, label: `check-${side}@${k}`, run: function* () {
      const through = rollIndexBefore(d.who, ctx.now() - o.marginMs);
      if (yield* lookAt(side)) {
        d.turnBack = through + 1;
        // A closing door costs nothing and a shut one costs a unit a second,
        // so the door is shut just ahead of the roll -- unless that roll is
        // already close, in which case it is shut from here, at this pan.
        const latest = roll(d.who, d.turnBack) - DOOR_ANIM - o.marginMs - o.closeLeadMs;
        if (ctx.now() >= latest) yield* shut(side);
        else d.closeAt = latest;
      }
      d.checkedThrough = through;
    } };
  };

  // --- the night ---------------------------------------------------------------
  yield* run(function* () {
    yield* monitorTo('up');
    yield { tapCam: 42 };
    yield* waitFor((f) => f.cam === 42);
    yield* monitorTo('down');
  });
  for (;;) {
    if (flickDue()) { yield* flick(); continue; }
    const work = ['left', 'right'].map(doorWork).filter(Boolean).sort((a, b) => a.prio - b.prio);
    if (o.debug) log(`state L{free:${door.left.free},thru:${door.left.checkedThrough},tb:${door.left.turnBack}} R{free:${door.right.free},thru:${door.right.checkedThrough},tb:${door.right.turnBack}} work=${work.map(w => w.label).join('|')}`);
    // A pending shut is pulled forward rather than risk it queueing behind a
    // task that would still be running when it falls due.
    const pending = ['left', 'right'].filter((side) => door[side].closeAt !== null)
      .sort((a, b) => door[a].closeAt - door[b].closeAt)[0];
    if (pending && (work.length === 0 || work[0].prio > 0)
        && door[pending].closeAt - ctx.now() < (work.length ? o.taskGuardMs : 0)) {
      yield* run(function* () { yield* shut(pending); door[pending].closeAt = null; }, `pull-close-${pending}`);
      continue;
    }
    if (work.length) { yield* run(work[0].run, work[0].label); continue; }
    yield* run(function* () { yield* goPan('left'); });
    yield { wait: 50 };
  }
}

export const DEVICE_POLICIES = { flick4b, grid420 };

export function census({ seeds = 3000, start = 0, night = 7, custom = FOUR_TWENTY, lane = 'typical',
                         policy = 'flick4b', options = {}, timing = loadTiming() } = {}) {
  const make = DEVICE_POLICIES[policy];
  if (!make) throw new Error(`no device policy ${policy}`);
  const causes = {};
  let wins = 0;
  const power = [];
  const refused = [];
  for (let seed = start; seed < start + seeds; seed += 1) {
    const r = runDeviceNight({ night, seed, custom, timing, lane, policy: make, options });
    causes[r.outcome] = (causes[r.outcome] ?? 0) + 1;
    if (r.outcome === '6AM') { wins += 1; power.push(r.power); }
    refused.push(r.stats.refused);
  }
  power.sort((a, b) => a - b);
  return { policy, lane, night, custom, seeds, start, wins, causes,
           powerAt6: power.length ? { min: power[0], median: power[power.length >> 1] } : null,
           refusedMean: refused.reduce((a, b) => a + b, 0) / refused.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = { seeds: 3000, start: 0, lane: 'typical', policy: 'flick4b', night: 7, options: {} };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--seeds') args.seeds = Number(argv[++i]);
    else if (flag === '--start') args.start = Number(argv[++i]);
    else if (flag === '--lane') args.lane = argv[++i];
    else if (flag === '--policy') args.policy = argv[++i];
    else if (flag === '--night') args.night = Number(argv[++i]);
    else if (flag.startsWith('--opt.')) {
      const raw = argv[++i];
      args.options[flag.slice(6)] = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
    } else throw new Error(`unknown flag ${flag}`);
  }
  const custom = args.night === 7 ? FOUR_TWENTY : null;
  const row = census({ ...args, custom });
  console.log(`[MODEL_ONLY device lane] fnaf1 night ${row.night}${custom ? ' 4/20' : ''} ${row.policy} ${row.lane}` +
    `  ${row.wins}/${row.seeds}  seeds ${row.start}-${row.start + row.seeds - 1}` +
    `  power@6 ${JSON.stringify(row.powerAt6)}  refused/night ${row.refusedMean.toFixed(1)}` +
    `  ${JSON.stringify(row.causes)}`);
}
