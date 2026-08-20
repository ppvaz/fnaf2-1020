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

// Mask grace before an office attack arms, in frames, indexed by night
// [SOURCED: decompile — the `stun time` -> `mute call` fuse. It starts when
// an attacker engages at the office entry; masking while it burns defuses
// the attack, expiry arms it and the mask stops repelling. The old flat 45
// was only ever the night-7 value; night 1 gives more than double.]
export const MASK_GRACE_BY_NIGHT = { 1: 100, 2: 80, 3: 60, 4: 55, 5: 50, 6: 50, 7: 45 };
export const maskGraceFrames = (night) => MASK_GRACE_BY_NIGHT[night] ?? MASK_GRACE_BY_NIGHT[7];
export const BLACKOUT_MASK_GRACE = MASK_GRACE_BY_NIGHT[7]; // night-7 value; UI copy uses this

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

// The Toys and Withered Freddy walk in once the CURRENT continuous cams-up
// session reaches 20 - 2*night seconds; the counter resets the moment the
// monitor starts coming down. Replaces the old
// flat "5s in the opening with cams up" (VENT_KILL_FRAMES) model.
// [SOURCED: decompile — the `value25` cams-up-session second counter
// against the 20 - 2*night threshold]
export const entryStreakFrames = (night) => s(20 - 2 * night);
// The shared value25 streak applies to the Toys and Withered Freddy, not every
// occupant of marker 122. Withered Bonnie instead gets a per-unit cooldown of
// 1000-100*night frames and Withered Chica arms after six scheduler ticks.
// Both must be masked before a later cams-up trip. Mangle's 122->123 edge is
// driven by the right-vent light object's visible->invisible transition, so an
// unchecked Mangle can remain parked at 122 in this model [INFERRED]. The
// Chica timer can complete in just over five wall-clock seconds depending on
// scheduler phase, so the model uses the conservative five-second edge.
export const witheredBonnieOpeningFrames = night => 1000 - 100 * night;
export const WITHERED_CHICA_OPENING_FRAMES = s(5);

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
// [SOURCED: decompile — the battery counter (`cam 9`) is set per night at
// night start and drains 1 per frame while the light is on, office or
// cams. Night 5+ is 3000 frames = 50s of light, which both Markiplier's
// on-camera measurement and this file's old calibrated value already had
// exactly right; earlier nights get more.]
export const POWER_BY_NIGHT = { 1: 7000, 2: 6000, 3: 5000, 4: 4000, 5: 3000, 6: 3000, 7: 3000 };
export const powerFrames = (night) => POWER_BY_NIGHT[night] ?? POWER_BY_NIGHT[7];
export const POWER_FRAMES = POWER_BY_NIGHT[7]; // night-7 value; tools report against this
export const POWER_PER_BAR = POWER_FRAMES / 5;
export const POWER_BLINK = 500;   // indicator starts blinking [SOURCED]

// Music box [SOURCED]
export const BOX_DRAIN_FRAMES = s(16.67);  // full -> empty
export const BOX_WIND_FRAMES = s(5.66);    // empty -> full while winding [SOURCED: Markiplier]
export const PUPPET_AI = 15;
export const PUPPET_STAGES = 4;

// Animation lengths [SOURCED: decompiled Android build 296 animation bank —
// mmonitorUp 11fr@speed90, mmonitorDown 11fr@speed50, mmaskOn 9fr@speed75,
// mmaskOff 11fr@speed75; duration = frames*100/(speed*60fps). The flips are
// asymmetric: lowering the monitor is ~1.8x slower than raising it.]
export const MONITOR_ANIM_UP = 12;    // 0.204s
export const MONITOR_ANIM_DOWN = 22;  // 0.367s
export const MASK_ANIM_ON = 12;       // 0.200s
export const MASK_ANIM_OFF = 15;      // 0.244s

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
  1:  { x: 0.030, y: 0.485, w: 0.160, h: 0.145 },
  2:  { x: 0.385, y: 0.555, w: 0.160, h: 0.145 },
  3:  { x: 0.030, y: 0.310, w: 0.160, h: 0.145 },
  4:  { x: 0.385, y: 0.355, w: 0.160, h: 0.145 },
  5:  { x: 0.100, y: 0.845, w: 0.160, h: 0.145 },
  6:  { x: 0.340, y: 0.845, w: 0.160, h: 0.145 },
  7:  { x: 0.385, y: 0.165, w: 0.160, h: 0.145 },
  8:  { x: 0.030, y: 0.140, w: 0.160, h: 0.145 },
  9:  { x: 0.775, y: 0.060, w: 0.160, h: 0.145 },
  10: { x: 0.680, y: 0.420, w: 0.160, h: 0.145 },
  11: { x: 0.820, y: 0.285, w: 0.160, h: 0.145 },
  12: { x: 0.795, y: 0.585, w: 0.160, h: 0.145 },
};



// Every control the player actually touches, so thumb positions can be matched
// to the real game. `space` is the box the fractions are relative to: the whole
// stage, or the camera feed panel.
export const DEFAULT_WIDGETS = {
  camlight: { space: 'stage', x: 0.112, y: 0.200, w: 0.252, h: 0.425 },
  light:    { space: 'stage', x: 0.378, y: 0.285, w: 0.235, h: 0.359 },
  mask:     { space: 'stage', x: 0.051, y: 0.934, w: 0.399, h: 0.065 },
  monitor:  { space: 'stage', x: 0.525, y: 0.932, w: 0.400, h: 0.068 },
  ventL:    { space: 'stage', x: 0.013, y: 0.524, w: 0.044, h: 0.093 },
  ventR:    { space: 'stage', x: 0.946, y: 0.544, w: 0.042, h: 0.093 },
  wind:     { space: 'feed',  x: 0.402, y: 0.704, w: 0.311, h: 0.157 },
};



// --- Animatronic routes ----------------------------------------------------
// [SOURCED: decompiled Android build 296 Office-frame events; the raw edge
// list with per-hop gate conditions lives in the datamine's route-graph
// export. Internal camera numbers were mapped to display labels via the
// anchored bijection {8->9 Show Stage, 9->8 Parts/Service, 11->11 Prize
// Corner, 12->12 Kid's Cove, 5->6, 6->5, 4->7, 2->1, 7->4, 10->10} with
// 1->3 and 3->2 pinned by route-fitting (flagged: lower confidence).]
//
// 'blindA'/'blindB' are the mobile build's off-camera transit rooms (markers
// 120/121): no camera shows them, so no flash can reach a unit standing there.
// `choke` is the index in `path` of the room the Minus 7 flash loop holds
// them in.
//
// Sourced gate semantics (all new relative to the PC-derived model):
//   entryGate 'camsUp'  — the final hop into the vent opening / office only
//                          fires while the monitor is UP,
//   entryGate 'camsDown' — Withered Bonnie inverts it: he enters only while
//                          the monitor is DOWN,
//   lightStall true      — office light held with cams down blocks mid-route
//                          hops (the `new bonnie` counter, re-armed each
//                          second). Toy Chica is exempt at the source level.
//   mutex true           — shares the `chicalookatyou` one-attacker-at-a-time
//                          lock on the final hop.
// Not yet modeled from the same extraction: the Puppet roams on mobile, and
// Toy Bonnie/Toy Chica's final hops also test an `old chica` counter whose
// meaning is undecoded.
export const STALLED = [
  { id: 'toybonnie',  name: 'Toy Bonnie',      short: 'TB',  path: [9, 4, 'blindA', 3, 6, 'ventR'], choke: 1, kind: 'vent',     entryGate: 'camsUp',   openingRule: 'streak', lightStall: true,  mutex: true  },
  { id: 'withchica',  name: 'Withered Chica',  short: 'WC',  path: [8, 4, 'blindA', 3, 6, 'ventR'], choke: 1, kind: 'vent',     entryGate: null,       openingRule: 'mask',   lightStall: true,  mutex: false },
  { id: 'withbonnie', name: 'Withered Bonnie', short: 'WB',  path: [8, 2, 7, 1, 5, 'ventL'],        choke: 2, kind: 'vent',     entryGate: 'camsDown', openingRule: 'mask',   lightStall: false, mutex: false },
  { id: 'withfreddy', name: 'Withered Freddy', short: 'WF',  path: [8, 10, 'blindA', 'blindB', 'office'], choke: 1, kind: 'blackout', entryGate: 'camsUp', openingRule: 'streak', lightStall: true, mutex: true },
  { id: 'toychica',   name: 'Toy Chica',       short: 'TC',  path: [9, 7, 1, 5, 'ventL'],           choke: 1, kind: 'vent',     entryGate: 'camsUp',   openingRule: 'streak', lightStall: false, mutex: true  },
  { id: 'toyfreddy',  name: 'Toy Freddy',      short: 'TF',  path: [9, 4, 2, 'blindB', 'office'],   choke: 1, kind: 'blackout', entryGate: 'camsUp',   openingRule: 'streak', lightStall: true,  mutex: true  },
  { id: 'mangle',     name: 'The Mangle',      short: 'MG',  path: [12, 11, 10, 4, 'blindA', 1, 5, 'ventL'], choke: 2, kind: 'vent', entryGate: 'camsUp', openingRule: 'park', lightStall: true, mutex: false },
];
// The blind transit rooms break the old "nobody passes through an unflashed
// room" property: several routes now contain a stretch no camera can touch.

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
  { id: 'wind',         at: 1.50, label: 'Hold WIND',       action: 'wind',    want: 'on', hold: 3.5 },
];

export const TOL_GOOD = 0.15;  // seconds
export const TOL_OK   = 0.35;
