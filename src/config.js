// ---------------------------------------------------------------------------
// FNaF 2 "Minus 7" trainer — tuning constants.
//
// Values marked [SOURCED] come from either attributed community PC reverse
// engineering or the owned Android event-sheet extraction; the nearby comment
// must say which. Android is canonical; gaps are tracked in
// docs/android/ANDROID-SOURCE-STATUS.md. PC parity work is deferred.
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
// comment. See docs/android/ANDROID-CAMERA-STALL.md.
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
// docs/android/ANDROID-CAMERA-STALL.md.
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

// Sample handles, so a controller can be held to what a microphone could
// actually recover. Sounds are dispatched through registers on `cam 01`, not
// played inline: v6 -> g608-611, v21 -> g691-694.
// [SOURCED: Android decompile — Office frame.]
// THUD is the movement sample 18 edges across 7 characters share, including
// BB's two mask-clears (g292/294) and every other character's (g400/401,
// g439/440, g748/749). Nothing in the audio distinguishes them, which is why
// plan 08 removed early unmasking from scope.
export const THUD_SAMPLE = 17;
// The three vocals g414-416 select at random. Every vocal hop sets channel 14
// to the same volume, so amplitude carries no range information.
export const BB_VOCAL_SAMPLES = [21, 24, 23];
// g607 adds this on arrival at marker 122, so reaching the opening is a pair
// (thud + 21) rather than a bare thud. Sample 21 is also one of the vocals.
export const BB_ARRIVAL_SAMPLE = 21;
// Channel 14 volume. The same three samples mean two different things and the
// level is what separates them: g60 defaults the channel to 50, g414-416 play
// a route hop at 25, and g906 plays at 60 when he is on the camera you are
// watching. A detector that normalises level away cannot tell them apart.
export const BB_VOCAL_VOLUME = 25;
export const BB_VIEW_VOCAL_VOLUME = 60;
export const BB_VOCAL_CHANNEL_DEFAULT = 50;

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

// AI levels, by night and hour [SOURCED: g673 zeroes every counter at the
// start of any night but Custom; g674-684 are the per-night table, each row
// naming only the characters it changes; g787 copies the ten Custom Night
// dials on night 7; g804 zeroes Golden Freddy below night 6; g815-821 set the
// Puppet, who has no dial and no cap group]. `time of the night` is the hour
// counter and hour 0 is 12 AM, so a row with no hour fires at night start and
// a later row overwrites only what it names. Rebuild the whole table from the
// dump with `tools/dump/aimap.py`.
//
// The caps run every frame: g829 holds Foxy at 17, g830 holds Golden Freddy
// at 10 (which is what makes his 10/20 office roll exactly one in two), and
// g856-863 hold everyone else at 15.
export const AI_10_20 = 20;                 // every dial at 20
export const AI_CAPS = { foxy: FOXY_AI, golden: 10 };
export const AI_CAP_DEFAULT = STALLED_AI;
export const aiCap = (id) =>
  id === 'puppet' ? Infinity : (AI_CAPS[id] ?? AI_CAP_DEFAULT);

// Every counter g673 zeroes at night start. The Puppet is not among the ten
// Custom Night dials, which is why he is listed apart from them.
export const AI_DIALS = ['withfreddy', 'withbonnie', 'withchica', 'foxy',
  'toyfreddy', 'toybonnie', 'toychica', 'mangle', 'bb', 'golden'];
export const AI_IDS = [...AI_DIALS, 'puppet'];
const TEN_TWENTY = Object.fromEntries(AI_DIALS.map(id => [id, AI_10_20]));

// `{ oneIn: N }` is the source's `(Random(N) + 1) / N` under integer division:
// 1 with probability 1/N and 0 otherwise, rolled when the row fires. Golden
// Freddy is the only character written that way. g804 zeroes him below night
// 6, but it runs once, at night start, so it only cancels the rows that share
// that instant: nights 3, 4 and 5 write him at 12 AM and lose it, while night
// 2 writes him at 1 AM and keeps it. Night 2 is therefore the one night below
// 6 where he can appear at all, at one in a thousand.
export const AI_BY_NIGHT = {
  1: [{ hour: 0, set: { puppet: 1 } },                                    // g815
      { hour: 2, set: { toybonnie: 2, toychica: 2 } },                    // g674
      { hour: 3, set: { toybonnie: 3, toyfreddy: 2 } }],                  // g675
  2: [{ hour: 0, set: { puppet: 5 } },                                    // g816
      { hour: 1, set: { toyfreddy: 2, toybonnie: 3, toychica: 3,          // g676
                        mangle: 3, bb: 3, foxy: 1,
                        golden: { oneIn: 1000 } } }],
  3: [{ hour: 0, set: { withbonnie: 1, withchica: 1, foxy: 2, bb: 1,      // g677
                        puppet: 8 } },                                    // g817
      { hour: 1, set: { withfreddy: 2, withbonnie: 3, withchica: 2,       // g678
                        foxy: 3, toybonnie: 1, toychica: 1, bb: 2 } }],
  4: [{ hour: 0, set: { withbonnie: 1, foxy: 7, mangle: 5, bb: 3,         // g679
                        puppet: 9 } },                                    // g818
      { hour: 2, set: { withfreddy: 3, withbonnie: 4, withchica: 4,       // g680
                        toybonnie: 1 } }],
  5: [{ hour: 0, set: { withfreddy: 2, withbonnie: 2, withchica: 2,       // g681
                        foxy: 5, toyfreddy: 5, toybonnie: 2, toychica: 2,
                        mangle: 1, bb: 5, puppet: 10 } },                 // g819
      { hour: 1, set: { withfreddy: 5, withbonnie: 5, withchica: 5,       // g682
                        foxy: 7, toyfreddy: 1, mangle: 10 } }],
  // Night 6 is two rows, and the second is the 2 AM cliff: the three Toys
  // switch on there, Balloon Boy goes 5 -> 9, and Golden Freddy stops being a
  // one-in-ten coin flip and becomes a real 3.
  6: [{ hour: 0, set: { withfreddy: 5, withbonnie: 5, withchica: 5,       // g683
                        foxy: 10, mangle: 3, bb: 5, golden: { oneIn: 10 },
                        puppet: 15 } },                                   // g820
      { hour: 2, set: { withfreddy: 10, withbonnie: 10, withchica: 10,    // g684
                        foxy: 15, toyfreddy: 5, toybonnie: 5, toychica: 5,
                        mangle: 10, bb: 9, golden: 3 } }],
  7: [{ hour: 0, set: { ...TEN_TWENTY, puppet: 15 } }],                   // g787, g821
};

// The rows that fire as this hour begins.
export const aiUpdates = (night, hour) =>
  (AI_BY_NIGHT[night] ?? AI_BY_NIGHT[7]).filter(row => row.hour === hour);

// The highest AI a character can hold at any point of a night, read off the
// same rows the engine applies. A `{ oneIn: N }` row is 1 on its top draw, so
// its peak is 1 -- rare is not impossible and must not read as zero.
//
// This exists so a *policy* can ask the source whether a threat exists on a
// night instead of inferring it from whether one sampled seed happened to
// show it. g673 zeroes every counter at night start, so a character no row
// ever names stays at 0 for the whole night: Balloon Boy on Night 1 cannot
// act, while Night 3 sets him to 1 and then 2 and merely makes him rare.
export const peakAi = (night, id) => {
  let peak = 0;
  for (const row of AI_BY_NIGHT[night] ?? AI_BY_NIGHT[7]) {
    const level = row.set[id];
    if (level === undefined) continue;
    peak = Math.max(peak, Math.min(typeof level === 'number' ? level : 1, aiCap(id)));
  }
  return peak;
};

// Whether the sourced table lets this character act at all on this night.
export const canAct = (night, id) => peakAi(night, id) > 0;

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

// Music box [SOURCED for the counter and the wind; the DRAIN RATE IS DISPUTED]
//
// The counter is sourced: g652 sets `music button` AlterableValue0 to 2000 at
// frame start, g638/g643 add +5 per tick while the button is held, and g645
// snaps anything below 300 up to 300.
//
// The drain is not, and 2026-08-26 device measurement contradicts this
// constant. 16.67 s is 2000 units at 120 units/s, and `recipe.mjs` states that
// 120/s figure as **"Nights 6-7"** -- yet it is applied here to every night.
//
// Measured on the phone, Night 1, never winding, sampling the CAM 11 pie every
// ~9 s (captures are local-only; the pie is the white ellipse right of the wind
// button, roughly x 640-850, y 770-900 at 2400x1080):
//
//     t+114s  0.626   t+142s  0.551   t+170s  0.180
//     t+123s  0.625   t+151s  0.427   t+179s  0.054
//     t+133s  0.628   t+160s  0.304   t+188s  0.000
//
// Two disagreements with this file, both mattering to the campaign nights:
//
//   1. The box does not start draining at night start. It held flat for the
//      first ~133 s of Night 1 and only then began falling. The engine has no
//      activation term at all -- `tickBox` drains whenever `opts.boxEnabled`,
//      which is a global option and not a per-night rule.
//   2. Full -> empty took about **55 s**, not 16.67 s -- roughly 36 units/s,
//      a factor of 3.3 slower than this constant.
//
// So Night 1 (and plausibly 2-5) is priced here with a night-6/7 drain running
// from a night-6/7 start time. The direction is pessimistic -- the simulator
// demands more winding than the game does -- which is the safer direction but
// still wrong, and it makes any wind-budget claim below Night 6 unsound.
//
// Caveats on the measurement, so it is not over-read: the pie fraction is not
// known to be linear in counter units, 0.626 may be a saturated "full" rather
// than the true maximum, and the activation time is bracketed only to
// 133-142 s at a 9 s sampling interval. What is not in doubt is the sign and
// the rough magnitude of both disagreements.
//
// NOT YET FIXED. The per-night drain groups have not been located in the dump;
// until they are, changing this constant would swap a sourced-but-wrong number
// for a measured-but-unsourced one, and every survival figure in the repository
// is computed against it.
export const BOX_DRAIN_FRAMES = s(16.67);  // full -> empty; night 6/7 rate
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
// Withereds. See docs/android/ANDROID-CAMERA-STALL.md.)
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

// How far each step of the cycle can be moved on its own, in seconds, as a
// magnitude either side of its scheduled time.
//
// [CALIBRATED 2026-08-23 — `node tools/cyclesearch.mjs --steps`: each step was
// shifted alone, with the rest of the pass played perfectly, until one of 200
// seeds died. WIND's early edge hit the sweep's 0.75 s cap without a death, so
// that entry is a lower bound.]
//
// They are lopsided, and two of them are cliffs rather than slopes. On Android
// every office light is gated on `mask = 0` (g75/g84), so a mask still on when
// the hall flash is due swallows the flash and Foxy is never reset. Only about
// three frames separate the two steps, which is the whole reason `mask-off`
// cannot be late and `flash-hall` cannot be early. Both search winners in
// plan 04 widened exactly that gap.
//
// A window is what the game tolerates on ONE input while everything else is
// perfect. Real play is wrong on every step at once, so grading takes a
// fraction of it rather than the edge.
export const STEP_WINDOWS = {
  'monitor-down': { early: 0.450, late: 0.300 },
  'mask-on':      { early: 0.300, late: 0.200 },
  'mask-off':     { early: 0.450, late: 0.050 },
  'flash-hall':   { early: 0.050, late: 0.267 },
  'monitor-up':   { early: 0.150, late: 0.117 },
  'cam-10':       { early: 0.117, late: 0.150 },
  'cam-4':        { early: 0.150, late: 0.150 },
  'cam-7':        { early: 0.150, late: 0.133 },
  'cam-11':       { early: 0.133, late: 0.517 },
  'wind':         { early: 0.750, late: 0.467 },
};

// GOOD takes half a step's window, OK four fifths. Both are judgement calls,
// and both can only tighten a lesson's own tolerance, never loosen it: a drill
// may be more forgiving than the routine, but it must never call an input safe
// when the model says it ends the night.
export const TOL_GOOD_FRAC = 0.5;
export const TOL_OK_FRAC   = 0.8;

// Steps carry their window on the step itself rather than being looked up by
// id, because a window belongs to a *geometry*, not to a name: Phase A reuses
// `flash-hall` with no mask before it, so the cliff that caps it here does not
// exist there. A step with no window is graded on the lesson's tolerance.
for (const st of CYCLE_SCRIPT) {
  if (STEP_WINDOWS[st.id]) st.win = STEP_WINDOWS[st.id];
}

export function stepTol(step, tolGood = TOL_GOOD, tolOk = TOL_OK) {
  const w = step?.win;
  if (!w) return { goodEarly: tolGood, goodLate: tolGood, okEarly: tolOk, okLate: tolOk };
  return {
    goodEarly: Math.min(tolGood, w.early * TOL_GOOD_FRAC),
    goodLate:  Math.min(tolGood, w.late  * TOL_GOOD_FRAC),
    okEarly:   Math.min(tolOk,   w.early * TOL_OK_FRAC),
    okLate:    Math.min(tolOk,   w.late  * TOL_OK_FRAC),
  };
}
