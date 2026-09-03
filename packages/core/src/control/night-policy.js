// A sourced, observation-only night policy for the belief-state cycle
// controller (ROADMAP Track A1; Plan 20 P5 names this layer "the sourced route
// model" and deliberately leaves it to the caller).
//
// WHAT THIS IS. `selectCycle` needs somebody to say which reviewed primitive it
// should prefer at this boundary. Until now the only thing saying so was
// `tools/nightloop.mjs`'s declared BASELINE CONTROL -- "wind when the box is
// low, mask on a blackout, otherwise watch" -- which is not a strategy and was
// never claimed to be one. Driven over a full night it dies: measured
// 2026-09-02, Night 1 estimator arm 0/3, `{"inside-office": 3}`.
//
// WHAT IT MAY READ. The controller's reduced belief and its last fact batch.
// Nothing else. There is no engine import here and no privileged read: every
// quantity below is either an observed fact, a self-action the controller
// itself committed, or a prediction the reduced model makes from those two.
// That is the whole point -- a policy that needs a hidden variable is a policy
// the phone cannot run.
//
// ------------------------------------------------------------ the mechanics
//
// Three sourced facts decide the shape of this policy, and none of them is a
// preference:
//
//  1. EVERY WAY INTO THE OFFICE NEEDS THE MONITOR UP, except failing the
//     office-defence fuse. The four mutex holders walk in once the CURRENT
//     continuous cams-up session reaches `entryStreakFrames` (20-2*night
//     seconds); Toy Bonnie walks in on a cams-up frame past his
//     1000-100*night cooldown; Toy Chica walks in on a cams-up frame past six
//     one-second ticks at the opening; Mangle walks in when a monitor RAISE
//     COMPLETES. So monitor-up time is the exposure, and the mask is the only
//     state in which the office is closed.
//
//  2. THE MASK IS THE UNIVERSAL REPEL AT MARKER 122. Five continuous
//     one-second ticks with the mask fully on force Toy Chica, Mangle and
//     Balloon Boy back onto their routes (`VENT_MASK_TICKS`, g292-294/400-401/
//     907); Toy Bonnie rolls his own office overlay while it is on, which
//     resolves as a defended repel; a streak occupant's blackout is defused
//     outright by the mask reaching state 2 before the fuse (g533). Masking is
//     therefore the idle action, not an emergency one.
//
//  3. BUT THE MASK IS NOT FREE, AND ITS PRICE IS FOXY. D advances once a
//     second whatever you are doing, and a SECOND time per second while the
//     mask is on with no vent opening occupied -- so camping in the mask costs
//     Foxy risk at twice the standing rate, and the hall light that resets it
//     does not answer while the mask is on (g75/g84). The nights separate on
//     exactly this: Night 1 has `safeD` = 20 and can camp all night, Night 6
//     after 2 AM has `safeD` = 5 and cannot afford one full camp.
//
// So the policy is a deadline race, not a schedule. Two tasks have deadlines
// the belief can compute -- wind before the box empties, flash before D
// crosses the band -- and the mask is what it does with the time in between,
// but only when the nearer deadline leaves room for the whole camp. That is
// the entire idea, and everything below is bookkeeping for it.
//
// NOT PROMOTED. This is a simulator-facing decision layer. It makes no device
// claim, and a survival number produced with it is a statement about the
// model.
import * as C from '../mechanics/config.js';

export const NIGHT_POLICY_SCHEMA = 'night-policy-v1';

// The reviewed primitives this policy speaks. A library that does not offer
// all of them cannot run it, and `requiredCycles` says so rather than silently
// degrading.
export const MASK = 'mask-now';
export const CAMP = 'defensive-mask';
export const UNMASK = 'unmask';
export const HOLD = 'observe-and-hold';
export const FLASH = 'foxy-hall-reset';
export const RAISE = 'verify-and-resume';
export const LOWER = 'lower-monitor';
// Keep this control-program identifier distinct from mechanics/config's
// numeric BOX_CAM export. The package root re-exports both namespaces.
export const SELECT_BOX_CAM = 'select-box-cam';
export const WIND = 'wind-and-anchor';
export const WIND_SHORT = 'wind-short';
export const STALL = 'vent-stall-right';
export const SWEEP = 'sweep-routes';

export const NIGHT_POLICY_CYCLES = Object.freeze(
  [HOLD, MASK, UNMASK, FLASH, RAISE, LOWER, SELECT_BOX_CAM, WIND, WIND_SHORT,
   STALL, SWEEP]);

// One decision cadence's worth of slack, so a deadline computed at this
// boundary is still met at the next one.
const BOUNDARY = 4;

const fail = (message) => { throw new TypeError(`night policy: ${message}`); };

const observedValue = (facts, name) => {
  const fact = facts?.[name];
  return fact && fact.state === 'OBSERVED' ? fact.value : null;
};

/**
 * A pure decision rule over the controller's own belief.
 *
 * It holds no mutable state of its own on purpose: everything it needs is
 * already in the reduced model, which is built from observed facts and the
 * controller's committed actions. A policy with private bookkeeping can
 * disagree with the controller about what it did -- the belief inversion this
 * repository keeps finding on the phone -- and this one structurally cannot.
 */
export class NightPolicy {
  /** @param {any} options */
  constructor(options = {}) {
    const {
      night = 1, customNight = null,
      // How long the mask must stay on to be worth wearing: the sourced
      // five-tick vent repel plus the put-on animation, plus one boundary so
      // the fifth tick cannot fall outside the window on an unlucky phase.
      campFrames = C.MASK_ANIM_ON + C.FPS * C.VENT_MASK_TICKS + BOUNDARY,
      // The shortest mask worth putting on: it must at least reach the fully-on
      // state and come off again, or it buys one 10% leave roll for nothing.
      minMaskFrames = C.MASK_ANIM_ON + C.MASK_ANIM_OFF + 2 * BOUNDARY,
      // Safety margins on the two deadlines, in frames. They are knobs, and
      // they are named as knobs: nothing sources them.
      //
      // Both are ZERO by default because a margin is the wrong instrument for
      // what they were being used for. Shifting a deadline earlier does not
      // only make the task safer, it makes it MORE FREQUENT, and on the late
      // nights the two recurring tasks are competing for the same seconds: a
      // one-second flash margin is a fifth of the whole sourced flash period
      // and it starves the box. Measured 2026-09-02 over 60 held-out seeds,
      // Night 5 goes from 3-5 to 29-34 of 60 on this knob alone. What the
      // margin was actually protecting against -- idling past a deadline --
      // is `actWithinFrames` below, which does not distort the slack.
      windMarginFrames = 0,
      flashMarginFrames = 0,
      // Act when a deadline is within one idle quantum instead of holding
      // through it. `observe-and-hold` is a full second and, from Night 5 on,
      // a deadline is routinely nearer than that; holding is how a controller
      // misses a deadline it could see coming.
      actWithinFrames = C.s(1),
      // Below this remaining power the hall light is spent rather than saved;
      // a flash that cannot be paid for is not a defence.
      powerFloorFrames = 0,
      // Sweep the sourced route rooms on the way to the box camera. The
      // monitor is already up for the wind, so this costs six frames of
      // battery and no extra cams-up trip.
      sweepOnTrip = true,
      // Top the box up whenever a whole trip fits inside the remaining slack,
      // rather than waiting for the box to become urgent. Waiting is what
      // makes the trip collide with the hall flash on the late nights.
      topUpBelow = 0.98,
      // How often the route stun must be refreshed. The camera flash loads
      // `STUN_FRAMES` = 400 frames against a 5 s movement roll, so a sweep
      // repeated inside that window holds whoever is in a swept room in place
      // indefinitely -- which is how the sourced routine keeps Toy Chica, Toy
      // Bonnie and the Withereds off the openings instead of answering them
      // at the door.
      // Measured 2026-09-02 over 24 seeds a night, three settings (400, 900,
      // never) x two wind margins x two flash margins: making a cams-up TRIP
      // purely to refresh the stun is a loss on Night 1 (14/24 at 400 and
      // 19/24 at 900, against 22/24 when the sweep only ever rides a wind
      // trip), roughly neutral on Nights 2 and 4, and worth about four runs in
      // twenty-four on Night 3. Monitor-up time is the exposure, so the
      // default is to sweep only when the monitor is up for the box anyway;
      // the periodic refresh stays available as a knob.
      sweepPeriodFrames = Infinity,
    } = options;
    if (!Number.isInteger(night) || night < 1) fail('night must be a night');
    this.schema = NIGHT_POLICY_SCHEMA;
    this.night = night;
    this.customNight = customNight;
    this.campFrames = campFrames;
    this.minMaskFrames = minMaskFrames;
    this.windMarginFrames = windMarginFrames;
    this.flashMarginFrames = flashMarginFrames;
    this.actWithinFrames = actWithinFrames;
    this.powerFloorFrames = powerFloorFrames;
    this.sweepOnTrip = sweepOnTrip;
    this.topUpBelow = topUpBelow;
    this.sweepPeriodFrames = sweepPeriodFrames;
    this.sweepFrames = 32;
    // `peakAi` reads the source's own AI rows, so a night that cannot arm Foxy
    // at all reports zero and the whole Foxy branch drops out by measurement
    // rather than by a hard-coded night number.
    this.foxyAi = C.peakAi(night, 'foxy', customNight);
    // `gotYou` needs 21 + Random(0..4) - D <= AI, so D <= 20 - AI is safe
    // against the luckiest roll. This is the same band the sourced reactive
    // reference policy uses.
    this.safeD = 20 - this.foxyAi;
    // Golden Freddy appears only on a cams-up movement roll and the mask press
    // clears him outright, so a night that can arm him owes a mask flick after
    // every cams-up trip. `peakAi` reports his `{ oneIn: N }` rows as 1, so
    // "rare" reads as possible rather than as zero.
    this.goldenAi = C.peakAi(night, 'golden', customNight);
    this.boxDrainFrames = C.boxDrainFrames(night);
    /** @type {any} */ this.lastDecision = null;
    this._cacheFrame = -1;
    this._cacheWant = null;
  }

  /** Cycle ids this policy needs; a library missing one cannot run it. */
  static get requiredCycles() { return NIGHT_POLICY_CYCLES; }

  /** True while the source holds Foxy's D at zero (groups 872-874). */
  foxyDormant(frame) {
    return this.foxyAi === 0 || this.night === 1 ||
      (this.night === 2 && frame < 2 * C.HOUR_FRAMES);
  }

  /**
   * Has this blackout already been defused?
   *
   * g533 latches: once the mask has been FULLY ON at any frame before the
   * office fuse expires, `blackout.masked` is set and stays set, and the
   * occupant is repelled when the five-second encounter ends whatever the mask
   * does in between. Holding the mask for the whole blackout is therefore 300
   * frames of doing nothing for the last 250 of them -- and on Night 6 the box
   * empties in 1000, so three blackouts is a box.
   *
   * This is a belief, not a read of the latch: the controller knows when it
   * first saw the blackout, hence the fuse deadline, and when its own mask
   * reached the fully-on state. It is deliberately conservative -- it claims
   * the defuse only once the fully-on frame has actually passed and only when
   * it landed strictly inside the fuse.
   */
  defused(state) {
    const hazard = state.hazards.blackout;
    if (hazard.state !== 'active' || hazard.deadlineFrame < 0) return false;
    if (!state.maskOn || state.maskSinceFrame < 0) return false;
    const fullyOnAt = state.maskSinceFrame + C.MASK_ANIM_ON;
    return fullyOnAt < hazard.deadlineFrame && state.frame >= fullyOnAt;
  }

  /** Frames of monitor/mask work between here and the first winding frame. */
  leadToWind(state) {
    const up = state.monitor === 'up' || state.monitor === 'raising';
    return (state.maskOn ? C.MASK_ANIM_OFF + BOUNDARY : 0) +
      (up ? 0 : C.MONITOR_ANIM_UP + BOUNDARY) + BOUNDARY;
  }

  /** Frames of monitor/mask work between here and a hall flash landing. */
  leadToFlash(state) {
    const up = state.monitor === 'up' || state.monitor === 'raising';
    return (state.maskOn ? C.MASK_ANIM_OFF + BOUNDARY : 0) +
      (up ? C.MONITOR_ANIM_DOWN + BOUNDARY : 0);
  }

  /**
   * Frames of slack before a wind trip MUST start. Negative means late.
   * `Infinity` while this night's box does not drain in this hour (g653's
   * Night 1 gate), which is a source fact and not an optimism.
   */
  boxSlack(state, { lead = true } = {}) {
    const hour = Math.floor(state.frame / C.HOUR_FRAMES);
    if (!C.boxDrainsAtHour(state.night, hour)) return Infinity;
    const framesLeft = state.box * this.boxDrainFrames;
    if (!lead) return framesLeft;
    return framesLeft - this.leadToWind(state) - this.windMarginFrames;
  }

  /**
   * Frames of slack before a hall flash MUST start. Two deadlines, and the
   * second one is the one that decides the late nights.
   *
   * (a) THE BAND. `foxyD` is D under the hall hypothesis, and the mask doubles
   *     its rate, so the same remaining band is half as much time while
   *     camping.
   *
   * (b) THE FIVE-SECOND CHECK. Arrival and lock-on are the SAME equation
   *     evaluated on the same 5 s grid, and arrival does not reset D -- so a
   *     Foxy who arrives at one check locks on at the next one unless a hall
   *     flash lands between them (it zeroes D outright while he is in the hall
   *     and pins his B for 50 frames on top). Nothing observable says he has
   *     arrived, so the only safe rule is to never let a whole check period
   *     pass unflashed.
   *
   *     Measured 2026-09-02: without (b) the policy flashed on the band alone,
   *     once per ~19 s on Night 2, and lost 20/20 to `foxy` -- every one of
   *     them the same sequence, a parts D climbing unwatched to the arrival
   *     threshold and the lock-on landing on the very next check. With (b) the
   *     same cohort is unaffected on Night 1 (Foxy is pinned at zero there)
   *     and the deaths stop.
   */
  foxySlack(state, { masked = state.maskOn, lead = true } = {}) {
    if (this.foxyDormant(state.frame)) return Infinity;
    if (state.power <= this.powerFloorFrames) return Infinity;  // nothing to spend
    const perSecond = masked ? 2 : 1;
    const toBand = ((this.safeD - state.foxyD) * C.FPS) / perSecond;
    const sinceFlash = state.lastHallLightFrame < 0
      ? Infinity : state.frame - state.lastHallLightFrame;
    const toCheck = C.MO_FRAMES - sinceFlash;
    const raw = Math.min(toBand, toCheck);
    if (!lead) return raw;
    return raw - this.leadToFlash(state) - this.flashMarginFrames;
  }

  /**
   * Frames of slack before the route stun must be refreshed. Negative means
   * the stun has expired somewhere on a route and whoever was held there is
   * rolling again.
   */
  sweepSlack(state) {
    if (!this.sweepOnTrip) return Infinity;
    const since = state.lastCameraFlashFrame < 0
      ? Infinity : state.frame - state.lastCameraFlashFrame;
    const up = state.monitor === 'up' || state.monitor === 'raising';
    const lead = (state.maskOn ? C.MASK_ANIM_OFF + BOUNDARY : 0) +
      (up ? 0 : C.MONITOR_ANIM_UP + BOUNDARY) + BOUNDARY;
    return this.sweepPeriodFrames - since - lead;
  }

  /** Frames a whole wind trip costs from here, including getting back down. */
  tripFrames(state, windFrames) {
    const up = state.monitor === 'up' || state.monitor === 'raising';
    return (state.maskOn ? C.MASK_ANIM_OFF + BOUNDARY : 0) +
      (up ? 0 : C.MONITOR_ANIM_UP + BOUNDARY) +
      (this.sweepOnTrip ? this.sweepFrames + BOUNDARY : 0) +
      2 + BOUNDARY + windFrames + BOUNDARY + C.MONITOR_ANIM_DOWN + BOUNDARY;
  }

  /** Walk the prerequisites of a wind trip, ending in the named wind. */
  windTrip(state, wind, why, reason, { forceSweep = false } = {}) {
    if (state.maskOn) return reason(UNMASK, `${why}: winding needs the mask off`);
    const up = state.monitor === 'up' || state.monitor === 'raising';
    if (!up) return reason(RAISE, `${why}: winding needs the monitor up`);
    // The monitor is already up and the camera flash is nearly free, so the
    // trip pays for itself twice: sweep the three route rooms on the way to
    // the box rather than making a second cams-up trip for them. The sequence
    // is driven by the observed camera alone -- the sweep ends parked on CAM
    // 07 -- so there is no trip counter to get out of step.
    if (this.sweepOnTrip && (forceSweep ||
        (state.viewedCamera !== 7 && state.viewedCamera !== C.BOX_CAM)))
      return reason(SWEEP, `${why}: stun the routes on the way to the box`);
    if (state.viewedCamera !== C.BOX_CAM)
      return reason(SELECT_BOX_CAM, `${why}: winding only counts on the box camera`);
    return reason(wind, `${why}: wind`);
  }

  /** Walk only the prerequisites of a route sweep; do not invent a box wind. */
  sweepTrip(state, reason) {
    if (state.maskOn) return reason(UNMASK, 'sweep: the camera needs the mask off');
    const up = state.monitor === 'up' || state.monitor === 'raising';
    if (!up) return reason(RAISE, 'sweep: the camera needs the monitor up');
    return reason(SWEEP, 'sweep: refresh the route stun');
  }

  /**
   * The primitive this policy wants at this boundary, walking its own
   * prerequisites so the answer is always reachable from the current state.
   */
  want(controller) {
    const state = controller.reduced;
    const facts = controller.facts;
    const up = state.monitor === 'up' || state.monitor === 'raising';
    const masked = state.maskOn;
    const reason = (cycle, why) => {
      this.lastDecision = { frame: state.frame, cycle, why };
      return cycle;
    };

    // 1. The office cue. A whole-screen luma collapse is the one fact a coarse
    //    read never misses, and the mask reaching state 2 before the fuse is
    //    the only thing that defuses it.
    if (observedValue(facts, 'blackout') === true && !this.defused(state)) {
      if (masked) return reason(HOLD, 'blackout: mask already on');
      if (up) return reason(LOWER, 'blackout: the mask needs the monitor down');
      return reason(MASK, 'blackout: defuse the office fuse');
    }

    // 2. The two threats a stock read can name individually: Balloon Boy in
    //    the left opening (the one-pixel read and his vent thud) and Mangle at
    //    the office edge (her sustained s0020 static). Both are mask repels.
    const opening = observedValue(facts, 'leftOpening');
    // The visual office read is a current level; the audio cue is a retained
    // edge. Once the office is explicitly visible and empty, that newer level
    // closes an older twelve-second `opening` cue instead of re-masking on it.
    const bb = opening === 'threat' ||
      (opening !== 'empty' && observedValue(facts, 'bbVent') === 'opening');
    const mangle = observedValue(facts, 'mangleStatic') === true;
    if (bb || mangle) {
      const why = bb ? 'balloon boy in the opening' : 'mangle static in the office';
      if (masked) {
        const worn = state.maskSinceFrame < 0 ? 0 : state.frame - state.maskSinceFrame;
        // Audio facts intentionally outlive the impulse that created them (the
        // BB opening window is 12 s), while the sourced repel is complete after
        // five mask ticks. Treating that retained cue as a fresh occupant kept
        // the mask on for the whole audio TTL, starved both Foxy and the box,
        // and made every late night fail. Once this continuous mask period has
        // paid the complete repel, leave even if the old cue is still audible;
        // the office pixel can confirm the result when it becomes visible.
        return worn < this.campFrames
          ? reason(HOLD, `${why}: ${worn} of ${this.campFrames} repel frames`)
          : reason(UNMASK, `${why}: sourced repel complete; ignore retained cue`);
      }
      if (up) return reason(LOWER, why);
      return reason(MASK, why);
    }

    // 3. Golden Freddy. He can only appear while the monitor is up (g336) and
    //    the mask press clears him on the spot, while RAISING the monitor or
    //    FLASHING the hall with him there is an instant kill. Nothing
    //    observable says whether he is in the office, so the trip pays an
    //    unconditional mask flick on the way out. Measured 2026-09-02: without
    //    it Night 7 lost 10 of 20 to `golden-freddy`, every one of them the
    //    hall flash that follows a wind trip.
    if (this.goldenAi > 0 && !masked && !up &&
        state.lastMonitorUpFrame > state.lastMaskOnFrame)
      return reason(MASK, 'golden freddy: clear the office after a cams-up trip');

    // 4. The deadline race. Whichever of the two tasks is nearer its deadline
    //    wins, and only once it is actually due.
    const box = this.boxSlack(state);
    const foxy = this.foxySlack(state);
    const sweep = this.sweepSlack(state);
    // The stun is NOT in this race. Its deadline is not lethal -- an expired
    // stun releases a character to roll again, it does not kill -- while both
    // of the others are, so it belongs with the opportunistic work below.
    // Measured 2026-09-02: racing it against the other two starved the hall
    // flash to 1-3 flashes a night and lost 20/20 to `foxy` on every night
    // from 2 up, because a trip is longer than the stun period and the sweep
    // is therefore permanently the most overdue task.
    const due = Math.min(box, foxy);
    if (due <= this.actWithinFrames) {
      // Rank the two overdue tasks on their LEAD-FREE deadlines.
      //
      // The lead terms depend on where the monitor and the mask are, and the
      // two tasks want them in opposite positions -- winding needs the monitor
      // up, the hall light needs it down. Ranking on the lead-included slack
      // therefore flips the winner every time the loser's own prerequisite
      // lands, and the controller livelocks: measured 2026-09-02 on Night 3,
      // `verify-and-resume`/`lower-monitor` alternated for 2300 frames with
      // the box at zero, and the run died with the Puppet out. The lead still
      // decides WHEN a task becomes due; it must not decide WHICH one wins.
      if (this.boxSlack(state, { lead: false }) <=
          this.foxySlack(state, { lead: false })) {
        // Size the wind to the Foxy slack even when the box is already late.
        // A 4.5 s hold is longer than the whole flash period on the late
        // nights, so taking the long wind here turns one late task into two.
        //
        // The alternative was measured, because on Night 6 the box is what
        // kills: serving the box fully here (always the long wind) moves that
        // night's deaths from 50 Puppet / 7 Foxy to 9 Puppet / 49 Foxy over 60
        // held-out seeds and buys 1 clear in 60, while costing Night 2 and
        // Night 4 three and five runs in sixty. It is a redistribution, not a
        // gain: Night 6's box drain (16.7 s) and Foxy band (5 D at his 2 AM
        // level) cannot both be served by a controller whose shortest useful
        // wind plus trip is longer than the 5 s flash period. That is a
        // resource wall, and no ordering of these two tasks gets through it.
        const wind = foxy > this.tripFrames(state, C.s(4.5)) ? WIND : WIND_SHORT;
        return this.windTrip(state, wind, 'box', reason);
      }
      if (masked) return reason(UNMASK, 'foxy: the hall light needs the mask off');
      if (up) return reason(LOWER, 'foxy: the hall light needs the monitor down');
      return reason(FLASH, 'foxy: reset D before the band');
    }

    // 4b. Opportunistic top-up. The hall flash is the metronome and the gap
    //     between two flashes is the only time the monitor may be up at all,
    //     so a box that is merely NOT FULL is worth topping up whenever a
    //     whole trip fits in the remaining slack. Waiting for the box to
    //     become urgent is what makes the trip collide with the flash: on
    //     Night 6 the box empties in 16.7 s and one 4.5 s wind trip is longer
    //     than the 5 s period the flash has to repeat in, so the two tasks
    //     never both fit once they are both late.
    const longTrip = this.tripFrames(state, C.s(4.5));
    const shortTrip = this.tripFrames(state, C.s(2.5));
    // ...but only inside a horizon. Monitor-up time IS the exposure, so a trip
    // taken because the box merely is not full is a trip taken for nothing:
    // measured 2026-09-02, an unbounded top-up put the monitor up almost all
    // of Night 1 and took it from 16 of 20 to 3, every loss `inside-office`.
    // One flash period plus the trip is the horizon that matters -- inside it,
    // waiting is what causes the collision; outside it, waiting is free.
    const boxWanted = state.box < this.topUpBelow && box < C.MO_FRAMES + longTrip;
    // A trip is a trip: while the monitor is up for one reason it may as well
    // serve the other. The stun rides here rather than in the race above.
    if (boxWanted) {
      const forceSweep = sweep <= 0;
      if (due > longTrip)
        return this.windTrip(state, WIND, 'top-up', reason, { forceSweep });
      if (due > shortTrip)
        return this.windTrip(state, WIND_SHORT, 'top-up', reason, { forceSweep });
    }
    if (sweep <= 0 && due > this.sweepFrames + BOUNDARY)
      return this.sweepTrip(state, reason);

    // 5. Idle. The office is closed only while the mask is on, so wearing it is
    //    the default -- and because `mask-now` ends as soon as the mask is
    //    verifiably on, how long to keep it there is decided here, one boundary
    //    at a time, instead of being frozen into a primitive's duration.
    if (masked) {
      const worn = state.maskSinceFrame < 0 ? 0 : state.frame - state.maskSinceFrame;
      // Stay on for the sourced five-tick vent repel while nothing else is
      // due; `maskSinceFrame` is when this mask period began, so this is the
      // camp's measured elapsed time and not a guess.
      return worn < this.campFrames && due > BOUNDARY
        ? reason(HOLD, `camp: ${worn} of ${this.campFrames} frames worn`)
        : reason(UNMASK, 'camp: nothing left to hold the mask for');
    }
    if (up) return reason(LOWER, 'idle: leave the monitor down');
    // Wear the mask for whatever the nearer deadline leaves, rather than only
    // when the WHOLE five-tick repel fits.
    //
    // Requiring the full camp meant no camp at all from Night 2 onward, and
    // that is structural rather than a tuning accident: the sourced repel is
    // five one-second ticks (316 frames with the put-on animation) and the
    // sourced hall-flash cadence is one movement period (300 frames), so they
    // do not both fit. The repel is not all-or-nothing though -- g292/g400 roll
    // a 10% leave on every cumulative second under the mask -- so a partial
    // camp is partial cover, and partial cover beats standing in an open
    // office. Measured 2026-09-02: with the all-or-nothing rule Night 2 lost
    // 19 of 20 to Toy Bonnie and Toy Chica walking in, and the policy had worn
    // the mask exactly never after 2 AM.
    // Price the mask AT THE RATE IT WILL COST. `due` above is measured
    // standing in the office, where D advances once a second; under the mask
    // it advances twice, and the flash cannot be taken at all until the mask
    // comes off. Deciding to mask on the unmasked slack is how a controller
    // walks into a Foxy deadline it created by masking: measured 2026-09-02,
    // wearing the mask on the unmasked slack took Night 2 from 0 to 9 of 20
    // and took Night 6 from 5 `foxy` deaths to 19.
    const maskedDue = Math.min(
      box - C.MASK_ANIM_OFF - BOUNDARY,
      this.foxySlack(state, { masked: true }));
    if (maskedDue > this.minMaskFrames)
      return reason(MASK, `camp: ${Math.round(maskedDue)} masked frames of slack`);
    // No room for a camp. Spend the second on the free stall instead of
    // standing still: it costs no battery, it blocks the right vent outright
    // while it is held, and it is the only idle action that is not waiting.
    return due > C.FPS + BOUNDARY
      ? reason(STALL, `stall: ${Math.round(due)} frames of slack is under the camp`)
      : reason(HOLD, `hold: ${Math.round(due)} frames of slack is under the stall`);
  }

  /**
   * `selectCycle`'s score callback. Rank, not a continuous quantity: the
   * planner sorts on risk then resourceMargin, and a continuous margin
   * reorders equal-risk candidates every few frames (the livelock the baseline
   * control's own comment records).
   */
  score(cycle, _hypothesis, _gate, controller) {
    const frame = controller.reduced.frame;
    if (frame !== this._cacheFrame) {
      this._cacheFrame = frame;
      this._cacheWant = this.want(controller);
    }
    const want = this._cacheWant;
    // Rank 1 keeps `observe-and-hold` as the fallback when the wanted
    // primitive is refused by a gate, so a refusal costs a boundary rather
    // than committing an unrelated action.
    const risk = cycle.id === want ? 0 : cycle.id === HOLD ? 1 : 2;
    return { risk, resourceMargin: 10 - risk,
      detail: `night ${this.night} policy wants ${want}` };
  }

  /** Bind `score` so it can be passed straight to `controller.plan()`. */
  get scorer() { return this.score.bind(this); }
}

export const nightPolicy = (options) => new NightPolicy(options);
