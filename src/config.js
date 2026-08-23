// ---------------------------------------------------------------------------
// FNaF 2 "Minus 7" trainer — tuning constants.
//
// Values marked [SOURCED] come from either attributed community PC reverse
// engineering or the owned Android event-sheet extraction; the nearby comment
// must say which. Android is canonical; gaps are tracked in
// ANDROID-SOURCE-STATUS.md. PC parity work is deferred.
// Values marked [MODEL] retain a useful community behavior that the Android
// extraction has not confirmed (or currently contradicts).
// Values marked [CALIBRATED] are not published numbers;
// they are chosen so the simulation behaves the way the documented gameplay
// behaves, and are safe to tune.
//
// [MAPPING AUDIT 2026-08-20] The Android runtime XOR-scrambles object handles
// (^28); every pre-2026-08-20 event dump therefore carried systematically
// swapped object NAMES (Toy<->Withered pairs included). Numeric values below
// came from event constants and are unaffected. Identity-derived rules
// (which character owns which route/gate/endgame branch) are being re-audited
// against the corrected dump; entries verified post-XOR say so in their
// comment. See ANDROID-CAMERA-STALL.md.
// ---------------------------------------------------------------------------

export const FPS = 60;
export const s = (sec) => Math.round(sec * FPS); // seconds -> frames

export const NIGHT_FRAMES = s(420);   // 7:00 [SOURCED]
export const HOUR_FRAMES = s(70);     // 1:10 per in-game hour [SOURCED]

// [SOURCED: Android decompile — Office groups 450-457.] With the monitor up
// (`viewing` > 0) and the camera light on (`lit?` = 1), the selected-camera
// marker (`your view`) overlapping a character sets its alterable B from the
// `stun time` counter: initial 400, and no event in the entire program ever
// writes it. B drains ~1 per 60 FPS frame (group 1236 delta scale) and the
// movement pipeline requires B = 0, so one flash = 400 frames = 6.67 s. The
// community's 6.66 s figure is exact on Android. Per-group exclusions: no
// stun while `viewing` = 8 (Withereds), 9 (Toys), or 11 (Mangle, group 456);
// Paper Pals gets 400 - 50*night (group 457).
// An earlier audit declared this subsystem dormant ("Counter 152 `time
// allowed` = 0"). That was the pre-XOR handle scramble: the runtime XORs
// every object handle with 28 (COI.loadHeader), so expression handle 152 is
// really the counter stored as 132 — `stun time` = 400. See
// ANDROID-CAMERA-STALL.md.
export const STUN_FRAMES = 400;
export const MO_FRAMES = s(5);        // movement opportunity every 5s [SOURCED]
export const BLACKOUT_FRAMES = s(5);  // [SOURCED]
// Endpoint resolution order [SOURCED: g537 raises `check and move` when the
// 300-frame office sequence ends, then g538-555 are evaluated in group order
// and the FIRST match sets it back to 0]. So exactly one occupant of marker
// 122 resolves per encounter no matter how many are queued there, and which
// one is fixed by group index rather than by who triggered it. The global
// `got you stage` decides which half of the table runs: 0 is a defended
// encounter (g533, mask fully on before the fuse expired), 2 is a failed one
// (g532). Mangle is absent from the whole table -- her 122 edge is g402/403.
export const RESOLVE_ORDER_DEFENDED =
  ['withfreddy', 'withbonnie', 'withchica', 'toyfreddy', 'toybonnie', 'toychica'];
export const RESOLVE_ORDER_FAILED =
  ['withfreddy', 'withbonnie', 'withchica', 'toybonnie', 'toychica', 'toyfreddy'];

// Mask grace before an office attack arms, in frames, indexed by night
// [SOURCED: decompile — the `time allowed` -> `time left` fuse (post-XOR
// names; the pre-XOR dump called these `stun time` -> `mute call`). It
// starts when an attacker engages at the office entry; masking while it
// burns defuses the attack, expiry arms it and the mask stops repelling. The
// old flat 45 was only ever the night-7 value; night 1 gives more than
// double.]
export const MASK_GRACE_BY_NIGHT = { 1: 100, 2: 80, 3: 60, 4: 55, 5: 50, 6: 50, 7: 45 };
export const maskGraceFrames = (night) => MASK_GRACE_BY_NIGHT[night] ?? MASK_GRACE_BY_NIGHT[7];
export const BLACKOUT_MASK_GRACE = MASK_GRACE_BY_NIGHT[7]; // night-7 value; UI copy uses this

// Foxy [SOURCED: post-XOR decode 2026-08-20, groups 337/389-390/745/824-825/
// 846/855/864/872-874]. Roll every 5 s: (21+Random(5)) - D <= `old Foxy AI`
// (his AI caps at 17, group 829, unlike the shared 15). D (+1/s unengaged,
// +1/s MORE while masked with the threshold clear) is zeroed all night 1 and
// until 2AM night 2. Exposure is per-frame (v9 vs 100*night) with a B=50
// hall pin while lit; retreat writes B = 500+Random(500). GOT-YOU: 10 s
// clock in either monitor state, or instant on a monitor-down hall flash.
// Fully modeled as of 2026-08-20 (second pass): dormancy, the masked +1/s
// acceleration, per-frame exposure vs 100*night, and the B = 50 hall pin
// that holds both his eviction and his rolls until 50 frames after the
// light comes off.
export const FOXY_AI = 17;
export const foxyExposureFrames = night => 100 * night;
export const FOXY_HALL_PIN_FRAMES = 50;
export const FOXY_RETURN_MIN = 500;
export const FOXY_RETURN_MAX = 999;
export const FOXY_ENTER_MIN = s(5);
export const FOXY_ENTER_MAX = s(10);

// Retained BB mask-storage abstraction. The seven marker-122 attackers now use
// their character-specific Android endgames instead of this generic counter.
// [SOURCED: g294 (BB), g401 (Mangle), and Toy Chica's twin] five one-second
// ticks with the mask fully on force a vent occupant back to their route.
// g907 counts them and g293 zeroes the counter on every entry into the fully-on
// state, so this is a continuous hold: there is no mask storage on this build.
export const VENT_MASK_TICKS = 5;
export const MASK_STORAGE_CAP = 59;        // storable sub-second mask time
export const VENT_EARLY_LEAVE_CHANCE = 0.1; // per cumulative second

// The Withereds and Toy Freddy (the four `office occupied` mutex holders)
// walk in once the CURRENT continuous cams-up session reaches 20 - 2*night
// seconds; the counter resets the moment the monitor starts coming down.
// Replaces the old flat "5s in the opening with cams up" (VENT_KILL_FRAMES)
// model. [SOURCED: decompile — the `value25` cams-up-session second counter
// against the 20 - 2*night threshold. Identity re-bound 2026-08-20 after the
// XOR fix: pre-fix notes attributed this to "the Toys and W. Freddy".]
export const entryStreakFrames = (night) => s(20 - 2 * night);
// The shared value25 streak applies to the four mutex holders, not every
// occupant of marker 122. Toy Bonnie instead gets a per-unit cooldown of
// 1000-100*night frames and Toy Chica arms after six scheduler ticks.
// Both must be masked before a later cams-up trip. Mangle's 122->123 edge is
// the same shape as Balloon Boy's [SOURCED: g402 flags her when the raise
// starts, g403 moves her to 123 when it finishes], so an unchecked Mangle
// does not sit at 122 -- the next completed raise takes her in. The
// Chica timer can complete in just over five wall-clock seconds depending on
// scheduler phase, so the model uses the conservative five-second edge.
// (Pre-XOR these were labeled Withered Bonnie / Withered Chica.)
export const toyBonnieOpeningFrames = night => 1000 - 100 * night;
export const TOY_CHICA_OPENING_FRAMES = s(5);
// Endpoint resolution (groups 538-555) repels a defended marker-122 occupant
// to a sourced mid-route room — W. Bonnie to CAM 07, W. Chica to CAM 04,
// Toy Bonnie to CAM 03 — with a fresh approach cooldown written into their B:
// Random(500)/night. A marker-123 leave (groups 747-750) writes B = 500 flat.
// Toy Chica's five-tick mask leave returns her to CAM 07 (no sourced
// cooldown). Destinations the dump does not name stay at the route start.
export const REPEL_COOLDOWN_ROLL = 500;
export const INSIDE_LEAVE_COOLDOWN = 500;
// At marker 122, Toy Bonnie does not accept a generic direct mask repel.
// While the mask is fully on he rolls Random(2)=1 every 500 ms to create his
// office overlay (the iconic Toy Bonnie mask slide, `Active 19`). That
// overlay starts the shared defence fuse and 300-frame office sequence
// (Android groups 436-441, 530-553).
export const TOY_BONNIE_CUE_FRAMES = s(0.5);
export const TOY_BONNIE_CUE_CHANCE = 0.5;

// Marker 123 / inside-office branches [SOURCED: Android groups 556-569,
// 729-731, 747-750]. `danger 2` starts a 40-frame attack transition. Mangle
// arms on a 1-in-20 cameras-up second and attacks on a later cameras-down edge.
export const INSIDE_ATTACK_FRAMES = 40;
export const INSIDE_MASK_ATTACK_CHANCE = 0.5;
export const INSIDE_MASK_LEAVE_CHANCE = 0.1;
export const MANGLE_INSIDE_ARM_CHANCE = 0.05;

// Balloon Boy [SOURCED: Android groups 342 (roll), 359 (look-hold), 413-418
// (route hops), 417 (the hop into the opening)]. His route is
// CAM 10 -> 07 -> 03 -> 01 -> 05 -> vent opening: five moves, not four. Only
// the last one is monitor-gated, and only the middle three play his laugh
// (g414-416 write the laugh sample bank read by g608-611), so the community's
// "third laugh, he is in the vent camera" is move 4 arriving on CAM 05.
export const BB_MOVE_CHANCE = 0.75;
export const BB_STAGES = 5;
// Hops 1..BB_SILENT_HOPS make no sound; the first one (CAM 10 -> 07) is silent.
export const BB_SILENT_HOPS = 1;

// Golden Freddy — office [SOURCED: g336 spawn, g776 mask clear, g777 kill on
// a monitor raise, g778 kill on a hall flash]. g336 rolls `Random(20) <
// Golden Freddy AI` on a 5 s interval with the monitor fully up and no
// `yellowbear` already present; g830 caps his AI at 10 (the others cap at 15),
// so 10/20 is exactly one in two. g804 zeroes his AI below night 6.
export const GF_SPAWN_CHANCE = 0.5;
// Golden Freddy — hallway [SOURCED: g781 roll, g779 exposure, g780 kill,
// g865 reset]. g781 re-rolls `golden` v1 = Random(10) every one-second event
// while the hall light is OFF; v1 = 1 is the frame that draws him (g204). So
// his presence is re-decided each second, and holding the light freezes it.
export const GF_HALL_ROLL = 10;
// g779 adds one per frame while the light is on him and the hall is otherwise
// empty; g780 kills above 100, so 101 frames.
export const GF_HALL_KILL_FRAMES = 100;
// `hall movement` [SOURCED: g875-880 set it to 300 the moment any of the
// hall-routed characters overlaps it, g881 drains it per frame]. g779 needs it
// at zero, so for five seconds after anyone passes through the hallway Golden
// Freddy cannot accumulate exposure there at all.
export const HALL_MOVEMENT_FRAMES = 300;

// Stalled animatronics: everyone is capped at 15 AI in 10/20 [SOURCED]
export const STALLED_AI = 15;
// random(1..20) <= AI. At the 15 cap this is 75%, which matches BB's documented
// 3/4 rate. (One written guide states (AI+1)/20; TheBones5 and jerakaigamez both
// state 75% at 15 AI, so this is the formula used here.)
export const MO_CHANCE = (ai) => ai / 20;
// The Puppet is the exception [SOURCED: g494-497]. The shared rolls use
// Random(20)+1 <= AI or Random(20) < AI, both AI/20. `Sockpuppet AI` uses
// bare Random(20) <= AI, which succeeds for 0..AI: (AI+1)/20. At AI 15 his
// roll is therefore 16/20, not 15/20.
export const PUPPET_MO_CHANCE = (ai) => (ai + 1) / 20;

// Power [SOURCED]
// [SOURCED: decompile — the battery counter (true name `battery life`; the
// pre-XOR dump called it `cam 9`) is set per night at night start and drains
// 1 per frame while the light is on, office or cams. Night 5+ is 3000 frames
// = 50s of light, which both Markiplier's on-camera measurement and this
// file's old calibrated value already had exactly right; earlier nights get
// more.]
export const POWER_BY_NIGHT = { 1: 7000, 2: 6000, 3: 5000, 4: 4000, 5: 3000, 6: 3000, 7: 3000 };
export const powerFrames = (night) => POWER_BY_NIGHT[night] ?? POWER_BY_NIGHT[7];
export const POWER_FRAMES = POWER_BY_NIGHT[7]; // night-7 value; tools report against this
export const POWER_PER_BAR = POWER_FRAMES / 5;
export const POWER_BLINK = 500;   // indicator starts blinking [SOURCED]

// Music box [SOURCED]
export const BOX_DRAIN_FRAMES = s(16.67);  // full -> empty
// [SOURCED: decompile + Markiplier agree — winding below 300 snaps to 300
// (groups 639/645), then +5/frame (+300/s, groups 638/643); empty -> full is
// (2000-300)/300 = 5.67 s. The old "6.67 s gross" note forgot the snap-up.]
export const BOX_WIND_FRAMES = s(5.66);    // empty -> full while winding
export const PUPPET_AI = 15;
export const PUPPET_STAGES = 4;
// Once he is off CAM 11 he walks a real route like everyone else
// [SOURCED: g404-411]. CAM 11 -> 10 -> 07, then his own `decide path` value
// picks a side: 1 sends him 03 -> 01, 2 sends him 04 -> 02. Both arrive at
// marker 122, and g574 turns that into the encounter. Five hops on the normal
// 5 s movement roll, not the old flat 5-20 s timer.
export const PUPPET_ROUTE = {
  left:  [10, 7, 3, 1, 'office'],
  right: [10, 7, 4, 2, 'office'],
};

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
// [SOURCED: decompiled Android build 296 Office-frame events, RE-DERIVED
// 2026-08-20 from the post-XOR true-name dump (movement groups 374-435,
// 389-418; per-hop conditions in the regenerated route-graph export).
// Internal camera ids equal the display CAM labels 1:1 — anchored by five
// independent identities (Withereds start CAM 08 Parts/Service, Toys CAM 09
// Show Stage, Mangle CAM 12 Kid's Cove, BB CAM 10 Game Area, Puppet CAM 11
// Prize Corner) and by every vent assignment matching the known game (TB/WC/
// Mangle right vent via CAM 06, TC/WB/BB left vent via CAM 05). The previous
// fitted bijection (8<->9 etc.) was an artifact of the scrambled names.]
//
// 'blindA'/'blindB' are the off-camera transit rooms `hall stage 1`/`hall
// stage 2` (markers 120/121): no camera shows them, so no flash can reach a
// unit standing there. `choke` is the index in `path` of the room the
// Minus 7 flash loop holds them in ({4,7,10} is a cut set: every route
// crosses it within two hops, so the 4-7-10 cover re-derives from the
// corrected graph).
//
// Sourced gate semantics (post-XOR names):
//   entryGate 'camsUp'  — the final hop (`in office`, marker 122) fires only
//                          while the monitor is UP (`viewing` > 0),
//   entryGate 'camsDown' — Toy Bonnie inverts it: his vent hop needs the
//                          monitor DOWN plus the `right light` state,
//   entryGate null       — Toy Chica's final hop carries no monitor condition,
//   lightStallAt [...]   — indices whose outgoing hop requires the office
//                          hall-light latch (`viewing hall light`) to be zero.
//                          The latch clears on the global one-second tick, not
//                          when the player releases the light. Withered Chica
//                          and Toy Bonnie have no such gated edge.
//   mutex true           — shares the `office occupied` one-attacker lock on
//                          the final hop (W. Freddy, W. Bonnie, W. Chica,
//                          Toy Freddy).
//   repelIdx             — path index a marker-122 repel lands on (endpoint
//                          resolution groups 538-555 / Toy Chica's mask
//                          leave). Sourced: WB CAM 07, WC CAM 04, TB CAM 03,
//                          TC CAM 07. 0 where the dump names no destination.
// The W. Bonnie / W. Chica final hops also require the `in danger`
// attacker-engaged latch to be clear. The Puppet roams on mobile
// (rare-event tier) and Paper Pals has its own single office hop; neither is
// in this table.
export const STALLED = [
  { id: 'withfreddy', name: 'Withered Freddy', short: 'WF',  path: [8, 7, 3, 'blindB', 'office'],   choke: 1, kind: 'blackout', entryGate: 'camsUp',   openingRule: 'streak', lightStallAt: [2, 3], mutex: true,  repelIdx: 0 },
  { id: 'withbonnie', name: 'Withered Bonnie', short: 'WB',  path: [8, 7, 'blindA', 1, 5, 'ventL'], choke: 1, kind: 'vent',     entryGate: 'camsUp',   openingRule: 'streak', lightStallAt: [1, 2], mutex: true,  repelIdx: 1 },
  { id: 'withchica',  name: 'Withered Chica',  short: 'WC',  path: [8, 4, 2, 6, 'ventR'],           choke: 1, kind: 'vent',     entryGate: 'camsUp',   openingRule: 'streak', lightStallAt: [],     mutex: true,  repelIdx: 1 },
  { id: 'toyfreddy',  name: 'Toy Freddy',      short: 'TF',  path: [9, 10, 'blindA', 'blindB', 'office'], choke: 1, kind: 'blackout', entryGate: 'camsUp', openingRule: 'streak', lightStallAt: [1, 2], mutex: true, repelIdx: 0 },
  { id: 'toybonnie',  name: 'Toy Bonnie',      short: 'TB',  path: [9, 3, 4, 2, 6, 'ventR'],        choke: 2, kind: 'vent',     entryGate: 'camsDown', openingRule: 'mask',   lightStallAt: [],     mutex: false, repelIdx: 1 },
  { id: 'toychica',   name: 'Toy Chica',       short: 'TC',  path: [9, 7, 'blindA', 1, 5, 'ventL'], choke: 1, kind: 'vent',     entryGate: null,       openingRule: 'mask',   lightStallAt: [1, 2], mutex: false, repelIdx: 1 },
  { id: 'mangle',     name: 'The Mangle',      short: 'MG',  path: [12, 11, 10, 7, 'blindA', 2, 6, 'ventR'], choke: 2, kind: 'vent', entryGate: 'camsUp', openingRule: 'raise', lightStallAt: [3, 4], mutex: false, repelIdx: 0 },
];
// The blind transit rooms break the old "nobody passes through an unflashed
// room" property: several routes now contain a stretch no camera can touch.
// Mangle additionally transits CAM 11 (Prize Corner), where the flash stun is
// source-excluded (group 456, `viewing <> 11`); her pin room is CAM 10.

export const WITHEREDS = new Set(['withchica', 'withbonnie', 'withfreddy']);
// [SOURCED: Android decompile, post-XOR names — Office groups 344-348 & 357.]
// The look-hold: while the selected-camera marker (`your view`) overlaps the
// character, their pending movement roll (A=1) cannot resolve to A=2. It
// applies to the three Withereds (344-348) and, monitor-up only, to Mangle
// (357); Mangle's monitor-down resolution is instead blocked by the office
// hall light (358, `viewing hall light` = 0 required). Toys have no look
// gate at all — their resolutions are ordered by Show Stage co-occupancy
// (350-356: Bonnie leaves before Chica before Freddy). The Withered groups
// carry NO monitor condition, and lowering the monitor zeroes `viewing`
// without moving the marker (group 262), so the Withered hold persists
// monitor-down on the last-selected camera ("parking").
// (The pre-XOR audit had this set exactly inverted: Toys instead of
// Withereds. See ANDROID-CAMERA-STALL.md.)
export const SELECTED_CAMERA_GATED = new Set(['withfreddy', 'withbonnie', 'withchica', 'mangle']);

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
