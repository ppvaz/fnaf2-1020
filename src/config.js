// ---------------------------------------------------------------------------
// FNaF 2 "Minus 7" trainer — tuning constants.
//
// Values marked [SOURCED] come from the community AI breakdowns (see
// MINUS-7-STRATEGY.md). Values marked [CALIBRATED] are not published numbers;
// they are chosen so the simulation behaves the way the documented gameplay
// behaves, and are safe to tune.
// ---------------------------------------------------------------------------

export const FPS = 60;
export const s = (sec) => Math.round(sec * FPS); // seconds -> frames

export const NIGHT_FRAMES = s(420);   // 7:00 [SOURCED]
export const HOUR_FRAMES = s(70);     // 1:10 per in-game hour [SOURCED]

export const STUN_FRAMES = 400;       // 6.66s camera-light stun [SOURCED]
export const MO_FRAMES = s(5);        // movement opportunity every 5s [SOURCED]
export const BLACKOUT_FRAMES = s(5);  // [SOURCED]
export const BLACKOUT_MASK_GRACE = 45; // ~45 frames to get the mask on [SOURCED]

// Foxy [SOURCED]
export const FOXY_AI = 17;
export const FOXY_EXPOSURE_TO_RETREAT = 700;   // 100 * night number
export const FOXY_RETURN_MIN = 500;
export const FOXY_RETURN_MAX = 999;
export const FOXY_ENTER_MIN = s(5);
export const FOXY_ENTER_MAX = s(10);

// Vent animatronics [SOURCED]
export const MASK_LEAVE_FRAMES = 300;      // 5s cumulative mask time
export const MASK_STORAGE_CAP = 59;        // storable sub-second mask time
export const VENT_EARLY_LEAVE_CHANCE = 0.1; // per cumulative second
export const VENT_KILL_FRAMES = 300;       // 5s in the opening with cams up

// Balloon Boy [SOURCED]
export const BB_MOVE_CHANCE = 0.75;
export const BB_STAGES = 4;

// Golden Freddy [SOURCED]
export const GF_SPAWN_CHANCE = 0.5;
// Hallway Golden Freddy: rolls 0..10 every second, appears on a 1 but only if
// nobody else is in the hall; then 100 frames of hall light on him is lethal.
export const GF_HALL_ROLL = 11;
export const GF_HALL_KILL_FRAMES = 100;
// Android-only bug: raising the monitor immediately before a 5s interval gives
// Golden Freddy an "unfair" kill. Window is [CALIBRATED].
export const GF_UNFAIR_WINDOW = 18; // 0.3s

// Stalled animatronics: everyone is capped at 15 AI in 10/20 [SOURCED]
export const STALLED_AI = 15;
// random(1..20) <= AI. At the 15 cap this is 75%, which matches BB's documented
// 3/4 rate. (One written guide states (AI+1)/20; TheBones5 and jerakaigamez both
// state 75% at 15 AI, so this is the formula used here.)
export const MO_CHANCE = (ai) => ai / 20;

// Power [SOURCED]
export const POWER_FRAMES = 3000;
export const POWER_PER_BAR = 600;
export const POWER_BLINK = 500;   // indicator starts blinking [SOURCED]

// Music box [SOURCED]
export const BOX_DRAIN_FRAMES = s(16.67);  // full -> empty
export const BOX_WIND_FRAMES = s(5.66);    // empty -> full while winding [SOURCED: Markiplier]
export const PUPPET_AI = 15;
export const PUPPET_STAGES = 4;

// Animation lengths [CALIBRATED to the ~0.25s figures players quote]
export const MONITOR_ANIM = 15;
export const MASK_ANIM = 15;

// --- Cameras ---------------------------------------------------------------
export const CAMS = {
  1:  { name: 'Party Room 1' },
  2:  { name: 'Party Room 2' },
  3:  { name: 'Party Room 3' },
  4:  { name: 'Party Room 4' },
  5:  { name: 'Left Air Vent' },
  6:  { name: 'Right Air Vent' },
  7:  { name: 'Main Hall' },
  8:  { name: 'Parts/Service' },
  9:  { name: 'Show Stage' },
  10: { name: 'Game Area' },
  11: { name: 'Prize Corner' },
  12: { name: "Kid's Cove" },
};

export const TARGET_CAMS = [10, 4, 7];
export const BOX_CAM = 11;

// Map button geometry, normalised 0..1 inside the map panel.
// Traced from a screenshot of the real FNaF 2 map, so the thumb path between
// 11 / 10 / 4 / 7 matches the game. CAM 05 and CAM 06 flank the office: they are
// the air-vent cameras, where a vent animatronic is visible on approach before
// it reaches the blind spot. Read off a low-resolution image by eye, so
// treat it as close-but-not-exact: Settings -> Calibrate layout lets you drag
// anything that looks off and save it straight back into this file.
// Aspect ratio of the source map image the coordinates below were traced from.
// The map box is sized to this so the traced proportions survive.
export const MAP_AR = 268 / 199;

export const DEFAULT_MAP = {
  8:  { x: 0.030, y: 0.140, w: 0.160, h: 0.145 },
  7:  { x: 0.385, y: 0.165, w: 0.160, h: 0.145 },
  9:  { x: 0.775, y: 0.060, w: 0.160, h: 0.145 },
  3:  { x: 0.030, y: 0.310, w: 0.160, h: 0.145 },
  4:  { x: 0.385, y: 0.355, w: 0.160, h: 0.145 },
  11: { x: 0.820, y: 0.285, w: 0.160, h: 0.145 },
  10: { x: 0.680, y: 0.420, w: 0.160, h: 0.145 },
  1:  { x: 0.030, y: 0.485, w: 0.160, h: 0.145 },
  2:  { x: 0.385, y: 0.555, w: 0.160, h: 0.145 },
  12: { x: 0.795, y: 0.585, w: 0.160, h: 0.145 },
  5:  { x: 0.100, y: 0.845, w: 0.160, h: 0.145 },
  6:  { x: 0.340, y: 0.845, w: 0.160, h: 0.145 },
};



// Every control the player actually touches, so thumb positions can be matched
// to the real game. `space` is the box the fractions are relative to: the whole
// stage, or the camera feed panel.
export const DEFAULT_WIDGETS = {
  // Two separate lights, because the game has two, in two different places:
  // the office flashlight (cams down) and the camera light (cams up). Only one
  // is ever on screen. Both are see-through so they don't block the view.
  light:    { space: 'stage', x: 0.020, y: 0.730, w: 0.190, h: 0.190 },
  camlight: { space: 'stage', x: 0.020, y: 0.480, w: 0.150, h: 0.150 },
  mask:     { space: 'stage', x: 0.300, y: 0.880, w: 0.300, h: 0.082 },
  monitor:  { space: 'stage', x: 0.630, y: 0.880, w: 0.300, h: 0.082 },
  ventL:    { space: 'stage', x: 0.014, y: 0.300, w: 0.048, h: 0.140 },
  ventR:    { space: 'stage', x: 0.938, y: 0.300, w: 0.048, h: 0.140 },
  wind:     { space: 'feed',  x: 0.040, y: 0.660, w: 0.280, h: 0.170 },
};



// --- Animatronic routes ----------------------------------------------------
// `choke` is the index in `path` of the room the Minus 7 flash loop holds them
// in. Routing after the chokepoint is a reasonable approximation: it only ever
// runs if you have already broken the stun loop, and it exists so a mistake
// costs you a few seconds of scramble rather than an instant loss.
export const STALLED = [
  { id: 'toybonnie',  name: 'Toy Bonnie',      short: 'TB',  path: [9, 4, 3, 6, 'ventR'],  choke: 1, kind: 'vent' },
  { id: 'withchica',  name: 'Withered Chica',  short: 'WC',  path: [8, 4, 2, 6, 'ventR'],  choke: 1, kind: 'vent' },
  { id: 'withbonnie', name: 'Withered Bonnie', short: 'WB',  path: [8, 7, 2, 5, 'ventL'],  choke: 1, kind: 'vent' },
  { id: 'withfreddy', name: 'Withered Freddy', short: 'WF',  path: [8, 7, 'hall', 'office'], choke: 1, kind: 'blackout' },
  { id: 'toychica',   name: 'Toy Chica',       short: 'TC',  path: [9, 7, 1, 5, 'ventL'],  choke: 1, kind: 'vent' },
  { id: 'toyfreddy',  name: 'Toy Freddy',      short: 'TF',  path: [9, 10, 7, 'office'],   choke: 1, kind: 'blackout' },
  { id: 'mangle',     name: 'The Mangle',      short: 'MG',  path: [12, 10, 2, 6, 'ventR'], choke: 1, kind: 'vent' },
];
// Every chokepoint sits one move from the start room, which is exactly why the
// three-camera loop can hold all seven: nobody passes through an unflashed room.

export const WITHEREDS = new Set(['withchica', 'withbonnie', 'withfreddy']);

// --- The routine the trainer teaches ---------------------------------------
// Offsets in seconds from the cycle anchor (:X2 / :X7).
export const CYCLE_SCRIPT = [
  { id: 'monitor-down', at: 0.00, label: 'Cams down',       action: 'monitor', want: 'down' },
  { id: 'mask-on',      at: 0.20, label: 'Mask on',         action: 'mask',    want: 'on'   },
  { id: 'mask-off',     at: 0.35, label: 'Mask off',        action: 'mask',    want: 'off'  },
  { id: 'flash-hall',   at: 0.42, label: 'Flash hall',      action: 'light',   want: 'tap'  },
  { id: 'monitor-up',   at: 0.60, label: 'Cams up',         action: 'monitor', want: 'up'   },
  { id: 'cam-10',       at: 0.80, label: 'CAM 10 + light',  action: 'camflash', cam: 10     },
  { id: 'cam-4',        at: 1.00, label: 'CAM 04 + light',  action: 'camflash', cam: 4      },
  { id: 'cam-7',        at: 1.20, label: 'CAM 07 + light',  action: 'camflash', cam: 7      },
  { id: 'cam-11',       at: 1.40, label: 'CAM 11',          action: 'cam',     cam: 11      },
  { id: 'wind',         at: 1.50, label: 'Wind',            action: 'wind',    want: 'on'   },
];

export const TOL_GOOD = 0.15;  // seconds
export const TOL_OK   = 0.35;
