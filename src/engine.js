import * as C from './config.js';
import { Rng } from './rng.js';

const MON_DOWN = 'down', MON_RAISING = 'raising', MON_UP = 'up', MON_LOWERING = 'lowering';

export class Sim {
  constructor(opts = {}) {
    this.opts = Object.assign({
      seed: (Math.random() * 4294967295) >>> 0,
      worst: false,
      night: 7,             // sourced tables index by night; 7 = 10/20 mode
      android: true,        // canonical target; flag retained only for old test modes
      speed: 1.0,
      // Off by default: the per-frame report channels cost about half of a
      // headless night, and only the in-app report reads them. Callers that
      // want `sim.rec` opt in.
      record: false,
      bbEnabled: true,
      foxyEnabled: true,
      gfEnabled: true,
      boxEnabled: true,
      powerEnabled: true,
      stalledEnabled: true,
      lethal: true,
      durationFrames: C.NIGHT_FRAMES,
      // The two sourced Android camera mechanisms (post-XOR decode):
      // flashes load a 400-frame B countdown from `stun time`, and the
      // selected-camera marker holds Withered (and monitor-up Mangle)
      // pending rolls while it overlaps them. The old passive 400-frame
      // "look timer" on Withereds was a pre-XOR model of the hold; keep it
      // as a legacy diagnostic knob, default off.
      cameraLightStunFrames: C.STUN_FRAMES,
      passiveWitheredLookStunFrames: 0,
      selectedCameraGate: true,
    }, opts);

    this.rng = new Rng(this.opts.seed, this.opts.worst);
    this.frame = 0;
    this.events = [];
    this.alive = true;
    this.won = false;
    this.death = null;

    // --- player-controlled state
    this.monitor = MON_DOWN;
    this.monAnim = 0;
    this.camsUpCount = 0;
    // frame the current cams-up session started (-1 = monitor down); the
    // sourced entry timer counts against this streak, not time-in-opening
    this.camsUpSince = -1;
    this.cam = C.parkedCamera(this.opts.night);
    this.hasViewedCamera = false;
    this.maskOn = false;
    this.maskAnim = 0;
    this.lightHeld = false;
    this.lightLogicalUntil = -1;
    this.winding = false;
    this.ventLightL = false;
    this.ventLightR = false;

    // --- resources
    this.power = C.powerFrames(this.opts.night);
    this.box = 1;

    // --- AI levels (g673-684 and the caps). Every roll below reads this map
    // rather than a 10/20 constant, because nights below 7 change level by the
    // hour: night 6 alone switches the three Toys on and takes Balloon Boy
    // from 5 to 9 at 2 AM. Starting from zero is g673, which clears every
    // counter on any night but Custom -- and Custom writes every dial anyway.
    this.ai = Object.fromEntries(C.AI_IDS.map(id => [id, 0]));
    this.applyAiHour(0);

    // --- Foxy
    this.foxy = { loc: 'parts', D: 0, exposure: 0, gotYou: false, pinUntil: -1,
                  readyAt: this.rng.int(C.FOXY_ENTER_MIN, C.FOXY_ENTER_MAX, C.FOXY_ENTER_MIN) };
    this.maskDAccum = 0;

    // --- Golden Freddy (office) + the separate hallway version
    this.gf = {
      present: false, inHall: false, hallExposure: 0,
      hallInside: false, attackAt: -1,
    };
    // `hall movement`: refreshed to 300 frames whenever someone transits the
    // hall, and Golden Freddy's hall exposure is blocked while it runs.
    this.hallMovementUntil = -1;

    // --- Balloon Boy
    this.bb = { stage: 0, pending: false, inOpening: false, openingAtCamsUp: -1,
                maskTicks: 0, inside: false };


    // --- blackout
    this.blackout = { active: false, until: 0, by: null, unitId: null, masked: false, deadline: 0 };
    this.blackoutCount = 0;
    // `drop everything` (g141): the forcedown flag. Set by g718-721, g624 and
    // g574; executed on the monitor by g262 and on the mask by g274, then
    // cleared by g612.
    this.dropEverything = false;

    // --- the seven
    this.units = C.STALLED.map(u => ({
      ...u, idx: 0, stunUntil: -1, pending: false, atOpening: false,
      openingSince: -1, openingReadyAt: -1, officeCue: false,
      openingTicks: 0, maskExposureTicks: 0, raiseSeen: false, inside: false,
      insideArmed: false, insideDangerAt: -1, committedAt: -1, done: false,
    }));
    // sourced `chicalookatyou` lock: one mutex-flagged attacker engages at a time
    this.engagedToy = null;

    // --- puppet
    this.puppet = {
      stage: 0, out: false, route: null, idx: -1, loc: 11,
      pending: false, pathChoice: 'left', stunUntil: -1,
      atOpening: false, inside: false, attackAt: -1,
    };

    // --- recording for the post-run report
    if (this.opts.record) {
      const n = this.opts.durationFrames + 2;
      this.rec = {
        n: 0,
        stun: [new Uint16Array(n), new Uint16Array(n), new Uint16Array(n)], // cams 10,4,7
        occ: new Uint8Array(n),   // bit per target cam: is anyone standing there
        d: new Uint8Array(n),
        power: new Uint16Array(n),
        box: new Uint8Array(n),
        flags: new Uint8Array(n), // bit0 mask, bit1 camsUp, bit2 light, bit3 bbOpening, bit4 gf
      };
    }
    this.mistakes = [];
  }

  // ---------------------------------------------------------------- helpers
  // The rows that fire as `hour` begins, capped as g829/g830/g856-863 cap them.
  applyAiHour(hour) {
    for (const row of C.aiUpdates(this.opts.night, hour)) {
      for (const [id, level] of Object.entries(row.set)) {
        const value = typeof level === 'number' ? level : this.rollAi(level.oneIn);
        this.ai[id] = Math.min(value, C.aiCap(id));
      }
    }
  }

  // `(Random(N) + 1) / N` under integer division: one only on the top draw.
  rollAi(oneIn) {
    return this.rng.int(0, oneIn - 1, oneIn - 1) === oneIn - 1 ? 1 : 0;
  }

  get t() { return this.frame / C.FPS; }
  get camsUp() { return this.monitor === MON_UP; }
  get maskFullyOn() { return this.maskOn && this.maskAnim === 0; }
  // `being attacked by` (g560-562 set it per unit at marker 123).
  // `being attacked by` (object 136): the COMMITTED attack, which g267/g270
  // read to refuse the mask and g624 reads to force everything down. It is
  // NOT `got you stage` == 1 (the reaction countdown) -- conflating the two
  // is the 2026-08-26 defect recorded in config.js.
  get attackExecuting() { return this.units.some(u => u.committedAt >= 0); }
  get puppetAttackExecuting() { return this.puppet.attackAt >= 0; }
  get goldenHallAttackExecuting() { return this.gf.attackAt >= 0; }
  get hallView() { return this.monitor !== MON_UP; }
  // `white button` follows the physical hold. `new bonnie`, the office-light
  // movement latch, survives release until the next one-second scheduler tick.
  get lightLogical() { return this.lightHeld && !this.maskOn && !this.bb.inside; }
  // [SOURCED] g75/g84 (hall light) and g302/304 (vent lights) all require
  // `mask` = 0: wearing the mask turns every office light off outright. A
  // masked player can only take the mask off.
  get lightStallOn() { return this.frame < this.lightLogicalUntil; }
  get anyOfficeLightHeld() {
    return this.maskFullyOff && !this.bb.inside && !this.blackout.active &&
      (this.lightHeld || this.ventLightL || this.ventLightR);
  }
  // [SOURCED: g75 (hall), g76/g77 (camera), g301/g303/g320 (vent)] Every light
  // in the office is gated on `mask` = 0 and `in danger` = 0. The mask counter
  // is a four-state animation -- 0 off, 1 raising (g267/g270), 2 fully on (g9),
  // 3 lowering (g274) -- so "mask off" is not the press, it is the end of the
  // mask-off animation: the post-mask flash lockout IS that animation. And
  // `in danger` is the office-encounter latch, raised by g443-447/g490 and
  // cleared by the endpoint resolutions g538-555, so no light answers at all
  // while an encounter is running (g83/g88 do not even register the touch).
  get maskFullyOff() { return !this.maskOn && this.maskAnim === 0; }
  get hallLightOn() {
    return this.lightHeld && this.hallView && this.maskFullyOff &&
      !this.bb.inside && !this.blackout.active;
  }
  // The vent lights carry the same gate, re-tested every frame: g299 clears
  // both on a 200 ms timer and only g301/g303/g320 re-assert them, so a vent
  // light already held goes out the moment the mask starts going on.
  get ventLightLOn() {
    return this.ventLightL && this.hallView && this.maskFullyOff &&
      !this.bb.inside && !this.blackout.active;
  }
  get ventLightROn() {
    return this.ventLightR && this.hallView && this.maskFullyOff &&
      !this.bb.inside && !this.blackout.active;
  }
  // g76/g85 exclude a BB at 123, but g77/g86 -- the `viewing = 10` pair -- do
  // not, so CAM 10 is the one camera he leaves you.
  get camLightOn() {
    return this.lightHeld && this.monitor === MON_UP && !this.blackout.active &&
      (!this.bb.inside || this.cam === 10);
  }
  get bars() { return Math.max(0, Math.min(4, Math.floor((this.power - C.POWER_PER_BAR) / C.POWER_PER_BAR))); }
  // Holding the wind button only winds when you are actually on the box camera.
  // Anything else -- cams down, wrong camera -- is a finger doing nothing.
  get isWinding() { return this.winding && this.monitor === MON_UP && this.cam === C.BOX_CAM; }

  emit(type, data) { this.events.push({ f: this.frame, type, data }); }
  flag(code, detail) { this.mistakes.push({ f: this.frame, t: this.t, code, detail }); }

  kill(reason, detail) {
    if (!this.alive || !this.opts.lethal) { if (!this.opts.lethal) this.flag('would-die', reason); return; }
    this.alive = false;
    this.death = { reason, detail, frame: this.frame, t: this.t };
    this.emit('death', this.death);
  }

  // ------------------------------------------------------------------ input
  press(action) {
    if (!this.alive) return;
    // Two input gates the engine had never enforced, both about reachability
    // rather than effect:
    //
    // 1. The mask cannot go on with the monitor up. There is no state in which
    //    both are raised, so a mask press while the cams are up is not a
    //    toggle -- it is an input the player cannot make.
    // 2. While the mask is on, the only control that answers is the mask
    //    itself. This is the input-side half of the g75/g84 lockout the light
    //    getters already model: a masked player can only take the mask off.
    //
    // Both matter for an open-loop pilot, whose table presses buttons without
    // checking what state the game is actually in: presses that the device
    // silently drops must be dropped here too, or the simulation flatters a
    // schedule that the phone would not execute.
    if (this.maskOn && action !== 'mask') return;
    if (action === 'mask' && !this.maskOn &&
        (this.monitor === MON_UP || this.monitor === MON_RAISING)) return;
    // Puppet at marker 123 has already written `being attacked by` (g574),
    // so g267/g270 no longer accept a new mask press during his 40-frame
    // attack transition.
    if (action === 'mask' && !this.maskOn &&
        (this.puppetAttackExecuting || this.goldenHallAttackExecuting)) return;
    // g267/g270 require `being attacked by` (136) = 0, so a COMMITTED attack
    // refuses the mask. Corrected 2026-08-26: this used to read the reaction
    // countdown (`got you stage` == 1) instead, and so forbade for the whole
    // window the one action g533 says ends it. No withered that reached the
    // office was survivable in this simulator until that was split apart.
    if (action === 'mask' && !this.maskOn && this.attackExecuting) return;
    if (action === 'light') {
      this.lightHeld = true;
      this.onLightPress();
    } else if (action === 'mask') {
      this.setMask(!this.maskOn);
    } else if (action === 'monitor') {
      this.setMonitor(!(this.monitor === MON_UP || this.monitor === MON_RAISING));
    } else if (action === 'wind') {
      this.winding = true;
    } else if (action === 'ventL') { this.ventLightL = true; }
    else if (action === 'ventR') { this.ventLightR = true; }
    else if (action.startsWith('cam:')) {
      const n = +action.slice(4);
      if (this.monitor === MON_UP && C.CAMS[n]) this.cam = n;
    }
  }

  release(action) {
    if (action === 'light') this.lightHeld = false;
    else if (action === 'wind') this.winding = false;
    else if (action === 'ventL') this.ventLightL = false;
    else if (action === 'ventR') this.ventLightR = false;
  }

  onLightPress() {
    if (this.hallView) {
      if (this.gf.present) { this.kill('golden-freddy', 'Flashed the hall with Golden Freddy in the office'); return; }
      if (this.foxy.gotYou) { this.kill('foxy', 'Flashed the hall after Foxy locked on (D exceeded 3 at a 5s check)'); return; }
    }
  }

  setMask(on) {
    if (this.maskOn === on) return;
    this.maskOn = on;
    this.maskAnim = on ? C.MASK_ANIM_ON : C.MASK_ANIM_OFF;
    if (on) {
      if (this.gf.present) { this.gf.present = false; this.emit('gf-cleared'); }
    } else {
      // For the four shared office attackers, taking the mask back off after
      // they have reached marker 123 immediately raises `danger 2`
      // (Android groups 560-563).
      for (const u of this.units) {
        if (u.inside && u.openingRule === 'streak')
          this.commitAttack(u, 'mask was removed with an attacker inside the office');
      }
    }
  }

  setMonitor(up) {
    if (up && (this.monitor === MON_UP || this.monitor === MON_RAISING)) return;
    if (!up && (this.monitor === MON_DOWN || this.monitor === MON_LOWERING)) return;
    if (up) {
      if (this.gf.present) { this.kill('golden-freddy', 'Raised the monitor with Golden Freddy in the office'); return; }
      this.monitor = MON_RAISING; this.monAnim = C.MONITOR_ANIM_UP;
      // Mangle's marker-122 flag is set while the monitor-raise object is
      // visible (group 402), then consumed when that object disappears.
      for (const u of this.units) {
        if (u.id === 'mangle' && u.atOpening) u.raiseSeen = true;
      }
      this.camsUpSince = this.frame; // the source counter runs from the tap
    } else {
      this.monitor = MON_LOWERING; this.monAnim = C.MONITOR_ANIM_DOWN;
      this.winding = false;
      this.camsUpSince = -1; // the source resets the streak on lowering
      // The monitor-lowering object (`blip`) raises `danger 2` for the six
      // regular marker-123 occupants (groups 564-569). Mangle instead needs
      // her separate cameras-up random arm from groups 730-731.
      for (const u of this.units) {
        if (!u.inside) continue;
        if (u.id === 'mangle') {
          if (u.insideArmed) this.commitAttack(u, 'Mangle armed while the cameras were up');
        } else {
          this.commitAttack(u, 'lowered the monitor with an attacker inside the office');
        }
      }
    }
  }

  startBlackout(by, unitId = null) {
    this.blackout = { active: true, until: this.frame + C.BLACKOUT_FRAMES, by,
                      unitId, masked: this.maskFullyOn,
                      deadline: this.frame + C.maskGraceFrames(this.opts.night) };
    this.blackoutCount++;
    this.emit('blackout', by);
  }

  startOfficeEncounter(u) {
    if (this.blackout.active || !u.atOpening) return;
    u.officeCue = true;
    this.startBlackout(u.name, u.id);
    this.emit('office-cue', u.id);
  }

  unitEnterInside(u, why) {
    u.atOpening = false;
    u.inside = true;
    u.officeCue = false;
    u.raiseSeen = false;
    u.openingSince = -1;
    u.openingReadyAt = -1;
    u.openingTicks = 0;
    if (this.engagedToy === u.id) this.engagedToy = null;
    this.emit('office-entry', { who: u.id, why });
    this.flag('inside-office', `${u.name} reached marker 123: ${why}`);
  }

  // Worst luck for the player is the shortest immunity, so the roll pins to 0.
  repelCooldown() {
    return Math.floor(this.rng.int(0, C.REPEL_COOLDOWN_ROLL - 1, 0) / this.opts.night);
  }

  // g532 / g556-559 -> `being attacked by` = N. Past this point the mask is
  // refused (g267) and everything is forced down (g624); nothing cancels it.
  commitAttack(u, why) {
    if (u.committedAt >= 0) return;
    u.insideDangerAt = -1;
    u.committedAt = this.frame + C.INSIDE_ATTACK_FRAMES;
    this.dropEverything = true;   // g624
    this.emit('inside-committed', { who: u.id, why });
  }

  armInsideAttack(u, why) {
    if (u.insideDangerAt >= 0) return;
    // `got you stage` = 1 and `time left` = `time allowed`, per night (g530).
    u.insideDangerAt = this.frame + C.timeAllowedFrames(this.opts.night);
    // NOT dropEverything. g624 gates on `being attacked by` (136) > 0 -- the
    // COMMITTED attack -- and g274 turns `drop everything` into mask = 3, i.e.
    // it forces the mask OFF. Setting it here, at `got you stage` = 1, made the
    // bug self-reinforcing: the mask could never reach `mask == 2`, so g533's
    // escape was unreachable even once the gate above was removed. Third place
    // the same two source variables had been merged.
    this.emit('inside-armed', { who: u.id, why });
  }

  // g262 lowers the monitor and zeroes `viewing`, g274 takes the mask off, and
  // g612 clears the flag -- all in the same frame it was set. The player's own
  // presses that frame are read at g254-270, i.e. after the monitor forcedown
  // and before the mask one, so running this at the top of the tick reproduces
  // the order: neither a monitor nor a mask press survives a forcedown.
  tickForcedown() {
    if (!this.dropEverything) return;
    this.dropEverything = false;
    if (this.monitor === MON_UP || this.monitor === MON_RAISING) this.setMonitor(false);
    if (this.maskOn) this.setMask(false);
    this.emit('forcedown');
  }

  // ------------------------------------------------------------------- tick
  tick() {
    if (!this.alive || this.won) return;
    const f = ++this.frame;

    // g262/g274 execute the forcedown near the top of the sheet, while
    // g612 clears it and g624/g718-721 set it near the bottom -- so a flag
    // raised this frame is spent on the next one. Running it first keeps that
    // one-frame latency and the ordering against the player's own presses.
    this.tickForcedown();

    if (this.monAnim > 0 && --this.monAnim === 0) {
      if (this.monitor === MON_RAISING) {
        this.monitor = MON_UP;
        if (!this.hasViewedCamera) {
          this.cam = C.initialCamera(this.opts.night);
          this.hasViewedCamera = true;
        }
        this.onCamsUp();
        // Active 18 has just become invisible: a Mangle that saw this raise
        // crosses 122 -> 123 now (groups 402-403).
        for (const u of this.units) {
          if (u.id === 'mangle' && u.atOpening && u.raiseSeen)
            this.unitEnterInside(u, 'completed a monitor raise after Mangle reached marker 122');
        }
      }
      else if (this.monitor === MON_LOWERING) this.monitor = MON_DOWN;
    }
    if (this.maskAnim > 0 && --this.maskAnim === 0 && this.maskOn) {
      // Group 293 resets the local mask-duration counters on each transition
      // into the fully-on mask state. They are continuous holds, not storage.
      for (const u of this.units) {
        if (u.id === 'toychica' || u.id === 'mangle') u.maskExposureTicks = 0;
      }
      this.bb.maskTicks = 0;   // g293 names Balloon Boy alongside the two toys
    }

    // --- 5-second interval: Foxy's kill check runs before anything else
    if (f % C.MO_FRAMES === 0) this.onFiveSecond();

    // --- 10-second interval: g718-721 slam everything down while one of the
    // four streak attackers is waiting at marker 122 with the cameras up.
    if (f % (C.MO_FRAMES * 2) === 0 && this.camsUp &&
        this.units.some(u => u.atOpening && u.openingRule === 'streak')) {
      this.dropEverything = true;
    }

    // --- 10-second interval: locked-on Foxy strikes if no blackout is covering
    if (f % (C.MO_FRAMES * 2) === 0 && this.foxy.gotYou && !this.blackout.active) {
      this.kill('foxy', 'Foxy had locked on and no blackout covered the 10s interval');
      return;
    }

    // --- blackout resolution
    if (this.blackout.active) {
      // Android group 533 only defuses while the 45-frame fuse is still in
      // state 1, and only once the mask animation has reached state 2.
      if (!this.blackout.masked && this.maskFullyOn && f < this.blackout.deadline)
        this.blackout.masked = true;
      // Fuse expiry arms the attack, but groups 538-555 do not resolve it
      // until the 300-frame office sequence ends.
      if (f >= this.blackout.until) {
        const ended = this.blackout;
        this.blackout = { active: false, until: 0, by: null, unitId: null, masked: false, deadline: 0 };
        if (ended.unitId) {
          // The source does not resolve whoever started the encounter: g538-555
          // run in group order and the first match consumes `check and move`,
          // so the queue drains one occupant per encounter by fixed priority.
          const order = ended.masked ? C.RESOLVE_ORDER_DEFENDED : C.RESOLVE_ORDER_FAILED;
          const u = order.map(id => this.units.find(x => x.id === id && x.atOpening))
                         .find(Boolean) || this.units.find(x => x.id === ended.unitId);
          if (u?.atOpening) {
            // Endpoint resolution (groups 538-555): a defended occupant is
            // repelled to their sourced mid-route room with a fresh approach
            // cooldown B = Random(500)/night.
            if (ended.masked) this.unitLeave(u, { cooldown: this.repelCooldown() });
            else this.unitEnterInside(u, 'missed the 45-frame office-defense fuse');
          }
        } else if (!ended.masked) {
          this.kill('blackout', `${ended.by} got you: the mask was not fully on within 0.75s`);
          return;
        }
      }
    }

    this.tickLight();
    this.tickGoldenHall(f);
    this.tickFoxy(f);
    this.tickMask();
    this.tickUnits(f);
    this.tickBox();
    if (this.opts.record) this.record();

    // The table groups sit at g673-684, below every group that reads an AI
    // counter (g333-342 and g494-496), so a new hour's levels reach the rolls
    // on the frame after the hour ticks over, not on it.
    if (f % C.HOUR_FRAMES === 0) this.applyAiHour(f / C.HOUR_FRAMES);

    if (f >= this.opts.durationFrames) { this.won = true; this.emit('win'); }
  }

  tickLight() {
    // Only `lit?` — the office/camera flashlight — drains the battery
    // (group 284). Vent lights are free.
    if (this.lightHeld && this.opts.powerEnabled && !this.blackout.active && !this.maskOn) {
      this.power--;
      if (this.power <= 0) {
        this.power = 0;
        this.lightHeld = this.ventLightL = this.ventLightR = false;
        this.flag('power-out', 'Flashlight is dead');
      }
    }
    // `new bonnie` is reset on each global one-second event and immediately
    // asserted again if the office light is still held. A released tap thus
    // remains a movement blocker only until the next scheduler boundary.
    if (this.anyOfficeLightHeld && !this.camsUp)
      this.lightLogicalUntil = Math.ceil((this.frame + 1) / C.FPS) * C.FPS;
    // Holding the camera light stuns whoever is in the room being viewed
    // (sourced groups 450-457; `stun time` = 400 frames).
    if (this.camLightOn && this.opts.cameraLightStunFrames > 0)
      this.stunCam(this.cam, this.opts.cameraLightStunFrames);
    // g848-854 are distinct from the direct edge gate above: while the
    // one-second office-light latch remains set, hall occupants have B pinned
    // to 40. Movement therefore stays blocked for 40 more frames after the
    // latch finally clears. W. Chica and Toy Bonnie have no such group.
    if (this.lightStallOn) {
      for (const u of this.units) {
        if (!u.done && C.HALL_LIGHT_PIN_IDS.has(u.id) &&
            (u.path[u.idx] === 'blindA' || u.path[u.idx] === 'blindB'))
          u.stunUntil = Math.max(u.stunUntil, this.frame + C.HALL_LIGHT_PIN_FRAMES);
      }
    }
    // Legacy diagnostic model only: a 400-frame timer refreshed by looking
    // at a Withered. The sourced look effect is the marker hold in
    // canAdvance, which releases the moment the marker leaves; this knob
    // stays for A/B comparisons against the old trainer behavior.
    if (this.monitor === MON_UP && this.opts.passiveWitheredLookStunFrames > 0) {
      for (const u of this.units) {
        if (C.WITHEREDS.has(u.id) && u.path[u.idx] === this.cam)
          u.stunUntil = this.frame + this.opts.passiveWitheredLookStunFrames;
      }
    }
  }

  stunCam(n, frames = C.STUN_FRAMES) {
    for (const u of this.units) if (u.path[u.idx] === n && !u.done) u.stunUntil = this.frame + frames;
  }

  // Hallway Golden Freddy: he can only take the hall when it is genuinely
  // empty, which in Minus 7 means the windows where Foxy has been evicted.
  tickGoldenHall(f) {
    if (!this.opts.gfEnabled) return;
    // g780 only moves the hallway figure to marker 123. g570 waits for a
    // one-second event there before writing attack code 12; g587-588 then run
    // the shared 40-frame transition. Crossing 100 exposure is not itself the
    // jumpscare.
    if (this.gf.hallInside) {
      if (this.gf.attackAt >= 0) {
        if (f >= this.gf.attackAt)
          this.kill('golden-freddy-hall', 'Hall Golden Freddy completed the marker-123 attack');
      } else if (f % C.FPS === 0) {
        this.gf.attackAt = f + C.INSIDE_ATTACK_FRAMES;
        this.dropEverything = true;
        this.emit('gf-hall-attack');
      }
      return;
    }
    // g779's empty-hall test names exactly the characters whose routes pass
    // through the two off-camera transit markers: `hall stage 1` (120) is
    // blindA and `hall stage 2` (121) is blindB, plus W. Foxy in the hall.
    const inTransit = this.foxy.loc === 'hall' ||
      this.units.some(u => !u.done &&
        (u.path[u.idx] === 'blindA' || u.path[u.idx] === 'blindB'));
    // g875-880 refresh the latch while anyone is in the hall; g881 drains it.
    if (inTransit) this.hallMovementUntil = f + C.HALL_MOVEMENT_FRAMES;
    const hallOccupied = inTransit || f < this.hallMovementUntil;

    // g781: his presence is not a latch. Every one-second event with the hall
    // light off re-rolls it, so holding the light freezes whatever is there.
    if (f % C.FPS === 0 && !this.hallLightOn) {
      const there = this.rng.int(0, C.GF_HALL_ROLL - 1, 1) === 1;
      if (there !== this.gf.inHall) {
        this.gf.inHall = there;
        this.gf.hallExposure = 0;   // g865 zeroes it whenever he is not there
        if (there) this.emit('gf-hall');
      }
    }
    if (!this.gf.inHall) return;
    // g779 also requires the `hall movement` latch to be zero; that latch is
    // not modelled, which can only ever make the engine stricter than source.
    if (this.hallLightOn && !hallOccupied) {
      if (++this.gf.hallExposure > C.GF_HALL_KILL_FRAMES) {
        this.gf.inHall = false;
        this.gf.hallInside = true;
        this.emit('gf-hall-inside');
      }
    }
  }

  // D is held at zero for all of night 1 and until 2 AM on night 2
  // (groups 872-874).
  get foxyDormant() {
    const n = this.opts.night;
    return n === 1 || (n === 2 && this.frame < 2 * C.HOUR_FRAMES);
  }

  tickFoxy(f) {
    if (!this.opts.foxyEnabled) return;
    const fx = this.foxy;
    if (this.foxyDormant) fx.D = 0;

    // D runs all night, not just while Foxy is in the hall: the same variable
    // decides when he *arrives* and when he kills.
    const dTick = ((f + this.blackoutCount) % C.FPS) === 0;
    if (dTick && !this.blackout.active && !this.foxyDormant) fx.D++;

    if (fx.loc === 'parts') {
      // Light still reaches him: it pushes D back down and delays his return.
      if (this.hallLightOn && f % 30 === 0) fx.D = Math.max(0, fx.D - 1);
      return;
    }

    if (this.hallLightOn) {
      fx.exposure++;
      fx.D = 0; // the hall light zeroes it outright while he is standing there
      // While lit at hall stage 1 his B is pinned to 50 (group 855): eviction
      // and his rolls both wait for it to drain after the light comes off.
      fx.pinUntil = f + C.FOXY_HALL_PIN_FRAMES;
    } else if (fx.exposure > C.foxyExposureFrames(this.opts.night) && f >= fx.pinUntil) {
      // Retreat needs both lights off and B = 0 (group 846).
      fx.loc = 'parts'; fx.gotYou = false; fx.exposure = 0; fx.D = 0;
      fx.readyAt = f + this.rng.int(C.FOXY_RETURN_MIN, C.FOXY_RETURN_MAX, C.FOXY_RETURN_MIN);
      this.emit('foxy-leave');
    }
  }

  tickMask() {
    if (!this.maskOn) { this.maskDAccum = 0; return; }
    // Mask time also feeds Foxy's D when nobody is in a vent opening
    const someoneInOpening = this.bb.inOpening || this.units.some(u => u.atOpening);
    if (!this.blackout.active && !someoneInOpening) {
      if (++this.maskDAccum >= C.FPS) { this.maskDAccum = 0; if (!this.foxyDormant) this.foxy.D++; }
    }
    // [SOURCED] BB is on the same counter as Toy Chica and Mangle: g907 adds
    // one to v12 per one-second event while the mask is fully on, g294 forces
    // him back to CAM 10 at v12 >= 5, and g292 is the 10%/s early leave. The
    // counter is a continuous hold, not storage -- g293 zeroes it on every
    // entry into the fully-on state (see setMask/maskAnim). The old cumulative
    // MASK_LEAVE_FRAMES path let separate flicks add up, which the source
    // does not do for any of the three.
    if (this.bb.inOpening && this.maskFullyOn && this.frame % C.FPS === 0) {
      this.bb.maskTicks++;
      if (this.bb.maskTicks >= C.VENT_MASK_TICKS ||
          this.rng.chance(C.VENT_EARLY_LEAVE_CHANCE, false)) this.bbLeave();
    }
  }

  bbLeave() {
    this.bb.inOpening = false; this.bb.stage = 0; this.bb.pending = false;
    this.bb.maskTicks = 0;
    this.emit('vent-bang', { who: 'bb', leaving: true, sample: C.THUD_SAMPLE });
  }

  unitLeave(u, opts = {}) {
    u.atOpening = false; u.inside = false;
    u.idx = opts.idx ?? u.repelIdx ?? 0;
    // Repels write the unit's B: the movement pipeline requires B = 0, so the
    // cooldown is the same counter as the flash stun (and Toy Bonnie's
    // opening timer).
    if (opts.cooldown) u.stunUntil = this.frame + opts.cooldown;
    u.openingSince = -1; u.openingReadyAt = -1; u.openingTicks = 0;
    u.officeCue = false; u.maskExposureTicks = 0; u.raiseSeen = false;
    u.insideArmed = false;
    // Do not clear insideDangerAt: `danger 2` is global in the source, so a
    // same-tick route return cannot cancel an attack that was already raised.
    if (this.engagedToy === u.id) this.engagedToy = null;
    this.emit('vent-bang', { who: u.id, leaving: true, sample: C.THUD_SAMPLE });
  }

  onCamsUp() {
    this.camsUpCount++;
    // BB steps into the opening the moment the cams come up if he was waiting.
    // [SOURCED] g417 is his only monitor-gated edge and it consumes a latched
    // A = 2, so cameras down defer the hop instead of cancelling it.
    if (this.bb.pending && this.bb.stage === C.BB_STAGES - 1) {
      this.bb.pending = false; this.bbEnterOpening(); return;
    }
    // and walks in if he is already sitting in the opening. He does not kill:
    // g96 forces `lit?` to zero every frame while he is at 123, g301/303 stop
    // the vent lights answering, and no group ever moves him back out. Foxy
    // finishes the job, which is what actually ends the run.
    if (this.bb.inOpening && this.bb.openingAtCamsUp !== this.camsUpCount) {
      this.bb.inside = true;
      this.bb.inOpening = false;
      this.lightHeld = this.ventLightL = this.ventLightR = false;
      this.flag('bb-inside', 'Balloon Boy walked in — the flashlight is gone for the rest of the night');
      this.emit('bb-inside');
    }
  }

  // One route hop along CAM 10 -> 07 -> 03 -> 01 -> 05 (g413-416). The first
  // hop is silent in the source; the next three play his vocal bank, which is
  // the "laugh" a player counts. Reaching CAM 05 is the vent-camera cue.
  bbHop() {
    this.bb.stage++;
    if (this.bb.stage > C.BB_SILENT_HOPS)
      this.emit('laugh', { samples: C.BB_VOCAL_SAMPLES });
    if (this.bb.stage === C.BB_STAGES - 1) {
      this.emit('vent-bang', {
        who: 'bb', leaving: false, cam: true, sample: C.THUD_SAMPLE });
    }
  }

  bbEnterOpening() {
    this.bb.stage = C.BB_STAGES; this.bb.inOpening = true;
    this.bb.openingAtCamsUp = this.camsUpCount;
    // g417 plays only the movement sample every hop shares -- no laugh here,
    // but g607 adds sample 21 once on arrival, so this edge is a pair.
    this.emit('vent-bang', {
      who: 'bb', leaving: false, sample: C.THUD_SAMPLE,
      arrival: C.BB_ARRIVAL_SAMPLE });
  }

  // Sourced hop gates: a unit whose movement roll has passed still waits at
  // its room until every gate on the next hop is open (mirrors the state-2
  // transition groups, which retry continuously until their conditions hold).
  canAdvance(u, f) {
    if (f < u.stunUntil) return false;
    // Android Office groups 344-348 and 357 (post-XOR decode): the
    // selected-camera marker holds a Withered's pending roll while it
    // overlaps their room, with NO monitor condition — and lowering the
    // monitor leaves the marker parked on the last-selected camera (group
    // 262 zeroes `viewing` but never moves `your view`), so the Withered
    // hold persists monitor-down. Mangle's marker gate (357) applies only
    // while the monitor is up; her monitor-down block is the office hall
    // light (358), modeled by the lightStall path below.
    if (this.opts.selectedCameraGate &&
        C.SELECTED_CAMERA_GATED.has(u.id) && u.path[u.idx] === this.cam &&
        (C.WITHEREDS.has(u.id) || this.camsUp))
      return false;
    const next = u.path[u.idx + 1];
    const entry = next === 'ventL' || next === 'ventR' || next === 'office';
    if (entry) {
      if (u.entryGate === 'camsUp' && !this.camsUp) return false;
      // Toy Bonnie's vent hop (group 428) also needs the right vent light off
      // — holding it stalls his entry (the Shooter25 stall).
      if (u.entryGate === 'camsDown' && (this.camsUp || this.ventLightROn)) return false;
      if (u.mutex && this.engagedToy && this.engagedToy !== u.id) return false;
    } else if (u.lightStallAt.includes(u.idx) && !this.camsUp && this.lightStallOn) {
      return false; // only source edges guarded by `new bonnie = 0`
    }
    return true;
  }

  tickUnits(f) {
    if (!this.opts.stalledEnabled) return;
    for (const u of this.units) {
      if (u.done) continue;
      // Stage 2 first: a committed attack runs out its animation and kills.
      if (u.committedAt >= 0) {
        if (f >= u.committedAt) {
          this.kill('inside-office',
            `${u.name} completed the sourced ${C.INSIDE_ATTACK_FRAMES}-frame ` +
            'marker-123 attack');
          return;
        }
        continue;
      }
      // g533: `got you stage` == 1 AND `mask` == 2 -> stage 0. The reaction
      // window is cancelled outright by getting the mask FULLY on -- not merely
      // pressed, since g9 sets mask = 2 only after the 12-frame put-on
      // animation, which is what `maskFullyOn` means here.
      //
      // Added 2026-08-26. Its absence is why every withered that reached the
      // office was fatal: the countdown existed, the kill existed, and the one
      // documented escape did not.
      if (u.insideDangerAt >= 0 && this.maskFullyOn) {
        u.insideDangerAt = -1;
        this.emit('inside-cancelled', { who: u.id, why: 'mask fully on inside `time left`' });
        continue;
      }
      // g532: `time left` <= 0 -> stage 2.
      if (u.insideDangerAt >= 0 && f >= u.insideDangerAt) {
        this.commitAttack(u, `the mask was not fully on within night ` +
          `${this.opts.night}'s ${C.timeAllowedFrames(this.opts.night)}-frame window`);
        continue;
      }
      if (u.inside) {
        if (u.id === 'mangle') {
          if (this.camsUp && f % C.FPS === 0 &&
              this.rng.chance(C.MANGLE_INSIDE_ARM_CHANCE, true))
            u.insideArmed = true;
          if (!this.camsUp && u.insideArmed)
            this.commitAttack(u, 'Mangle armed while the cameras were up');
        } else if (u.id === 'toybonnie') {
          // In addition to the shared monitor-lowering trigger, Toy Bonnie at
          // marker 123 raises danger every ten seconds spent cameras-up
          // (group 722).
          if (this.camsUp && f % (C.FPS * 10) === 0)
            this.commitAttack(u, 'Toy Bonnie remained inside with cameras up');
        } else if (u.openingRule === 'streak' && this.maskFullyOn && f % C.FPS === 0) {
          // Groups 556-559 precede the 10% return groups 747-750. Preserve
          // that order: a simultaneous attack roll is not cancelled by leave.
          // g556-559 set `being attacked by` outright: this is stage 2, not a
          // new reaction window. Masking is what EXPOSES you to this roll, so
          // it cannot also be the escape from it.
          if (this.rng.chance(C.INSIDE_MASK_ATTACK_CHANCE, true))
            this.commitAttack(u, 'inside-office mask attack roll');
          // A marker-123 leave returns to the route start with B = 500
          // (groups 747-750).
          if (this.rng.chance(C.INSIDE_MASK_LEAVE_CHANCE, false))
            this.unitLeave(u, { idx: 0, cooldown: C.INSIDE_LEAVE_COOLDOWN });
        }
        continue;
      }
      if (u.pending && this.canAdvance(u, f)) { u.pending = false; this.advance(u); }
      // Toys and W. Freddy start the shared office sequence as soon as marker
      // 122 is evaluated with the cameras down (groups 445-447 and 490).
      if (u.atOpening && u.openingRule === 'streak' && !this.camsUp && !u.officeCue)
        this.startOfficeEncounter(u);

      // Toy Bonnie creates his separate visible overlay on a 500 ms / 50% roll
      // while the Freddy mask is fully on (groups 436 and 443).
      if (u.id === 'toybonnie' && u.atOpening && this.maskFullyOn && !u.officeCue &&
          !this.blackout.active && f % C.TOY_BONNIE_CUE_FRAMES === 0 &&
          this.rng.chance(C.TOY_BONNIE_CUE_CHANCE, false)) {
        this.startOfficeEncounter(u);
      }

      // Toy Chica and Mangle have no generic immediate repel. With the mask
      // fully on they get a 10% leave roll per one-second event and are forced
      // out after five continuous mask ticks (groups 292-294, 400-401, 907).
      if ((u.id === 'toychica' || u.id === 'mangle') && u.atOpening &&
          this.maskFullyOn && f % C.FPS === 0) {
        u.maskExposureTicks++;
        if (u.maskExposureTicks >= 5 || this.rng.chance(C.VENT_EARLY_LEAVE_CHANCE, false)) {
          this.unitLeave(u);
          continue;
        }
      }
      // g903 zeroes Toy Chica's v8 on arrival; g904 increments it on every
      // global one-second event at marker 122. g905 needs v8 > 5 and cameras
      // up, so this is six scheduler ticks, not a fixed five-second delay.
      if (u.id === 'toychica' && u.atOpening && f % C.FPS === 0)
        u.openingTicks++;
      const streakKill = u.atOpening && u.openingRule === 'streak' && this.camsUpSince >= 0 &&
        f - this.camsUpSince >= C.entryStreakFrames(this.opts.night);
      const armedKill = u.atOpening && u.openingRule === 'mask' && this.camsUp &&
        (u.id === 'toybonnie'
          ? f >= u.stunUntil
          : u.openingTicks >= C.TOY_CHICA_OPENING_TICKS);
      if (streakKill || armedKill) {
        const why = streakKill
          ? `cams stayed up ${((f - this.camsUpSince) / C.FPS).toFixed(1)}s with someone at the opening`
          : 'their sourced opening timer armed before the next cams-up trip';
        this.unitEnterInside(u, why);
      }
    }
  }

  advance(u) {
    u.idx++;
    const node = u.path[u.idx];
    if (node === 'office' || node === 'ventL' || node === 'ventR') {
      u.atOpening = true; u.openingSince = this.frame; u.openingTicks = 0;
      // Toy Bonnie's opening timer IS his B counter (group 428 writes
      // B = 1000-100*night on arrival; g546 needs B = 0 plus a monitor
      // raise), so it shares the flash-stun/repel-cooldown field.
      if (u.id === 'toybonnie')
        u.stunUntil = this.frame + C.toyBonnieOpeningFrames(this.opts.night);
      if (u.mutex) this.engagedToy = u.id;
      this.emit('vent-bang', { who: u.id, leaving: false, sample: C.THUD_SAMPLE });
      this.flag('broke-loose', `${u.name} reached office threshold marker 122`);
      if (u.openingRule === 'streak' && !this.camsUp) this.startOfficeEncounter(u);
    } else {
      this.flag('broke-loose', `${u.name} moved to CAM ${String(node).padStart(2, '0')}`);
    }
  }

  onFiveSecond() {
    // 1. Foxy. The same equation decides his arrival and his kill.
    if (this.opts.foxyEnabled) {
      const fx = this.foxy;
      const eq = () => 21 + this.rng.int(0, 4, 0) - fx.D <= this.ai.foxy;
      if (fx.loc === 'parts') {
        if (this.frame >= fx.readyAt && eq()) {
          fx.loc = 'hall'; fx.exposure = 0;
          this.emit('foxy-arrive');
        }
      } else if (!fx.gotYou && this.frame >= fx.pinUntil && eq()) {
        fx.gotYou = true;
        this.emit('foxy-lock');
        this.flag('foxy-lock', `Foxy locked on with D = ${fx.D}`);
      }
    }
    // 2. the seven
    if (this.opts.stalledEnabled) {
      for (const u of this.units) {
        if (u.done || u.atOpening) continue;
        if (this.rng.chance(C.MO_CHANCE(this.ai[u.id]), true)) {
          // A successful roll enters the source's retrying transition state.
          // Stun is only one of the reasons that transition may be closed:
          // monitor polarity, the office-light stall and the one-toy mutex are
          // equally load-bearing. Keep the move pending until every gate opens.
          if (this.canAdvance(u, this.frame)) this.advance(u);
          else u.pending = true;
        }
      }
    }
    // 3. Balloon Boy. His roll (g342) carries no monitor, camera or light
    // condition, and his look-hold row (g359) has no exclusion, so every route
    // hop resolves on the spot. Only the hop into the opening (g417) waits for
    // the monitor: that roll latches until the next raise completes.
    if (this.opts.bbEnabled && !this.bb.inOpening) {
      if (this.rng.chance(C.MO_CHANCE(this.ai.bb), true)) {
        if (this.bb.stage === C.BB_STAGES - 1) {
          if (this.monitor === MON_UP) this.bbEnterOpening();
          else this.bb.pending = true;
        } else {
          this.bbHop();
        }
      }
    }
    // 4. Golden Freddy
    if (this.opts.gfEnabled && !this.gf.present && !this.maskOn) {
      // g336 needs the raise *finished* -- `viewing > 0` with the monitor-up
      // animation complete. The old 0.3 s "unfair raise" window was a
      // [CALIBRATED] guess at an Android bug and has no group behind it.
      if (this.monitor === MON_UP && this.rng.chance(C.MO_CHANCE(this.ai.golden), true)) {
        this.gf.present = true;
        this.emit('gf-appear');
      }
    }
  }

  tickBox() {
    if (!this.opts.boxEnabled) return;
    if (this.isWinding) {
      this.box = Math.min(1, this.box + 1 / C.BOX_WIND_FRAMES);
    } else {
      this.box = Math.max(0, this.box - 1 / C.BOX_DRAIN_FRAMES);
    }
    this.tickPuppet();
  }

  // Puppet source order is route actions g404-411, the one-second arm/branch
  // groups g494-497, the office roll g623, and finally the camera B=10 write
  // g774. A successful roll therefore becomes a move on the next frame.
  tickPuppet() {
    const p = this.puppet;
    const f = this.frame;

    if (p.attackAt >= 0) {
      if (f >= p.attackAt)
        this.kill('puppet', 'The Puppet completed the sourced 40-frame marker-123 attack');
      return;
    }

    if (p.pending && !p.atOpening && !p.inside) {
      p.pending = false;
      this.advancePuppet();
    }

    if (f % C.FPS === 0) {
      // g494/g495: three successful one-second rolls while the box is empty.
      // CAM 11 light blocks the viewing=11 branch; every other view rolls.
      if (this.box <= 0 && !p.out && p.stage < C.PUPPET_ESCAPE_STAGES) {
        const protectedByLight = this.camLightOn && this.cam === C.BOX_CAM;
        if (!protectedByLight && this.rng.chance(C.PUPPET_MO_CHANCE(this.ai.puppet), true)) {
          p.stage++;
          this.emit('puppet-stage', p.stage);
          if (p.stage >= C.PUPPET_ESCAPE_STAGES) {
            p.out = true;
            this.emit('puppet-out');
          }
        }
      }

      // g496: after escape, each one-second AI success arms one route hop,
      // provided B has drained to zero.
      if (p.out && !p.atOpening && !p.inside && f >= p.stunUntil &&
          this.rng.chance(C.PUPPET_MO_CHANCE(this.ai.puppet), true))
        p.pending = true;

      // g497 rewrites the next 07 branch choice every second.
      p.pathChoice = this.rng.int(1, 2, 1) === 1 ? 'left' : 'right';

      // g623: marker 122 is not lethal on arrival. It rolls 1-in-10 each
      // second to move to 123; g574 then raises attack code 9 and forcedown.
      if (p.atOpening && this.rng.int(0, C.PUPPET_OFFICE_ROLL - 1, 1) === 1) {
        p.atOpening = false;
        p.inside = true;
        p.loc = 'inside';
        p.attackAt = f + C.INSIDE_ATTACK_FRAMES;
        this.dropEverything = true;
        this.emit('puppet-attack', { at: 123 });
      }
    }

    // g774 executes after the movement roll. Outside CAM 11, lighting the
    // Puppet's current camera rewrites B to 10 every frame; g372 drains it.
    if (this.camLightOn && p.out && !p.atOpening && !p.inside &&
        p.loc !== C.BOX_CAM && p.loc === this.cam)
      p.stunUntil = f + C.PUPPET_CAMERA_PIN_FRAMES;
  }

  advancePuppet() {
    const p = this.puppet;
    if (p.loc === 11) p.loc = 10;
    else if (p.loc === 10) p.loc = 7;
    else if (p.loc === 7) {
      p.route = C.PUPPET_ROUTE[p.pathChoice];
      p.loc = p.pathChoice === 'left' ? 3 : 4;
    } else if (p.loc === 3) p.loc = 1;
    else if (p.loc === 4) p.loc = 2;
    else if (p.loc === 1 || p.loc === 2) {
      p.loc = 'opening';
      p.atOpening = true;
    }
    p.idx++;
    this.emit('puppet-move', { at: p.atOpening ? 'office' : p.loc });
  }

  record() {
    const r = this.rec, i = r.n++;
    let occ = 0;
    for (let k = 0; k < 3; k++) {
      const camId = C.TARGET_CAMS[k];
      let best = 0, here = false;
      for (const u of this.units) {
        if (u.done || u.path[u.idx] !== camId) continue;
        here = true;
        if (u.stunUntil > this.frame) best = Math.max(best, u.stunUntil - this.frame);
      }
      r.stun[k][i] = best;
      if (here) occ |= (1 << k);
    }
    r.occ[i] = occ;
    r.d[i] = Math.min(255, this.foxy.D);
    r.power[i] = this.power;
    r.box[i] = Math.round(this.box * 255);
    r.flags[i] = (this.maskOn ? 1 : 0) | (this.camsUp ? 2 : 0) | (this.anyOfficeLightHeld ? 4 : 0) |
                 (this.bb.inOpening ? 8 : 0) | (this.gf.present ? 16 : 0) | (this.gf.inHall ? 32 : 0);
  }
}
