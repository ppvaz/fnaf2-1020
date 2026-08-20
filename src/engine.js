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
    this.foxy = { loc: 'parts', D: 0, exposure: 0, gotYou: false,
                  readyAt: this.rng.int(C.FOXY_ENTER_MIN, C.FOXY_ENTER_MAX, C.FOXY_ENTER_MIN) };
    this.maskDAccum = 0;

    // --- Golden Freddy (office) + the separate hallway version
    this.gf = { present: false, inHall: false, hallExposure: 0 };

    // --- Balloon Boy
    this.bb = { stage: 0, pending: false, inOpening: false, openingAtCamsUp: -1 };

    // --- cumulative mask counter (drives vent departures + mask storage)
    this.maskCum = 0;

    // --- blackout
    this.blackout = { active: false, until: 0, by: null, masked: false, deadline: 0 };
    this.blackoutCount = 0;
    this.officeQueue = [];

    // --- the seven
    this.units = C.STALLED.map(u => ({
      ...u, idx: 0, stunUntil: -1, pending: false, atOpening: false,
      openingSince: -1, openingReadyAt: -1, done: false,
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
      if (this.blackout.active) this.blackout.masked = true;
      // Marker 122 is the office threshold, not the inside-office vent state.
      // In the source, a timely mask immediately sends an unarmed threshold
      // attacker away (groups 538-555). Mangle is the exception represented by
      // the park rule; BB and occupants already in 123 use the cumulative mask
      // timer instead.
      for (const u of this.units) {
        if (this.maskRepelsThreshold(u)) this.unitLeave(u);
      }
    } else {
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
      // Blackout animatronics waiting in the office trigger when the cams drop.
      if (this.officeQueue.length && !this.blackout.active) this.startBlackout(this.officeQueue.shift());
    }
  }

  startBlackout(by) {
    this.blackout = { active: true, until: this.frame + C.BLACKOUT_FRAMES, by,
                      masked: this.maskOn, deadline: this.frame + C.maskGraceFrames(this.opts.night) };
    this.blackoutCount++;
    this.emit('blackout', by);
  }

  // ------------------------------------------------------------------- tick
  tick() {
    if (!this.alive || this.won) return;
    const f = ++this.frame;

    if (this.monAnim > 0 && --this.monAnim === 0) {
      if (this.monitor === MON_RAISING) { this.monitor = MON_UP; this.onCamsUp(); }
      else if (this.monitor === MON_LOWERING) this.monitor = MON_DOWN;
    }
    if (this.maskAnim > 0) this.maskAnim--;

    // --- 5-second interval: Foxy's kill check runs before anything else
    if (f % C.MO_FRAMES === 0) this.onFiveSecond();

    // --- 10-second interval: locked-on Foxy strikes if no blackout is covering
    if (f % (C.MO_FRAMES * 2) === 0 && this.foxy.gotYou && !this.blackout.active) {
      this.kill('foxy', 'Foxy had locked on and no blackout covered the 10s interval');
      return;
    }

    // --- blackout resolution
    if (this.blackout.active) {
      if (!this.blackout.masked && this.maskOn) this.blackout.masked = true;
      if (!this.blackout.masked && f > this.blackout.deadline) {
        this.kill('blackout', `${this.blackout.by} got you: mask was not on within 0.75s of the blackout`);
        return;
      }
      if (f >= this.blackout.until) this.blackout = { active: false, until: 0, by: null, masked: false, deadline: 0 };
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
    if (this.anyOfficeLightHeld && this.opts.powerEnabled && !this.blackout.active && !this.maskOn) {
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
    // Holding the camera light stuns whoever is in the room being viewed.
    if (this.camLightOn) this.stunCam(this.cam);
    // Withereds stall from being looked at at all.
    if (this.monitor === MON_UP) {
      for (const u of this.units) {
        if (C.WITHEREDS.has(u.id) && u.path[u.idx] === this.cam) u.stunUntil = this.frame + C.STUN_FRAMES;
      }
    }
  }

  stunCam(n) {
    for (const u of this.units) if (u.path[u.idx] === n && !u.done) u.stunUntil = this.frame + C.STUN_FRAMES;
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

  tickFoxy(f) {
    if (!this.opts.foxyEnabled) return;
    const fx = this.foxy;

    // D runs all night, not just while Foxy is in the hall: the same variable
    // decides when he *arrives* and when he kills.
    const dTick = ((f + this.blackoutCount) % C.FPS) === 0;
    if (dTick && !this.blackout.active) fx.D++;

    if (fx.loc === 'parts') {
      // Light still reaches him: it pushes D back down and delays his return.
      if (this.hallLightOn && f % 30 === 0) fx.D = Math.max(0, fx.D - 1);
      return;
    }

    if (this.hallLightOn) {
      fx.exposure++;
      if (fx.exposure >= C.FOXY_EXPOSURE_TO_RETREAT) {
        fx.loc = 'parts'; fx.gotYou = false; fx.exposure = 0; fx.D = 0;
        fx.readyAt = f + this.rng.int(C.FOXY_RETURN_MIN, C.FOXY_RETURN_MAX, C.FOXY_RETURN_MIN);
        this.emit('foxy-leave');
        return;
      }
      fx.D = 0; // the hall light zeroes it outright while he is standing there
    }
  }

  tickMask() {
    if (!this.maskOn) { this.maskDAccum = 0; return; }
    this.maskCum++;
    // Mask time also feeds Foxy's D when nobody is in a vent opening
    const someoneInOpening = this.bb.inOpening || this.units.some(u => u.atOpening);
    if (!this.blackout.active && !someoneInOpening) {
      if (++this.maskDAccum >= C.FPS) { this.maskDAccum = 0; this.foxy.D++; }
    }
    // 5 cumulative seconds clears every vent animatronic
    if (this.maskCum >= C.MASK_LEAVE_FRAMES) {
      this.clearVents('mask');
      this.maskCum = 0;
    } else if (this.maskCum % C.FPS === 0) {
      // per-cumulative-second early-leave rolls
      if (this.bb.inOpening && this.rng.chance(C.VENT_EARLY_LEAVE_CHANCE, false)) this.bbLeave();
      for (const u of this.units) {
        if (u.atOpening && this.rng.chance(C.VENT_EARLY_LEAVE_CHANCE, false)) this.unitLeave(u);
      }
    }
  }

  clearVents() {
    if (this.bb.inOpening) this.bbLeave();
    for (const u of this.units) if (u.atOpening) this.unitLeave(u);
  }

  bbLeave() {
    this.bb.inOpening = false; this.bb.stage = 0; this.bb.pending = false;
    this.emit('vent-bang', { who: 'bb', leaving: true });
  }

  unitLeave(u) {
    u.atOpening = false; u.idx = 0; u.openingSince = -1; u.openingReadyAt = -1;
    if (this.engagedToy === u.id) this.engagedToy = null;
    this.emit('vent-bang', { who: u.id, leaving: true });
  }

  maskRepelsThreshold(u) {
    if (!this.maskOn || !u.atOpening || u.openingRule === 'park') return false;
    return !(u.openingRule === 'mask' && this.frame >= u.openingReadyAt);
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
    const next = u.path[u.idx + 1];
    const entry = next === 'ventL' || next === 'ventR' || next === 'office';
    if (entry) {
      if (u.entryGate === 'camsUp' && !this.camsUp) return false;
      if (u.entryGate === 'camsDown' && this.camsUp) return false;
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
      if (u.pending && this.canAdvance(u, f)) { u.pending = false; this.advance(u); }
      const streakKill = u.atOpening && u.openingRule === 'streak' && this.camsUpSince >= 0 &&
        f - this.camsUpSince >= C.entryStreakFrames(this.opts.night);
      const armedKill = u.atOpening && u.openingRule === 'mask' && this.camsUp &&
        f >= u.openingReadyAt;
      if (streakKill || armedKill) {
        const why = streakKill
          ? `cams stayed up ${((f - this.camsUpSince) / C.FPS).toFixed(1)}s with someone at the opening`
          : 'their sourced opening timer armed before the next cams-up trip';
        this.kill('vent', `${u.name} walked in: ${why}`);
        return;
      }
    }
  }

  advance(u) {
    u.idx++;
    const node = u.path[u.idx];
    if (node === 'office') {
      u.done = true;
      if (u.mutex) this.engagedToy = u.id;
      this.officeQueue.push(u.name);
      this.flag('broke-loose', `${u.name} reached the office and is queued for a blackout`);
      if (!this.camsUp && !this.blackout.active) this.startBlackout(u.name);
    } else if (node === 'ventL' || node === 'ventR') {
      u.atOpening = true; u.openingSince = this.frame;
      if (u.id === 'withbonnie')
        u.openingReadyAt = this.frame + C.witheredBonnieOpeningFrames(this.opts.night);
      else if (u.id === 'withchica')
        u.openingReadyAt = this.frame + C.WITHERED_CHICA_OPENING_FRAMES;
      if (u.mutex) this.engagedToy = u.id;
      this.emit('vent-bang', { who: u.id, leaving: false });
      this.flag('broke-loose', `${u.name} reached a vent opening`);
      // Groups 538-555 test marker 122 and the mask every event pass. The
      // attacker therefore leaves even if the mask was already down before
      // it arrived; handling this only in setMask() created a false lethal
      // edge on the next monitor raise.
      if (this.maskRepelsThreshold(u)) this.unitLeave(u);
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
      } else if (!fx.gotYou && eq()) {
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
