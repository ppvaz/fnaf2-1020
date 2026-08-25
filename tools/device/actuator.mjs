// The phone, between a pilot's schedule and the game.
//
// The exact simulator delivers every press on its scheduled frame and refuses
// only what the GAME refuses (engine.js press()). The device adds two failure
// modes of its own, both measured, and a schedule that survives without them
// has not been priced against the phone:
//
// - **Launch lateness.** Every wall-timed press lands late: the anchor press's
//   own lateness was 110-180 ms in the older traces and ~300 ms on night 6-40
//   (ON-DEVICE-VALIDATION.md). The mean is nearly free -- shifting the whole
//   route late survives up to 100 ms and the epoch offset dials it out -- but
//   the SPREAD costs nights (HID-MULTITOUCH.md: +/-10 ms of jitter drops
//   300/300 to 204/300). So `worst` mode does not pin lateness to the maximum:
//   a uniformly-late schedule is the benign case, and pinning would delete the
//   spread that does the damage.
//
// - **The mask seam.** While the mask is up or coming off, the monitor bar is
//   not drawn, so a monitor press there has no control under it. The engine
//   already refuses presses while the mask is ON; what only the phone loses is
//   the press during the mask-OFF animation, because setMask(false) clears
//   maskOn on the press and the animation runs as decoration. Measured across
//   the 28 graded nights (ON-DEVICE-VALIDATION.md "Which press desyncs, and
//   why", 2026-08-25): under 140 ms after the mask press 5 of 7 monitor
//   presses were lost, at 140-180 ms 4 of 8, and at 180 ms or more 0 of 17.
//
// Presses go through one queue, like the hid coprocess pipe (and the swipe
// era's sequential helper launches): order in is order out, so a press can
// land no earlier than the press before it. A backlog therefore delays a
// hold's release too -- that is the queue draining, not an error model
// corrupting flash lengths. Within one submission the press and its release
// share a single lateness draw, because plans/04 showed that independent
// draws turn every flash into a random length and price nothing.
//
// Measured but deliberately NOT modelled, because neither has a clean rate:
// the monitor press lost while a wind contact was still held (3 of 32
// readable, a geometry the runner no longer schedules), and the vent-light
// press drop ("dropped often enough to matter" -- no denominator yet). Add
// them here when a run census gives them numbers, not before.
import * as C from '../../src/config.js';
import { Rng } from '../../src/rng.js';

// docs/device/ON-DEVICE-VALIDATION.md, the mask-seam band table. The bands are
// measurements, not knobs; a future edit has to argue with the census.
export const SEAM_BANDS = [
  { underMs: 140, dropChance: 5 / 7 },
  { underMs: 180, dropChance: 4 / 8 },
];
export const SEAM_SAFE_MS = 180; // 0 lost in 17 tries at or past this

// The measured landing band of a wall-timed press: 110-180 ms in the older
// traces, ~300 ms on night 6-40. The branch macro can be worse -- the capture
// pipeline has finished 30-900 ms past the plan's cut-off -- so this default
// is the optimistic end for that beat, and it is overridable where it is used.
//
// Provenance caveat (2026-08-25): every night since the cue-trace feature ran
// under the orphaned-loop parasite (ON-DEVICE-VALIDATION.md "pricing the
// stream as the classifier's capture"), which stalled 1-3% of cue reads ~1 s
// and may account for part of the 30-900 ms pipeline tail. The upper end of
// this band therefore needs a clean-phone re-measure before it is treated as
// the device's own lateness; the first post-fix night can re-source it.
export const LAUNCH_LATE_MIN_MS = 110;
export const LAUNCH_LATE_MAX_MS = 300;

const f = (msv) => Math.round(msv / 1000 * C.FPS);
const toMs = (frames) => frames * 1000 / C.FPS;

export class DeviceActuator {
  // `perPress` picks the lateness granularity. The swipe runner launches one
  // helper per table row, so every press re-rolls (perPress: true). The HID
  // runner wall-times one boundary per macro and spaces the inside with
  // hid_delay (+/-2 ms), so a whole beat shares one draw (perPress: false,
  // re-rolled by beat()).
  constructor(sim, { seed = 1, worst = false, lateMinMs = LAUNCH_LATE_MIN_MS,
                     lateMaxMs = LAUNCH_LATE_MAX_MS, perPress = true } = {}) {
    if (!(lateMinMs >= 0) || !(lateMaxMs >= lateMinMs))
      throw new Error('lateness band must satisfy 0 <= min <= max');
    this.sim = sim;
    // Its own stream, never sim.rng: a lateness draw must not move the game's
    // rolls, or no run is comparable to its unwrapped twin (bbtest.mjs keeps
    // the same rule for its jitter draws).
    this.rng = new Rng(((seed >>> 0) ^ 0x9e3779b9) >>> 0, worst);
    this.lateMin = lateMinMs;
    this.lateMax = lateMaxMs;
    this.perPress = perPress;
    this.beatLateMs = this.sampleLateMs();
    this.pending = [];            // [landFrame, kind, act] in landing order
    this.lastLand = -1;
    this.holdLateMs = new Map();  // act -> the press's draw, reused by release
    this.maskOffAt = -Infinity;   // landing frame of the last mask-OFF press
    this.sent = 0;
    this.seamDrops = 0;
  }

  sampleLateMs() {
    // No worst pin (see header): worst luck still draws, it only pins drops.
    return this.rng.int(this.lateMin, this.lateMax);
  }

  // A new wall-timed launch. Only meaningful with perPress: false.
  beat() { if (!this.perPress) this.beatLateMs = this.sampleLateMs(); }
  beatLateFrames() { return f(this.beatLateMs); }

  submit(kind, act) {
    let lateMs;
    if (kind === 'release' && this.holdLateMs.has(act)) {
      lateMs = this.holdLateMs.get(act); // one draw per hold: plans/04
      this.holdLateMs.delete(act);
    } else {
      lateMs = this.perPress ? this.sampleLateMs() : this.beatLateMs;
      if (kind === 'press') this.holdLateMs.set(act, lateMs);
    }
    // The queue serializes: order in is order out, and a backlog delays what
    // follows it. This is what turns a draining sweep tail into a late anchor.
    const land = Math.max(this.sim.frame + f(lateMs), this.lastLand);
    this.lastLand = land;
    this.pending.push([land, kind, act]);
  }

  press(act) { this.submit('press', act); }
  release(act) { this.submit('release', act); }

  // Land everything due this frame. Call once per frame, before sim.tick().
  deliver() {
    const now = this.sim.frame;
    while (this.pending.length && this.pending[0][0] <= now) {
      const [, kind, act] = this.pending.shift();
      if (kind === 'release') { this.sim.release(act); continue; }
      this.sent++;
      if (act === 'monitor' && this.seamDropped(now)) { this.seamDrops++; continue; }
      // A mask press landing with the mask on is the mask-OFF press; the seam
      // it opens runs from this landing, not from the schedule's intent.
      if (act === 'mask' && this.sim.maskOn) this.maskOffAt = now;
      this.sim.press(act);
    }
  }

  seamDropped(now) {
    const gapMs = toMs(now - this.maskOffAt);
    const band = SEAM_BANDS.find(b => gapMs < b.underMs);
    return band ? this.rng.chance(band.dropChance, true) : false;
  }
}
