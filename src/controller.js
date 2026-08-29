// Reactive controllers for the stock-device video loop. Plan 19 package 1.
//
// A controller consumes the Observer's fact set once per cycle and returns zero
// or more press intents `{ action, at }`. The replay harness merges them with
// the open-loop base schedule and DROPS any intent whose animation would
// collide with a scheduled press's -- the night 6-38 rule: a reactive
// `monitor-resync` fired mid-`MONITOR_ANIM_DOWN` caused the desync it hunted.
import * as C from './config.js';
import { val } from './observer.js';

// Only monitor/mask presses animate; light/wind presses are instantaneous and
// never conflict. GUARD_FRAMES is the longest of the two animations.
export const GUARD_FRAMES = Math.max(C.MONITOR_ANIM_DOWN, C.MONITOR_ANIM_UP,
                                     C.MASK_ANIM_ON, C.MASK_ANIM_OFF);
const ANIMATED = new Set(['monitor', 'mask']);

// Drop an intent whose action animates and lands within GUARD_FRAMES of a
// scheduled press that also animates. `scheduled` is `[{ at, action }]` (or a
// bare frame list, treated as monitor presses -- the conservative reading).
export function guardIntents(intents, scheduled) {
  const anim = scheduled.map(s => (typeof s === 'number' ? { at: s, action: 'monitor' } : s))
                        .filter(s => ANIMATED.has(s.action));
  return intents.filter(i =>
    !ANIMATED.has(i.action) ||
    !anim.some(s => Math.abs(i.at - s.at) < GUARD_FRAMES));
}

// After emitting an animated press, wait this long before emitting another --
// the animation has to finish AND the ~59 ms sensor read has to reflect it, or
// the controller presses again on a stale observation and reverses itself
// (engine.js setMonitor toggles on MON_RAISING/MON_LOWERING).
export const PRESS_COOLDOWN = GUARD_FRAMES + C.s(0.15);

export class ReactiveController {
  constructor(opts = {}) {
    this.opts = opts;
    this.log = [];
    this.lastAnimPress = { action: null, at: -Infinity };
  }
  // obs: the current fact set. ctx: { frame, scheduled: [{at,action}] }.
  decide(_obs, _ctx) { return []; }
  note(frame, what) { this.log.push({ frame, what }); }

  // Are we still waiting for the last monitor/mask press to land and be seen?
  cooling(frame) {
    return frame - this.lastAnimPress.at < PRESS_COOLDOWN;
  }
  // Record + return the intents, stamping the cooldown on animated ones.
  emit(frame, intents) {
    for (const i of intents)
      if (ANIMATED.has(i.action)) this.lastAnimPress = { action: i.action, at: frame };
    return intents;
  }
}

// Watch the schedule, act only on a blackout: get a mask fully on before the
// deadline (lowering the monitor first if we are camming, since the mask cannot
// go on with the monitor up), hold across the blackout, verify the left opening
// is clear, then restore the monitor. This is the reaction RVC / brayden / the
// published Minus Toys blackout branch need, and nothing more -- blackout is a
// whole-screen luma read the coarse sensor never misses.
export class BlackoutReactive extends ReactiveController {
  constructor(opts = {}) {
    super(opts);
    // Never stay masked longer than this waiting for a clear opening: Withered
    // Foxy accelerates while the mask is up with nobody at the vent (g825).
    this.maxMaskFrames = opts.maxMaskFrames ?? C.s(6);
    this.state = 'idle';    // idle | securing | holding | verifying | restoring
    this.since = -1;
    this.loweredMonitor = false;
  }

  decide(obs, ctx) {
    const f = ctx.frame;
    const blackoutNow = obs.blackout.state === 'OBSERVED' && obs.blackout.value;
    const opening = obs.leftOpening;
    const masked = val(obs.maskOn, false);
    const monUp = val(obs.monitorUp, null);  // true | false | null (UNKNOWN)
    const out = [];

    // A fresh blackout while we are past the mask (verifying/restoring) and no
    // longer protected must restart -- blackouts land in quick succession and
    // the second is just as lethal.
    if (blackoutNow && !masked && (this.state === 'verifying' || this.state === 'restoring'))
      this.state = 'idle';

    const cooling = this.cooling(f);

    // Mask up too long -> drop it regardless of what we can see (Foxy).
    if (masked && this.since >= 0 && f - this.since >= this.maxMaskFrames && !cooling) {
      this.state = this.loweredMonitor ? 'restoring' : 'idle';
      this.note(f, 'mask timeout -> drop');
      return this.emit(f, [{ action: 'mask', at: f }]);
    }

    if (this.state === 'idle') {
      if (blackoutNow && !masked) {
        this.state = 'securing';
        this.since = f;
        this.note(f, 'blackout -> secure a mask');
      } else {
        return out;
      }
    }

    if (this.state === 'securing') {
      if (masked) {
        this.state = 'holding';
        this.since = f;   // the Foxy timeout counts from when the mask went ON
        return out;
      }
      if (cooling) return out;   // wait for the last press to land and be seen
      if (monUp === false) {
        this.note(f, 'cams down -> mask');
        return this.emit(f, [{ action: 'mask', at: f }]);
      }
      if (monUp === true) {
        this.loweredMonitor = true;
        this.note(f, 'lower monitor first');
        return this.emit(f, [{ action: 'monitor', at: f }]);
      }
      return out;   // UNKNOWN: it is animating, wait
    }

    if (this.state === 'holding') {
      if (!blackoutNow) { this.state = 'verifying'; this.note(f, 'blackout cleared -> verify'); }
      return out;
    }

    if (this.state === 'verifying') {
      if (opening.state === 'OBSERVED' && !cooling) {
        if (opening.value === 'empty') {
          this.state = this.loweredMonitor ? 'restoring' : 'idle';
          this.note(f, 'opening empty -> drop mask');
          return masked ? this.emit(f, [{ action: 'mask', at: f }]) : out;
        }
        this.note(f, 'opening threat -> hold');
      }
      return out;
    }

    // restoring: mask off, raise the monitor back so the base schedule resumes.
    if (this.state === 'restoring') {
      if (masked || cooling) return out;
      if (monUp === true) { this.state = 'idle'; this.loweredMonitor = false; return out; }
      if (monUp === false) {
        this.note(f, 'raise monitor -> resume base');
        return this.emit(f, [{ action: 'monitor', at: f }]);
      }
      return out;   // UNKNOWN: animating
    }

    return out;
  }
}

export const CONTROLLERS = { blackoutReactive: BlackoutReactive };
