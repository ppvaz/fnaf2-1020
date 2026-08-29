// What a stock-device native-resolution pixel watchlist can see, modelled with
// the real sensor's coarseness and latency. Plan 19 package 1.
//
// The device sensor is the cue helper's MediaProjection VirtualDisplay read
// (~59 ms device-local, ~15 Hz, its own surface -- no SurfaceFlinger contention,
// ONE-PIXEL-VISION.md). It samples a fixed watchlist of native pixels / tiny
// ROIs and returns their reduced values; the calibration that maps those values
// to game facts is plan 19 package 3.
//
// Every fact is `{ state: 'OBSERVED', value }` or `{ state: 'UNKNOWN', reason }`
// -- never a bare value (CLAUDE.md: "UNKNOWN(reason) is worth more than a
// plausible value"). A fact whose pixels are ambiguous THIS frame -- the screen
// mid-animation, the office panned, a blackout hiding the opening -- resolves
// UNKNOWN rather than guessing.
import * as C from './config.js';

// One read per this many frames: ~15 Hz, the measured device cadence.
export const OBSERVE_INTERVAL = 4;

const MON_UP = 'up', MON_DOWN = 'down';

const O = (value) => ({ state: 'OBSERVED', value });
const U = (reason) => ({ state: 'UNKNOWN', reason });

export const FACTS = ['blackout', 'amHour', 'monitorUp', 'maskOn', 'boxPie',
                      'splitArmed', 'leftOpening', 'ventLightL'];

// A complete fact set with every entry UNKNOWN -- what the controller sees
// before the first read completes.
const NO_READ = () => {
  const o = { frame: -1 };
  for (const k of FACTS) o[k] = U('no-read-yet');
  return o;
};

export class Observer {
  constructor({ interval = OBSERVE_INTERVAL, readDelayFrames = 0, dropRate = 0,
                rng = null } = {}) {
    this.interval = interval;
    this.readDelayFrames = readDelayFrames;  // model host round-trip latency
    this.dropRate = dropRate;                // fraction of reads that come back UNKNOWN
    this.rng = rng;
    this.lastReadFrame = -Infinity;
    this.cache = NO_READ();
    this.pending = [];                       // delayed reads not yet visible
  }

  // Take a fresh read off a live Sim if the cadence allows, then return the
  // most recent read that has finished its round-trip.
  read(sim) {
    if (sim.frame - this.lastReadFrame >= this.interval) {
      this.lastReadFrame = sim.frame;
      const snap = this._sample(sim);
      this.pending.push({ at: sim.frame + this.readDelayFrames, snap });
    }
    while (this.pending.length && this.pending[0].at <= sim.frame)
      this.cache = this.pending.shift().snap;
    return this.cache;
  }

  _drop() {
    if (!this.dropRate) return false;
    // `rng` is a src/rng.js Rng (next() -> [0,1)) or any {next()}; else Math.random.
    return (this.rng ? this.rng.next() : Math.random()) < this.dropRate;
  }

  _sample(sim) {
    const midMon = sim.monitor !== MON_UP && sim.monitor !== MON_DOWN;
    const midMask = sim.maskAnim > 0;
    const drop = this._drop();
    const hour = Math.min(6, Math.floor(sim.frame / C.HOUR_FRAMES));

    // A monitor-dependent read within the lower animation of a monitor press is
    // exactly the night 6-38 false positive: refuse it.
    const officeVisible = sim.monitor === MON_DOWN && !midMon && !midMask;
    const feedVisible = sim.camsUp && !midMon;

    return {
      frame: sim.frame,

      // whole-screen luma collapse -- the one fact a coarse read never misses
      blackout: drop ? U('read-dropped') : O(sim.blackout.active),

      // digit strokes, a phase anchor; small but high-contrast white-on-dark
      amHour: drop ? U('read-dropped') : O(hour),

      monitorUp: drop ? U('read-dropped')
        : midMon ? U('monitor-animating') : O(sim.camsUp),

      maskOn: drop ? U('read-dropped')
        : midMask ? U('mask-animating') : O(sim.maskFullyOn),

      // the box-pie fraction, only legible on the CAM 11 feed
      boxPie: drop ? U('read-dropped')
        : (feedVisible && sim.viewing === C.BOX_CAM) ? O(sim.box)
        : U('box-not-on-screen'),

      // both camera buttons lit == viewing marker disagree, monitor up
      splitArmed: drop ? U('read-dropped')
        : feedVisible && sim.viewing > 0 ? O(sim.cam !== sim.viewing)
        : U('cams-not-up'),

      // ONE-PIXEL-VISION.md: pixel (451,730) is 194 for the known-safe empty
      // opening, 0 for BB in it. `bb.inside` also reads black; treat both as
      // threat. Only legible with the office in view and undisturbed.
      leftOpening: drop ? U('read-dropped')
        : officeVisible && !sim.blackout.active
          ? O((sim.bb.inOpening || sim.bb.inside) ? 'threat' : 'empty')
          : U('opening-not-in-view'),

      // the left vent light widget, only while the office is shown
      ventLightL: drop ? U('read-dropped')
        : officeVisible ? O(sim.ventLightL) : U('office-not-in-view'),
    };
  }
}

// Convenience: the value if OBSERVED, else the fallback.
export const val = (fact, fallback = null) =>
  fact && fact.state === 'OBSERVED' ? fact.value : fallback;
