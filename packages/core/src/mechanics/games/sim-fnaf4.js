// ---------------------------------------------------------------------------
// FNaF 4, simulated at 60 Hz -- **INCOMPLETE. Do not census this.**
//
// The night model, the roll schedule, Freddy's meter, the `follow` walk map
// and its durations are all traced and are used by `fnaf4.js`. This file is
// the step function built on them, and it is not yet faithful enough to
// report a survival rate from. Two of its own controls say so:
//
//   - `do-nothing` clears every night. Every `gameover = 1` group in the
//     frame is **player-triggered** -- flashing a hall (g345/g346), turning
//     away from the bed (g375/g376), being at the bed with the meter at 60
//     (g427/g428), Foxy resolving (g101-g103) -- so a player who never leaves
//     the middle of the room is never in a state that can kill. That is
//     plainly wrong about the real game, which means a mechanic that forces
//     the player out of the hub is missing. `force turn` (g589-g591, g595) is
//     modelled at the bed only; whatever drives it elsewhere is not found.
//   - Foxy kills unconditionally on the nights his dial is high, because his
//     closet chain here is a guess rather than a trace.
//
// **The hub is a facing, and that is now traced (2026-09-20).** `follow`'s X
// is the player's look direction, written explicitly rather than moved:
// g107 sets it to 512, g108 to 788, g105/g109/g110 to 750, and g25 to an
// alterable the drag writes. The auto-advance out of state 0 is selected by
// it -- g30 walks to the left door at **X = 512**, g34 to the right at
// **X = 788** -- and **X = 750 matches neither**, so facing centre is a real
// resting state and the player is not forced to move.
//
// That resolves the mechanism but not the puzzle: it means `do-nothing`
// surviving may be what this frame's logic actually says, since every
// `gameover = 1` group is player-triggered. It contradicts the game strongly
// enough that it should not be claimed either way. **That is the specific
// thing to settle next**, and it is now a narrow question -- what kills a
// player who faces centre and never acts -- rather than "the state machine is
// unmapped".
//
// `UNKNOWN(not-traced)`: what sets `Bonnie`/`Chica` AV7, the bedroom flag
// g375/g376 test (g480/g486 set it while the bed is watched and their AV6
// accumulator is high; AV6's own accumulation is not traced); and Foxy's real
// closet progression.
//
// This is recorded rather than tuned because a model whose controls pass when
// they should fail cannot tell a working route from a dead code path -- the
// shape of mistake register #12. The FNaF 1 and FNaF 3 censuses are reported;
// this one is not.
//
// The four kill paths, all traced 2026-09-20:
//
//   g345/g346  flashing a hall while that character is **near** -- the rule
//              the audio cue exists to prevent
//   g375/g376  turning away from the bed while one of them is in the bedroom
//   g427/g428  Freddy's meter at 60 or more while the player is at the bed
//   g101-g103  Foxy's closet attack resolving
//
// And the trick that makes a no-audio clear possible [SOURCED: g341 teleports
// Bonnie to `left hall near` when the door is shut and his hold counter reads
// 1; g342 pushes him back to the living room when it reads 2]. Closing a door
// *forces* a known state, so a route can replace listening with a hold.
// ---------------------------------------------------------------------------

import { Rng } from '../rng.js';
import { MODEL, CLOCK, ROLLS, FREDDY, FOLLOW, WALK_MS } from './fnaf4.js';
import { applyRows } from './night-model.js';

export const FPS = 60;
export const MS_PER_FRAME = 1000 / FPS;

// Bonnie's chain [SOURCED: g291-g295]. Chica's mirrors it through the kitchen
// [g296-g301]. `near` is the only position from which a flash is lethal.
const LEFT_CHAIN = ['center', 'left', 'farL', 'nearL'];
const RIGHT_CHAIN = ['center', 'right', 'farR', 'nearR'];

class Every {
  constructor(periodMs) { this.period = periodMs; this.acc = 0; this.loaded = false; }
  tick(ms) {
    // See sim-fnaf1.js: the countdown loads on its first reach and returns
    // false that evaluation, so the first fire is one period later.
    if (!this.loaded) { this.loaded = true; this.acc = 0; return false; }
    this.acc += ms;
    if (this.acc >= this.period) { this.acc -= this.period; return true; }
    return false;
  }
}

export class Fnaf4Sim {
  /**
   * @param {object} [options]
   * @param {number} [options.night] 1..6, or 7 for the Nightmare night
   * @param {number} [options.seed]  16-bit RNG seed
   * @param {boolean} [options.plushtrapReward] g596: starts the hour at 2
   * @param {boolean} [options.fastNights]
   */
  constructor({ night = 1, seed = 0, plushtrapReward = false, fastNights = false } = {}) {
    this.night = night;
    this.rng = new Rng(seed);
    this.fastNights = fastNights;

    this.levels = applyRows(MODEL.rows, night, 0, { ...MODEL.initialLevels });
    // Night 2-4 draw a forced-appearance hour at night start [g626-g628].
    if (night >= 2 && night <= 4) {
      this.forceBonnie = 2 + this.rng.int(0, 3);
      this.forceChica = 3 + this.rng.int(0, 2);
    } else { this.forceBonnie = 0; this.forceChica = 0; }

    this.frame = 0;
    // g596: the Plushtrap reward starts the night at 2 AM when Night < 6.
    this.hour = plushtrapReward && night < 6 ? 2 : 0;
    this.over = null;

    this.bonnie = 'center';
    this.chica = 'center';
    this.bonnieHold = 0;        // AV5 stage: 0 open, 1 shut, 2 pushed back
    this.chicaHold = 0;
    this.bonnieFrames = 0;
    this.chicaFrames = 0;
    this.forcedTurn = false;
    this.bedWatch = 0;
    this.foxyStage = 0;         // 0 absent, 1 in closet, 2 primed
    this.foxyGotYou = 0;
    this.freddyMeter = 0;
    this.fredbearTimer = 0;

    // Player state.
    this.follow = FOLLOW.hub;   // 0 = the middle of the room
    this.walkLeft = 0;          // frames of walk still owed
    this.leftDoorShut = 0;
    this.rightDoorShut = 0;
    this.listening = 0;         // 0 none, 1 left, 2 right
    this.flashing = 0;          // 0 none, 1 left hall, 2 right hall
    this.viewingBed = 0;

    this.timers = {
      hour: new Every(fastNights ? CLOCK.fastHourMs : CLOCK.hourMs),
      bonnie: new Every(ROLLS.bonnie.everyMs),
      chica: new Every(ROLLS.chica.everyMs),
      foxy: new Every(ROLLS.foxy.everyMs),
      fredbear: new Every(night === 7 ? ROLLS.fredbear.shadowEveryMs : ROLLS.fredbear.everyMs),
      freddyFill: new Every(FREDDY.fill.everyMs),
      freddyDrain: new Every(FREDDY.drain.everyMs),
      forceTurn: new Every(4000),  // g590/g591
    };
  }

  get atLeftDoor() { return this.follow === FOLLOW.stations.leftDoor; }
  get atRightDoor() { return this.follow === FOLLOW.stations.rightDoor; }
  get atBed() { return this.follow === FOLLOW.stations.bed; }
  get atCloset() { return this.follow === FOLLOW.stations.closet; }
  get walking() { return this.walkLeft > 0; }

  die(cause) { if (!this.over) this.over = cause; }

  /** Begin a walk to `station`, paying the animation cost from the bank. */
  goTo(station) {
    if (this.walking || this.follow === station) return false;
    const names = { [FOLLOW.stations.leftDoor]: 'LeftDoor', [FOLLOW.stations.rightDoor]: 'RightDoor',
                    [FOLLOW.stations.closet]: 'Closet', [FOLLOW.stations.bed]: 'Bed' };
    const here = names[this.follow];
    const there = names[station];
    let ms = 0;
    if (here) ms += WALK_MS[`from${here}`];
    if (there) ms += WALK_MS[`to${there}`];
    if (!here && !there) ms = 0;   // hub to hub costs nothing
    this.walkLeft = Math.round(ms / MS_PER_FRAME);
    this.pendingStation = station;
    // Leaving the bed with either of them in the room is lethal [g375/g376].
    if (this.follow === FOLLOW.stations.bed) {
      if (this.bonnie === 'nearL' && this.bonnieHold === 0) this.die('bonnie-bedroom');
      if (this.chica === 'nearR' && this.chicaHold === 0) this.die('chica-bedroom');
      if (this.foxyGotYou) this.die('foxy-bedroom');
    }
    return true;
  }

  step() {
    if (this.over) return this.over;
    this.frame += 1;
    const ms = MS_PER_FRAME;

    if (this.walkLeft > 0 && --this.walkLeft === 0) this.follow = this.pendingStation;

    // --- the clock [g568-g573]
    if (this.timers.hour.tick(ms)) {
      this.hour += 1;
      if (this.hour === CLOCK.winHour) { this.over = '6AM'; return this.over; }
    }

    // --- Bonnie [g284, g291-g295]
    if (this.timers.bonnie.tick(ms)) {
      const passed = this.rng.int(0, ROLLS.bonnie.bound - 1) + 1 <= (this.levels.bonnie ?? 0);
      const gated = this.listening === 1 || this.leftDoorShut || this.foxyStage === 2;
      if (passed && !gated) this.advance('bonnie');
    }
    if (this.timers.chica.tick(ms)) {
      const passed = this.rng.int(0, ROLLS.chica.bound - 1) + 1 <= (this.levels.chica ?? 0);
      const gated = this.listening === 2 || this.rightDoorShut || this.foxyStage === 2;
      if (passed && !gated) this.advance('chica');
    }

    // --- the forced door [g341/g342]
    //
    // AV5 is a *stage*, not a repeating counter: 1 while the door has just
    // been shut (which teleports them to the hall, g341) and 2 once the hold
    // completes (which pushes them back, g342). Resetting it to 0 at the push
    // makes g341 fire again on the next frame and pins them at the door for
    // as long as it is held -- the exact opposite of what the trick does.
    if (this.leftDoorShut) {
      this.bonnieFrames += 1;
      if (this.bonnieHold === 0) { this.bonnieHold = 1; this.bonnie = 'nearL'; }     // g341
      if (this.bonnieHold === 1 && this.bonnieFrames * MS_PER_FRAME >= 3000) {
        this.bonnieHold = 2; this.bonnie = 'left';                                   // g342
      }
    } else { this.bonnieHold = 0; this.bonnieFrames = 0; }
    if (this.rightDoorShut) {
      this.chicaFrames += 1;
      if (this.chicaHold === 0) { this.chicaHold = 1; this.chica = 'nearR'; }
      if (this.chicaHold === 1 && this.chicaFrames * MS_PER_FRAME >= 3000) {
        this.chicaHold = 2; this.chica = 'right';
      }
    } else { this.chicaHold = 0; this.chicaFrames = 0; }

    // --- the forced turn [g589-g591, g595]
    //
    // Standing still is not an option the game offers. While the player is at
    // the bed and one of them is in the bedroom, g590/g591 raise `force turn`
    // every 4000 ms and g589 turns the player away -- straight into g375/g376,
    // which is the kill. Without this the model lets a player who never acts
    // survive the night, which is how the `do-nothing` control exposed it.
    if (this.atBed && (this.bonnie === 'nearL' || this.chica === 'nearR')
        && this.timers.forceTurn.tick(ms)) {
      this.forcedTurn = true;
    }
    // g595: fifteen seconds of bed-watching puts Foxy in the closet and turns
    // the player away regardless.
    if (this.viewingBed) {
      this.bedWatch += 1;
      if (this.bedWatch * MS_PER_FRAME >= 15000) { this.foxyGotYou = 1; this.forcedTurn = true; }
    } else this.bedWatch = 0;
    if (this.forcedTurn && this.atBed) {
      this.forcedTurn = false;
      this.goTo(FOLLOW.hub);
    }

    // --- the flashlight [g68/g84 push back, g345/g346 kill]
    if (this.flashing === 1 && this.atLeftDoor) {
      if (this.bonnie === 'nearL') this.die('bonnie-flash');            // g345
      else if (this.bonnie === 'farL') this.bonnie = 'center';          // g68/g84
    }
    if (this.flashing === 2 && this.atRightDoor) {
      if (this.chica === 'nearR') this.die('chica-flash');              // g346
      else if (this.chica === 'farR') this.chica = 'center';
    }

    // --- Foxy [g236, g101-g103]
    if (this.timers.foxy.tick(ms)) {
      const passed = this.rng.int(0, ROLLS.foxy.bound - 1) + 1 <= (this.levels.foxy ?? 0);
      if (passed && this.foxyStage < 2) this.foxyStage += 1;
    }
    if (this.foxyStage === 2 && this.atCloset && this.flashing === 0) {
      this.foxyStage = 1;   // holding the closet shut resets him
    }
    if (this.foxyStage === 2 && !this.atCloset) this.foxyGotYou = 1;
    if (this.foxyGotYou && this.atBed) this.die('foxy');

    // --- Freddy's meter [g397-g401, g427/g428]
    if (this.viewingBed) {
      if (this.timers.freddyDrain.tick(ms)) {
        this.freddyMeter = Math.max(FREDDY.floor.value, this.freddyMeter - FREDDY.drain.amount);
      }
    } else if (this.timers.freddyFill.tick(ms)) {
      this.freddyMeter += this.levels.freddy ?? 0;
    }
    if (this.atBed && this.freddyMeter >= FREDDY.killAt) this.die('freddy');

    // --- Fredbear [g286/g287]
    if (this.timers.fredbear.tick(ms)) {
      const passed = this.rng.int(0, ROLLS.fredbear.bound - 1) + 1 <= (this.levels.fredbear ?? 0);
      const away = !this.atCloset && !this.atBed;
      if (passed && away) this.fredbearTimer += 1;
      if (this.fredbearTimer >= 4) this.die('fredbear');
    }

    // Levels escalate on the hour [g581-g599].
    this.levels = applyRows(MODEL.rows, this.night, this.hour, this.levels);
    return this.over;
  }

  advance(who) {
    if (who === 'bonnie') {
      const i = LEFT_CHAIN.indexOf(this.bonnie);
      // g293 only lets him leave the living room while the hall is unlit.
      if (this.bonnie === 'left' && this.flashing === 1) return;
      if (i >= 0 && i < LEFT_CHAIN.length - 1) this.bonnie = LEFT_CHAIN[i + 1];
    } else {
      const i = RIGHT_CHAIN.indexOf(this.chica);
      if (this.chica === 'right' && this.flashing === 2) return;
      if (i >= 0 && i < RIGHT_CHAIN.length - 1) this.chica = RIGHT_CHAIN[i + 1];
    }
  }

  run(policy) {
    const limit = 60 * 60 * 20;
    while (!this.over && this.frame < limit) {
      policy(this);
      this.step();
    }
    return { outcome: this.over ?? 'timeout', frames: this.frame, hour: this.hour,
             bonnie: this.bonnie, chica: this.chica, freddy: this.freddyMeter };
  }
}

export { LEFT_CHAIN, RIGHT_CHAIN };
