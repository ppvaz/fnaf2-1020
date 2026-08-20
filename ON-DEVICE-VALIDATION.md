# On-device validation (bot over adb)

Started 2026-08-20 with the Moto g56 5G plugged in over USB. Goal: test the
decoded Android model's load-bearing rules against the real
`com.scottgames.fnaf2` build instead of only the event-sheet reading.
Target build confirmed on device: **v2.0.7** (versionCode 26, updated
2026-08-14) — matches the ledger's "release 7" target.

## Validation targets, ranked

1. **Consecutive-tick mask clears** (g292-294): a masked vent visitor should
   need ~5 s of *continuous* mask to be forced out (10%/s early roll), not the
   PC-style sub-second repel. This single rule refuted the whole Minus 3
   family in `tools/minus2test.mjs`; if the device disagrees, that family
   reopens.
2. Double-camera glitch absence (one `viewing` counter, atomic per touch).
3. Right-vent-light Toy Bonnie stall (g428).
4. Vent lights not draining the battery (g284).
5. Office-defense fuse by night (`time allowed` 100..45 frames) and the
   300-frame office sequence.

## Harness (tools/device/)

- `coords.sh` — touch calibration for this device (2400x1080 landscape),
  derived from labeled 100-px grid overlays on screenshots. Regenerate the
  grids per device/resolution.
- `trial-maskcamp.sh <name> <seconds> [continue|6th]
  [wind|nowind|nowind-flash]` — one
  scripted mask-camp trial. `wind` mutes the call, fills the box on CAM 11,
  drops, and masks; `nowind` makes a quick monitor flip and masks around 4 s
  into the recording for a longer window over early vent arrivals;
  `nowind-flash` adds one hall flash before the mask to reset W. Foxy while
  preserving continuous mask from that point onward.
  `screenrecord` captures the run (downscaled 1280x576 @3 Mbps).
- `run-batch.sh <n> [night] [prefix] [wind|nowind|nowind-flash]` —
  back-to-back trials plus event detection per capture.
- `screenstate.py` — classifies live screenshots as `night`, `gameover`, or
  `other`. The game-over signature was checked against all three retained
  W. Foxy captures; jumpscare/static frames remain `other`.
- `find-events.py <mp4>` — frame-diff event locator (stdlib only): prints
  timestamp ranges with sharp visual change (overlays, flips, jumpscares) so
  clears can be timed without scrubbing video.
- `trial-minus7.sh <name> [cycles]` — experimental Night 5 Minus 7 runner.
  It gates only the start of the night, then executes one absolute-time
  device-side schedule; screenshots never participate in the live loop. It
  enables ADB touch/pointer overlays and grades the pulled recording by
  default (`DEBUG_OVERLAYS=0` and `GRADE_RUN=0` are the opt-outs).
- `grade-minus7.py <mp4>` — post-run classifier for Minus 7 screenrecords.
  It reports stable camera, office, and mask intervals and flags masks that
  remain latched for more than one second.

## Hard-won harness rules

- **The Fusion runtime polls touch by frame: zero-duration `input tap` is
  dropped roughly half the time.** Every touch must be a duration press —
  `input swipe x y x y 120`. This explained all the "did nothing" ghost runs.
- Concurrent `input swipe` processes are not independent fingers. Holding the
  camera light while launching camera-button swipes corrupted the input stream:
  a three-cycle trial produced two multi-second mask latches and entered the
  cameras only twice. Keep injected gestures non-overlapping.
- **Interactive driving is impossible**: inference/command latency between
  actions is a game over. Trials are single pre-scripted wall-clock
  sequences; analysis is post-hoc on the recording. A human watching the
  device is the best live observer. Trials enable `show_touches` and
  `pointer_location` by default for a visible touch dot and crosshair; run
  with `DEBUG_OVERLAYS=0` to disable both.
- **Never tap blind.** The script force-foregrounds the game and checks
  `mCurrentFocus` before any input: one unguarded run landed 150 s of taps
  in the Clock app and opened a real alarm's edit dialog (cancelled,
  nothing changed).
- The bottom ~40 px belong to Android gesture navigation — keep game taps at
  y <= 1020.
- A locked phone presents `NotificationShade` as the focused window even
  when the game activity is underneath it. The harness wakes the display and
  asks Android to dismiss an unsecured keyguard, but a secure keyguard must
  be unlocked by the device owner; the focus guard aborts before any tap.
- Title menu: the first press shows the `>>` cursor, the press must land on
  the item's hitbox (`Continue` at (400,730); `6th Night` at (400,880));
  hitboxes sit slightly above the painted text.
- The port swallows inputs briefly around the monitor flip; the mask press
  goes in ~0.3 s after the drop press (still inside the 50-frame night-5
  defense fuse).
- Nights start ~15 s after the press (intro + load varies): scripts must not
  time anything from the press itself; the recording's visible events are
  the clock.

## Findings so far

- **W. Foxy behaves as modeled (qualitative #2).** Three closed-loop 6th
  Night mask-camp trials died at 29/31/31 s to the W. Foxy office lunge
  (killer identified from the jumpscare frame) with the mask continuously on
  from ~11 s — the mask does not deter him, his D grows unflashed, and the
  10 s GOT-YOU cadence lands exactly in the predicted window. This also sets
  the protocol's observation ceiling: ~15-20 s of masked window per trial
  unless the hall is flashed (which breaks mask continuity).
- The closed loop works: `screenstate.py` gates every phase (wait-for-night
  before any tap fixed the too-early MUTE press; death detection ends the
  recording within ~6 s), and a 5 s wind hold fills the box to ~95% (pie
  gauge center ≈ (740, 840), radius ≈ 95 at 2400x1080 — a fill-percent
  meter is a planned upgrade).

- **Office-defense fuse behaves as modeled (qualitative).** Trial 4's mask
  landed ~3 s after the monitor drop — far past the sourced 50-frame night-5
  fuse — and the run died ~6 s after the drop, matching fuse expiry plus the
  300-frame office sequence. A timely mask (trial 5, ~0.45 s) survived the
  same phase.
- Mask-camp segments recorded cleanly (trial 5: ~26 s continuously masked,
  box-empty death at ~48 s). No vent visitor entered the masked window yet,
  so target #1 remains unmeasured — it needs more trials (6th Night has the
  higher AIs and more vent traffic).
- Follow-up no-wind trials masked at ~4 s but still produced no vent overlay
  before W. Foxy attacked (earliest lunge began around recording second 18).
  A single pre-mask hall flash moved the observed Foxy onset to ~24-28 s but
  likewise yielded no vent visitor. A long CAM 11 hold intended to force BB's
  cameras-up-only fourth hop is not viable as one blocking ADB press: office
  danger forced the run down around second 25-29 while the press was still in
  progress, so the mask command arrived after death. Do not restore that
  protocol; a later attempt needs short scripted slices or a real survival bot.
- Custom Night is not yet unlocked on this save (Night 5 + 6th Night only);
  the in-app "Unlocks" menu is paid cheats, not night selection. Character
  isolation therefore waits until 6th Night is beaten (a bot playing Minus 7
  on-device is the fun route to that).
- **Minus 7 timing calibration is now post-hoc.** A four-cycle asynchronous
  120 ms swipe run completed every office/mask/camera transition with zero
  latched masks, but its serial three-camera flow was visibly too slow. Plain
  taps removed command drift but dropped critical transitions. A held-light
  shortcut kept the five-second anchors but caused overlapping-touch failures.
  The replacement cadence keeps reliable 120 ms swipes, spaces the seven camera
  actions 230 ms apart (1.38 s from CAM 10 to CAM 11), and does not wind at
  night start while the box is full.
- **The replacement cadence passed its three-cycle Night 5 validation.** The
  21.83 s `m7n5-spaced1` recording contains all four expected camera intervals,
  three clean office/mask/camera transitions, and zero masks latched longer
  than one second. Every sweep visibly followed CAM 10 → 04 → 07 → 11. Holds
  began with room in the box and ended high/near-full, so the revised runner
  also avoids wasting its opening and cycle time against an already full box.
  Absolute anchors landed within roughly 25-100 ms without accumulating drift.
- **Shooter25's bot establishes the in-game alternative for reactive work.** A
  Debian-patched CTFAK extraction of the official PC practice executable shows
  a direct-state Clickteam controller, not a vision bot. See
  [`SHOOTER25-PRACTICE-MOD.md`](SHOOTER25-PRACTICE-MOD.md) for the comparison
  and the staged recommendation for a separate instrumented APK.

## Next steps

1. Extend the validated 1.38 s sweep from three cycles toward a full Night 5
   run, keeping the stock game as the oracle. Do not restore the held-light
   shortcut.
2. Grab the frame before the static to auto-identify the killer. The
   `gameover` state (red face + bright lower-center text) is implemented.
3. `windpct.py`: percent-fill of the pie gauge so wind holds stop exactly at
   full for diagnostic/interactive tools. Do not put it in the live Minus 7
   loop unless the policy actually needs a branch.
4. Longer term: beat 6th Night and unlock Custom Night, then use character-
   isolated stock runs. For reactive strategies, compare live CV against a
   separately signed, direct-state instrumentation build.

## Bookkeeping

- Captures live in `captures/` (gitignored); delete failed runs immediately —
  raw screenrecords are large.
- Developer overlays (`show_touches`, `pointer_location`) are enabled by
  default whenever `trial-maskcamp.sh` starts and remain in that state after
  the trial. Use `DEBUG_OVERLAYS=0 tools/device/trial-maskcamp.sh ...` to run
  without them.
