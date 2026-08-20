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
      record: true,
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
    this.raiseStartedFrame = -999;
    this.cam = C.BOX_CAM;
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

    // --- Foxy
    this.foxy = { loc: 'parts', D: 0, exposure: 0, gotYou: false, pinUntil: -1,
                  readyAt: this.rng.int(C.FOXY_ENTER_MIN, C.FOXY_ENTER_MAX, C.FOXY_ENTER_MIN) };
    this.maskDAccum = 0;

    // --- Golden Freddy (office) + the separate hallway version
    this.gf = { present: false, inHall: false, hallExposure: 0 };

    // --- Balloon Boy
    this.bb = { stage: 0, pending: false, inOpening: false, openingAtCamsUp: -1 };

    // --- cumulative mask counter (drives vent departures + mask storage)
    this.maskCum = 0;

    // --- blackout
    this.blackout = { active: false, until: 0, by: null, unitId: null, masked: false, deadline: 0 };
    this.blackoutCount = 0;

    // --- the seven
    this.units = C.STALLED.map(u => ({
      ...u, idx: 0, stunUntil: -1, pending: false, atOpening: false,
      openingSince: -1, openingReadyAt: -1, officeCue: false,
      maskExposureTicks: 0, raiseSeen: false, inside: false,
      insideArmed: false, insideDangerAt: -1, done: false,
    }));
    // sourced `chicalookatyou` lock: one mutex-flagged attacker engages at a time
    this.engagedToy = null;

    // --- puppet
    this.puppet = { stage: 0, out: false, killAt: -1 };

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
  get t() { return this.frame / C.FPS; }
  get camsUp() { return this.monitor === MON_UP; }
  get maskFullyOn() { return this.maskOn && this.maskAnim === 0; }
  get hallView() { return this.monitor !== MON_UP; }
  // `white button` follows the physical hold. `new bonnie`, the office-light
  // movement latch, survives release until the next one-second scheduler tick.
  get lightLogical() { return this.lightHeld; }
  get lightStallOn() { return this.frame < this.lightLogicalUntil; }
  get anyOfficeLightHeld() { return this.lightHeld || this.ventLightL || this.ventLightR; }
  get hallLightOn() { return this.lightHeld && this.hallView; }
  get camLightOn() { return this.lightHeld && this.monitor === MON_UP; }
  get bars() { return Math.max(0, Math.min(4, Math.floor((this.power - C.POWER_PER_BAR) / C.POWER_PER_BAR))); }
  get storedMask() { return this.maskCum % C.MASK_LEAVE_FRAMES; }
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
          this.armInsideAttack(u, 'mask was removed with an attacker inside the office');
      }
      // Whole seconds of mask time are spent; the sub-second remainder is what
      // gets "stored" for the next vent attack.
      this.maskCum = this.maskCum % C.FPS;
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
      this.raiseStartedFrame = this.frame;
      this.camsUpSince = this.frame; // the source counter runs from the tap
      // Android: starting the raise just before a 5s interval hands Golden
      // Freddy a free kill.
      if (this.opts.android) {
        const toInterval = C.MO_FRAMES - (this.frame % C.MO_FRAMES);
        if (toInterval <= C.GF_UNFAIR_WINDOW) this.flag('android-gf', `Monitor raised ${(toInterval / C.FPS).toFixed(2)}s before a 5s interval`);
      }
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
          if (u.insideArmed) this.armInsideAttack(u, 'Mangle armed while the cameras were up');
        } else {
          this.armInsideAttack(u, 'lowered the monitor with an attacker inside the office');
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
    if (this.engagedToy === u.id) this.engagedToy = null;
    this.emit('office-entry', { who: u.id, why });
    this.flag('inside-office', `${u.name} reached marker 123: ${why}`);
  }

  // Worst luck for the player is the shortest immunity, so the roll pins to 0.
  repelCooldown() {
    return Math.floor(this.rng.int(0, C.REPEL_COOLDOWN_ROLL - 1, 0) / this.opts.night);
  }

  armInsideAttack(u, why) {
    if (u.insideDangerAt >= 0) return;
    u.insideDangerAt = this.frame + C.INSIDE_ATTACK_FRAMES;
    this.emit('inside-armed', { who: u.id, why });
  }

  // ------------------------------------------------------------------- tick
  tick() {
    if (!this.alive || this.won) return;
    const f = ++this.frame;

    if (this.monAnim > 0 && --this.monAnim === 0) {
      if (this.monitor === MON_RAISING) {
        this.monitor = MON_UP;
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
    }

    // --- 5-second interval: Foxy's kill check runs before anything else
    if (f % C.MO_FRAMES === 0) this.onFiveSecond();

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
          const u = this.units.find(x => x.id === ended.unitId);
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
    this.tickBB();
    this.tickBox();
    if (this.opts.record) this.record();

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
    if (n === C.BOX_CAM) this.puppet.lightHeldThisSecond = true;
  }

  // Hallway Golden Freddy: he can only take the hall when it is genuinely
  // empty, which in Minus 7 means the windows where Foxy has been evicted.
  tickGoldenHall(f) {
    if (!this.opts.gfEnabled) return;
    const hallOccupied = this.foxy.loc === 'hall' ||
      this.units.some(u => !u.done && u.path[u.idx] === 7);
    if (!this.gf.inHall) {
      if (f % C.FPS === 0 && !hallOccupied && this.rng.int(0, C.GF_HALL_ROLL - 1, 1) === 1) {
        this.gf.inHall = true; this.gf.hallExposure = 0;
        this.emit('gf-hall');
      }
      return;
    }
    if (hallOccupied) { this.gf.inHall = false; return; }
    if (this.hallLightOn) {
      if (++this.gf.hallExposure >= C.GF_HALL_KILL_FRAMES) {
        this.kill('golden-freddy-hall', 'Held the light on Golden Freddy in the hallway for 100 frames');
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
    this.maskCum++;
    // Mask time also feeds Foxy's D when nobody is in a vent opening
    const someoneInOpening = this.bb.inOpening || this.units.some(u => u.atOpening);
    if (!this.blackout.active && !someoneInOpening) {
      if (++this.maskDAccum >= C.FPS) { this.maskDAccum = 0; if (!this.foxyDormant) this.foxy.D++; }
    }
    // The retained cumulative-mask mechanic applies to BB. Android's seven
    // marker-122 attackers have distinct endgame branches handled in
    // tickUnits(): office sequence, Toy Bonnie overlay, Toy Chica mask ticks,
    // or Mangle's monitor-raise branch.
    if (this.maskCum >= C.MASK_LEAVE_FRAMES) {
      this.clearVents('mask');
      this.maskCum = 0;
    } else if (this.maskCum % C.FPS === 0) {
      if (this.bb.inOpening && this.rng.chance(C.VENT_EARLY_LEAVE_CHANCE, false)) this.bbLeave();
    }
  }

  clearVents() {
    if (this.bb.inOpening) this.bbLeave();
  }

  bbLeave() {
    this.bb.inOpening = false; this.bb.stage = 0; this.bb.pending = false;
    this.emit('vent-bang', { who: 'bb', leaving: true });
  }

  unitLeave(u, opts = {}) {
    u.atOpening = false; u.inside = false;
    u.idx = opts.idx ?? u.repelIdx ?? 0;
    // Repels write the unit's B: the movement pipeline requires B = 0, so the
    // cooldown is the same counter as the flash stun (and Toy Bonnie's
    // opening timer).
    if (opts.cooldown) u.stunUntil = this.frame + opts.cooldown;
    u.openingSince = -1; u.openingReadyAt = -1;
    u.officeCue = false; u.maskExposureTicks = 0; u.raiseSeen = false;
    u.insideArmed = false;
    // Do not clear insideDangerAt: `danger 2` is global in the source, so a
    // same-tick route return cannot cancel an attack that was already raised.
    if (this.engagedToy === u.id) this.engagedToy = null;
    this.emit('vent-bang', { who: u.id, leaving: true });
  }

  onCamsUp() {
    this.camsUpCount++;
    // BB steps into the opening the moment the cams come up if he was waiting
    if (this.bb.pending && this.bb.stage === 3) { this.bb.pending = false; this.bbEnterOpening(); return; }
    // and walks in if he is already sitting in the opening
    if (this.bb.inOpening && this.bb.openingAtCamsUp !== this.camsUpCount) {
      this.kill('balloon-boy', 'Balloon Boy walked in — the flashlight is gone');
    }
  }

  bbEnterOpening() {
    this.bb.stage = 4; this.bb.inOpening = true; this.bb.openingAtCamsUp = this.camsUpCount;
    this.emit('laugh');
    this.emit('vent-bang', { who: 'bb', leaving: false });
  }

  tickBB() {
    if (!this.opts.bbEnabled) return;
    // BB's source transitions through the right-side blind marker also require
    // the office-light latch to be zero. Preserve his successful movement roll
    // while the latch is closed, just as the regular units preserve state 2.
    if (this.bb.pending && this.bb.stage < 3 && !this.lightStallOn) {
      this.bb.pending = false;
      this.bb.stage++;
      this.emit('laugh');
      if (this.bb.stage === 3) this.emit('vent-bang', { who: 'bb', leaving: false, cam: true });
    }
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
      if (u.entryGate === 'camsDown' && (this.camsUp || this.ventLightR)) return false;
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
      if (u.insideDangerAt >= 0 && f >= u.insideDangerAt) {
        this.kill('inside-office', `${u.name} completed the sourced 40-frame marker-123 attack`);
        return;
      }
      if (u.inside) {
        if (u.id === 'mangle') {
          if (this.camsUp && f % C.FPS === 0 &&
              this.rng.chance(C.MANGLE_INSIDE_ARM_CHANCE, true))
            u.insideArmed = true;
          if (!this.camsUp && u.insideArmed)
            this.armInsideAttack(u, 'Mangle armed while the cameras were up');
        } else if (u.id === 'toybonnie') {
          // In addition to the shared monitor-lowering trigger, Toy Bonnie at
          // marker 123 raises danger every ten seconds spent cameras-up
          // (group 722).
          if (this.camsUp && f % (C.FPS * 10) === 0)
            this.armInsideAttack(u, 'Toy Bonnie remained inside with cameras up');
        } else if (u.openingRule === 'streak' && this.maskFullyOn && f % C.FPS === 0) {
          // Groups 556-559 precede the 10% return groups 747-750. Preserve
          // that order: a simultaneous attack roll is not cancelled by leave.
          if (this.rng.chance(C.INSIDE_MASK_ATTACK_CHANCE, true))
            this.armInsideAttack(u, 'inside-office mask attack roll');
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
      const streakKill = u.atOpening && u.openingRule === 'streak' && this.camsUpSince >= 0 &&
        f - this.camsUpSince >= C.entryStreakFrames(this.opts.night);
      const armedKill = u.atOpening && u.openingRule === 'mask' && this.camsUp &&
        f >= (u.id === 'toybonnie' ? u.stunUntil : u.openingReadyAt);
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
      u.atOpening = true; u.openingSince = this.frame;
      // Toy Bonnie's opening timer IS his B counter (group 428 writes
      // B = 1000-100*night on arrival; g546 needs B = 0 plus a monitor
      // raise), so it shares the flash-stun/repel-cooldown field.
      if (u.id === 'toybonnie')
        u.stunUntil = this.frame + C.toyBonnieOpeningFrames(this.opts.night);
      else if (u.id === 'toychica')
        u.openingReadyAt = this.frame + C.TOY_CHICA_OPENING_FRAMES;
      if (u.mutex) this.engagedToy = u.id;
      this.emit('vent-bang', { who: u.id, leaving: false });
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
      const eq = () => 21 + this.rng.int(0, 4, 0) - fx.D <= C.FOXY_AI;
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
        if (this.rng.chance(C.MO_CHANCE(C.STALLED_AI), true)) {
          // A successful roll enters the source's retrying transition state.
          // Stun is only one of the reasons that transition may be closed:
          // monitor polarity, the office-light stall and the one-toy mutex are
          // equally load-bearing. Keep the move pending until every gate opens.
          if (this.canAdvance(u, this.frame)) this.advance(u);
          else u.pending = true;
        }
      }
    }
    // 3. Balloon Boy
    if (this.opts.bbEnabled && !this.bb.inOpening) {
      if (this.rng.chance(C.BB_MOVE_CHANCE, true)) {
        if (this.bb.stage === 3) {
          if (this.monitor === MON_UP) this.bbEnterOpening();
          else this.bb.pending = true;
        } else if (!this.camsUp && this.lightStallOn) {
          this.bb.pending = true;
        } else {
          this.bb.stage++;
          this.emit('laugh');
          if (this.bb.stage === 3) this.emit('vent-bang', { who: 'bb', leaving: false, cam: true });
        }
      }
    }
    // 4. Golden Freddy
    if (this.opts.gfEnabled && !this.gf.present && !this.maskOn) {
      const raising = this.monitor === MON_RAISING;
      const androidUnfair = this.opts.android && raising &&
        (this.frame - this.raiseStartedFrame) <= C.GF_UNFAIR_WINDOW;
      if ((this.monitor === MON_UP || androidUnfair) && this.rng.chance(C.GF_SPAWN_CHANCE, true)) {
        this.gf.present = true;
        this.emit('gf-appear', { unfair: androidUnfair });
      }
    }
    // 5. Puppet, once the box is dry
    if (this.opts.boxEnabled && this.box <= 0 && !this.puppet.out) this.tickPuppetInterval();
  }

  tickPuppetInterval() {
    // Puppet actually rolls every 1s while the box is empty; handled in tickBox.
  }

  tickBox() {
    if (!this.opts.boxEnabled) return;
    if (this.isWinding) {
      this.box = Math.min(1, this.box + 1 / C.BOX_WIND_FRAMES);
    } else {
      this.box = Math.max(0, this.box - 1 / C.BOX_DRAIN_FRAMES);
    }
    if (this.frame % C.FPS === 0) {
      if (this.box <= 0 && !this.puppet.out) {
        const protectedByLight = this.camLightOn && this.cam === C.BOX_CAM;
        if (!protectedByLight && this.rng.chance(C.MO_CHANCE(C.PUPPET_AI), true)) {
          this.puppet.stage++;
          this.emit('puppet-stage', this.puppet.stage);
          if (this.puppet.stage >= C.PUPPET_STAGES) {
            this.puppet.out = true;
            this.puppet.killAt = this.frame + this.rng.int(C.FPS * 5, C.FPS * 20, C.FPS * 5);
            this.emit('puppet-out');
          }
        }
      }
    }
    if (this.puppet.out && this.frame >= this.puppet.killAt) this.kill('puppet', 'The Puppet reached the office');
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
