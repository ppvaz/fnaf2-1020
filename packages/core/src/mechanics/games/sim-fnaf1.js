// ---------------------------------------------------------------------------
// FNaF 1, simulated at 60 Hz against the event sheet's own group order.
//
// Every rule below cites the group it implements, and the rules run in
// ascending group id -- which is the order the runtime evaluates them in, and
// therefore the order the RNG is consumed in. That ordering is not a detail:
// the seed census is only meaningful if draw order matches, and FNaF 1 takes
// between one and six draws a second depending on what is armed.
//
// `Every N ms` loads its delay on first reach and returns false that time
// [SOURCED: CND_EVERY2.eva2, recorded in plant-model.js's `passEvery`], so the
// first fire is at t = N. All four games share that runtime, so this applies
// here too.
//
// What is modelled: the night clock, the four movement rolls, Bonnie's and
// Chica's position graphs, Freddy's wait-and-step, Foxy's progress chain, the
// two doors, the power economy including the per-night drain, and every way
// the night ends. What is not: the camera-static effect, audio, hallucinations
// and the Golden Freddy poster path, none of which can kill under these rules.
// ---------------------------------------------------------------------------

import { Rng } from '../rng.js';
import { MODEL, ROLLS, POWER, FOXY, CLOCK } from './fnaf1.js';
import { applyRows } from './night-model.js';

export const FPS = 60;
export const MS_PER_FRAME = 1000 / FPS;

// Door alterable 0: 0 is open, 2 is closed [SOURCED: g343 kills through an
// open left door at AV0 = 0, g344 turns Bonnie back at AV0 = 2].
export const DOOR_OPEN = 0;
export const DOOR_SHUT = 2;

// Bonnie's graph [SOURCED: g331-g344], keyed by where he is and his branch
// alterable 0, which g329 redraws as `Random(2) + 1` every 1000 ms.
const BONNIE = {
  cam1A: { 1: 'cam5', 2: 'cam1B' },
  cam5: { 1: 'cam1B', 2: 'cam2A' },
  cam1B: { 1: 'cam5', 2: 'cam2A' },
  cam2A: { 1: 'cam3', 2: 'cam2B' },
  cam2B: { 1: 'cam3', 2: 'door' },
  cam3: { 1: 'door', 2: 'cam2A' },
};

// Chica's graph [SOURCED: g364-g376]. g364 carries no branch condition, so
// her first step off the stage is forced rather than chosen.
const CHICA = {
  cam1A: { 1: 'cam1B', 2: 'cam1B' },
  cam1B: { 1: 'cam7', 2: 'cam6' },
  cam6: { 1: 'cam7', 2: 'cam4A' },
  cam7: { 1: 'cam6', 2: 'cam4A' },
  cam4A: { 1: 'cam1B', 2: 'cam4B' },
  cam4B: { 1: 'cam4A', 2: 'door' },
};

// Freddy's path is a fixed sequence, not a branch [SOURCED: g551-g557].
const FREDDY_PATH = ['cam1A', 'cam1B', 'cam7', 'cam6', 'cam4A', 'cam4B'];

// A timer that loads on first reach, like the engine's.
class Every {
  constructor(periodMs) { this.period = periodMs; this.acc = 0; this.loaded = false; }
  tick(ms) {
    this.acc += ms;
    if (!this.loaded) { if (this.acc >= this.period) { this.acc -= this.period; this.loaded = true; } return false; }
    if (this.acc >= this.period) { this.acc -= this.period; return true; }
    return false;
  }
}

export class Fnaf1Sim {
  /**
   * @param {object} [options]
   * @param {number} [options.night]  1..7
   * @param {number} [options.seed]   16-bit RNG seed
   * @param {object} [options.custom] Night 7 dials, e.g. { freddy: 20, ... }
   * @param {boolean} [options.fastNights] halve the hour, as the cheat does
   */
  constructor({ night = 1, seed = 0, custom = null, fastNights = false } = {}) {
    this.night = night;
    this.rng = new Rng(seed);
    this.fastNights = fastNights;

    // Difficulty at night start [SOURCED: g437-g443]. Night 4's Freddy is the
    // table's one draw: `1 + Random(2)`, taken here because the row is
    // evaluated at frame 0 before anything else can consume the stream.
    this.levels = applyRows(MODEL.rows, night, 0, { ...MODEL.initialLevels });
    for (const [id, value] of Object.entries(this.levels)) {
      if (value && typeof value === 'object' && 'min' in value) {
        this.levels[id] = value.min + this.rng.int(0, value.bound ? value.bound - 1 : 1);
      }
    }
    if (custom) Object.assign(this.levels, custom);

    this.frame = 0;
    this.minute = 0;          // g397/g399
    this.hour = 0;            // g400 wraps, g435 wins
    this.power = POWER.initial;
    this.blackout = false;
    this.blackoutFrames = 0;
    this.over = null;         // null | '6AM' | cause of death

    this.bonnie = 'cam1A';
    this.chica = 'cam1A';
    this.freddyIndex = 0;     // into FREDDY_PATH
    this.freddyState = 0;     // AV12: 0 idle, 1 waiting, 2 ready to step
    this.freddyWait = 0;      // AV13
    this.foxProgress = 0;
    this.foxStage3 = 0;       // charChica AV6 [g450]
    this.foxStage4 = 0;       // charChica AV5 [g447]
    this.foxBangs = 0;        // charChica AV15 [g455]
    this.attention = 0;       // charChica AV12 -- Foxy's camera hold [g445/g460]
    this.branch = { bonnie: 1, chica: 1 };   // AV0 [g329]

    // Player state, driven by the policy.
    this.viewing = 0;         // 0 is the office; >0 is a camera id
    this.leftDoor = DOOR_OPEN;
    this.rightDoor = DOOR_OPEN;
    this.leftLight = 0;
    this.rightLight = 0;

    this.timers = {
      bonnie: new Every(ROLLS.bonnie.everyMs),
      chica: new Every(ROLLS.chica.everyMs),
      freddy: new Every(ROLLS.freddy.everyMs),
      foxy: new Every(ROLLS.foxy.everyMs),
      branch: new Every(1000),              // g329
      minute: new Every(fastNights ? CLOCK.fastTickMs : CLOCK.tickMs),
      power: new Every(POWER.drainMs),      // g315
      attention: new Every(FOXY.attentionTimer.refreshMs),  // g460
      blackoutMusic: new Every(20000),      // the AV6 0 -> 1 hop
      blackoutRoll: new Every(5000),        // g423
      blackoutForce: new Every(20000),      // g424
    };
    // `??` falls through on null, and Night 1's entry *is* null -- it is the
    // one night g477-g480 never match, so it must get no extra drain at all.
    // Reading it with `??` silently gave Night 1 the Night 7 rate and made it
    // the most expensive night in the game.
    const extra = night in POWER.extraDrainMs
      ? POWER.extraDrainMs[night] : POWER.extraDrainMs[7];
    this.timers.extra = extra ? new Every(extra) : null;   // g477-g480

    this.moveWho = 0;
    this.deaths = [];
  }

  get usage() {
    // g313: 1 + camera + both doors + both lights.
    return POWER.usageBase
      + (this.viewing > 0 ? 1 : 0)
      + (this.leftDoor === DOOR_SHUT ? 1 : 0)
      + (this.rightDoor === DOOR_SHUT ? 1 : 0)
      + this.leftLight + this.rightLight;
  }

  /** True while a character stands at the door, which is what a light shows. */
  atLeftDoor() { return this.bonnie === 'door'; }
  atRightDoor() { return this.chica === 'door'; }

  // A death after the lights go out is a power loss, not a defence failure:
  // g419 forces both doors open at blackout, so whoever walks in afterwards
  // is the symptom. Reporting the animatronic would blame the wrong mechanic
  // and send tuning at the wrong knob.
  die(cause) {
    if (this.over) return;
    this.over = this.blackout && cause !== 'blackout' ? `blackout-${cause}` : cause;
    this.deaths.push(this.over);
  }

  step() {
    if (this.over) return this.over;
    this.frame += 1;
    const ms = MS_PER_FRAME;

    // --- g318/g319: Bonnie and Chica roll for a move.
    if (this.timers.bonnie.tick(ms) && this.roll(ROLLS.bonnie.bound, this.levels.bonnie)) {
      this.moveWho = 1;
    }
    if (this.timers.chica.tick(ms) && this.roll(ROLLS.chica.bound, this.levels.chica)) {
      this.moveWho = 2;
    }

    // --- g320: Freddy rolls only with the monitor down.
    if (this.timers.freddy.tick(ms)) {
      // The Random is inside the condition and the timer is the first
      // condition, so the draw happens whether or not `viewing` is 0.
      const passed = this.roll(ROLLS.freddy.bound, this.levels.freddy);
      if (passed && this.viewing === 0 && this.freddyState === 0) this.freddyState = 1;
    }

    // --- g321: Foxy. Same ordering: the timer gates, then the draw, then the
    // three state conditions.
    if (this.timers.foxy.tick(ms)) {
      const passed = this.roll(ROLLS.foxy.bound, this.levels.foxy);
      if (passed && this.viewing !== FOXY.pirateCoveView
          && this.foxProgress < 3 && this.attention === 0) {
        this.foxProgress += 1;
      }
    }

    // --- g329: the branch alterable, redrawn every second for all three.
    if (this.timers.branch.tick(ms)) {
      this.branch.bonnie = this.rng.int(0, 1) + 1;
      this.branch.chica = this.rng.int(0, 1) + 1;
      this.rng.int(0, 1);   // Freddy's, drawn but unused -- his path is fixed
    }

    // --- g331-g344: Bonnie steps.
    if (this.moveWho === 1) {
      this.moveWho = 0;
      if (this.bonnie === 'door') {
        if (this.leftDoor === DOOR_OPEN) this.die('bonnie');     // g343
        else this.bonnie = 'cam1B';                              // g344
      } else {
        const next = BONNIE[this.bonnie]?.[this.branch.bonnie];
        if (next) this.bonnie = next;
      }
    }

    // --- g364-g376: Chica steps.
    if (this.moveWho === 2) {
      this.moveWho = 0;
      if (this.chica === 'door') {
        if (this.rightDoor === DOOR_OPEN) this.die('chica');     // g375
        else this.chica = 'cam4A';                               // g376
      } else {
        const next = CHICA[this.chica]?.[this.branch.chica];
        if (next) this.chica = next;
      }
    }

    // --- g397-g400: the clock.
    if (this.timers.minute.tick(ms)) {
      this.minute += 1;
      if (this.minute >= CLOCK.threshold) {
        this.minute = CLOCK.resetTick;
        this.hour += 1;
        // g470-g472: the hourly escalation, on every night.
        this.levels = applyRows(MODEL.rows, this.night, this.hour, this.levels);
        if (this.hour === CLOCK.winHour) { this.over = '6AM'; return this.over; }
      }
    }

    // --- g445/g460: Foxy's camera-attention hold.
    if (this.viewing > 0 && this.timers.attention.tick(ms)) {
      this.attention = FOXY.attentionTimer.min + this.rng.int(0, FOXY.attentionTimer.bound - 1);
    }
    if (this.attention > 0) this.attention = Math.max(0, this.attention - 1);

    // --- g447-g455: Foxy's chain.
    if (this.foxProgress === 3) {
      this.foxStage3 += 1;
      if (!this.blackout && this.foxStage3 > 1500) { this.foxStage3 = 0; this.foxProgress = 5; }
    } else { this.foxStage3 = 0; }
    if (this.foxProgress === 4) {
      this.foxStage4 += 1;
      if (!this.blackout && this.foxStage4 > 100) { this.foxStage4 = 0; this.foxProgress = 5; }
    } else { this.foxStage4 = 0; }
    if (this.foxProgress === 5) {
      // g452: the run forces the monitor down before it resolves.
      this.viewing = 0;
      if (this.leftDoor === DOOR_OPEN) this.die('foxy');                        // g454
      else {
        // g455: blocked. He resets to Random(2) -- 0 or 1 -- and the block
        // costs 10 + 50 per previous bang.
        this.foxProgress = this.rng.int(0, 1);
        this.power -= 10 + this.foxBangs * 50;
        this.foxBangs += 1;
      }
    }

    // --- g560/g561 then g551-g557: Freddy waits, then steps.
    if (this.freddyState === 1) {
      this.freddyWait += 1;
      const needed = 1000 - this.levels.freddy * 100;
      if (this.freddyWait >= needed && this.viewing === 0) {
        this.freddyWait = 0;
        this.freddyState = 2;
      }
    }
    if (this.freddyState === 2) this.stepFreddy();

    // --- g313-g315 and g477-g480: power.
    if (this.timers.power.tick(ms)) this.power -= this.usage;
    if (this.timers.extra && this.timers.extra.tick(ms)) this.power -= 1;
    if (this.power <= 0 && !this.blackout) {
      this.blackout = true;                                                     // g418
      this.leftDoor = DOOR_OPEN; this.rightDoor = DOOR_OPEN;                    // g419
      this.leftLight = 0; this.rightLight = 0;
      this.viewing = 0;
    }
    if (this.blackout) this.stepBlackout(ms);

    return this.over;
  }

  /** `Random(bound) + 1 <= level`, drawn whether or not the state gates pass. */
  roll(bound, level) {
    const value = this.rng.int(0, bound - 1) + 1;
    return value <= (level ?? 0);
  }

  stepFreddy() {
    const where = FREDDY_PATH[this.freddyIndex];
    // g551: he may not leave the stage while Bonnie or Chica is still on it.
    if (where === 'cam1A' && (this.bonnie === 'cam1A' || this.chica === 'cam1A')) {
      this.freddyState = 0;
      return;
    }
    // g555: the right light being on holds him at 4A.
    if (where === 'cam4A' && this.rightLight) { this.freddyState = 0; return; }
    if (where === 'cam4B') {
      // g556 kills and g557 retreats, and they do NOT carry the same view
      // exclusions. Both need the monitor up and `viewing <> 42`, so watching
      // CAM 4B shuts him out entirely. Only the retreat additionally excludes
      // `viewing <> 4`: watching CAM 4A does not stop him getting in, it stops
      // him being turned back. Reading the two as one rule made CAM 4A look
      // like a second safe park, which it is not.
      if (this.viewing === 0 || this.viewing === 42) return;
      if (this.rightDoor === DOOR_OPEN) { this.die('freddy'); return; }         // g556
      if (this.viewing === 4) return;                                           // g557 excludes 4
      this.freddyIndex = FREDDY_PATH.indexOf('cam4A');                          // g557
      this.freddyState = 0;
      return;
    }
    this.freddyIndex += 1;
    this.freddyState = 0;
  }

  stepBlackout(ms) {
    this.blackoutFrames += 1;
    // The AV6 ladder: music for 20 s, then a 1-in-5 roll every 5 s, with a
    // hard 20 s backstop, then the jumpscare [SOURCED: g423, g424].
    if (this.blackoutFrames * MS_PER_FRAME < 20000) return;
    if (this.timers.blackoutRoll.tick(ms) && this.rng.int(0, 4) + 1 === 1) this.die('blackout');
    if (this.timers.blackoutForce.tick(ms)) this.die('blackout');
  }

  /** Run to the end of the night under `policy`, which is called each frame. */
  run(policy) {
    const limit = 60 * 60 * 20;   // 20 minutes of frames; the night is 8:55
    while (!this.over && this.frame < limit) {
      policy(this);
      this.step();
    }
    return { outcome: this.over ?? 'timeout', frames: this.frame, power: this.power,
             hour: this.hour, foxBangs: this.foxBangs };
  }
}
