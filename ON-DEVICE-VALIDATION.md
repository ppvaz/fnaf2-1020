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
- `camtrace.py [--expected N] <mp4>` — post-run selected-camera trace from
  the map's lime highlight. It verifies that printed ADB commands became real
  `10 -> 04 -> 07 -> 11` sweeps and can fail a trial when any expected sweep
  is absent.
- `windpct.py [--samples] <mp4>` — post-run CAM 11 pie-gauge meter. It uses
  the presence of the lime winding button to reject other feeds, then measures
  the solid white gauge interior. It does not participate in the timed loop.
- `grade-minus7.py <mp4>` — stable office/mask/camera state report plus visible
  hall-beam pulses. Its hall rule runs before the broad camera/static rule and
  rejects beam-like frames that begin inside an existing camera interval, so
  camera-light flashes do not become false Foxy resets.
- `trial-minus7.sh <name> [cycles]` — selectable-night Minus 7 interaction
  runner (`NIGHT=6th` by default; `NIGHT=continue` is the override). It gates
  the start, then executes one absolute-time device-side schedule. Independent
  safety guards cancel the exact remote driver immediately if the game loses
  focus or after three consecutive non-night screenshots. The fast screenshot
  path captures raw on-device and transfers only HUD scanlines. Neither guard
  chooses or retimes an action. The runner enables ADB touch/pointer overlays
  and grades the pulled recording by default (`DEBUG_OVERLAYS=0` and
  `GRADE_RUN=0` are the opt-outs).
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
- A completed timed input list is not evidence that the game is still alive.
  The 12-cycle endurance attempt died around 38 s, after which its uncancelled
  inputs reached the title and selected New Game. `Continue` was reset to
  Night 1, although the star and 6th Night unlock remained. The Minus 7 runner
  now records the remote shell PID, kills its input children after three
  consecutive non-night screenshots (or one lost-focus sample), force-stops
  the game on every exit, refuses to overwrite captures, and saves a partial
  `-aborted.mp4` when possible.
- The device owner subsequently authorized 6th Night as the available quick
  testing ground. Mask-camp, batch, and Minus 7 interaction tests therefore
  default to `6th`; set `NIGHT=continue` explicitly to use the campaign cursor.
- The bottom ~40 px belong to Android gesture navigation — keep game taps at
  y <= 1020.
- The light input is view-dependent. `(350,615)` activates the camera light
  while the monitor is up, but activates the **left vent light** in the office;
  it does not flash Foxy. The office hall light is `(1200,540)` on this device,
  well inside the hallway hit region; the initially tested `(1400,330)` sat
  near its upper edge and intermittently placed the pointer without a beam.
  A five-coordinate recording (`hall-coordinate-cal`) visibly distinguished
  the green/blue vent light from the circular hall beam. Keep separate
  `TAP_CAM_LIGHT` and `TAP_HALL` coordinates. The hall actuator also needs a
  real hold: a 60 ms swipe placed the debug pointer correctly but produced no
  beam. Neither a longer hold nor a later single attempt cured every
  intermittent in-game lockout. The runner therefore makes two separated
  200 ms and 150 ms attempts across the office window. Together with three
  60 ms camera flashes per five seconds, the worst case is about 106 ms/s
  against the 119 ms/s light budget.
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
- **Minus 7 timing calibration is post-hoc.** Plain taps removed command drift
  but dropped critical transitions. A held-light shortcut caused overlapping-
  touch failures. The first 40 ms asynchronous trial missed a later CAM 10;
  at 60 ms, a late light helper made the next absolute slot catch up only 79 ms
  later and overlap, dropping CAM 04. Direct `/dev/input/event8` injection is
  denied by SELinux despite the shell user's `input` group, and separate
  `motionevent DOWN`/`UP` helpers were slower than one swipe.
- **The default is now a synchronous 60 ms swipe.** On this Moto g56 the helper
  takes about 170 ms, so 190 ms action slots cannot overlap. CAM 10 to CAM 11
  takes 1.14 s instead of the old reliable cadence's 1.38 s. The monitor-down
  animation still gets a dedicated delay before the mask. CAM 10 also waits
  500 ms after monitor-up: shorter gaps were visibly swallowed by the flip and
  left the feed on CAM 11. Shortening either gap trades away input acceptance,
  not camera overhead.
- **The fast default passed a four-cycle 6th Night validation.** The 26.75 s
  `fast-sync60-6th-4c` recording contains all five expected
  `10 -> 04 -> 07 -> 11` sweeps (opening plus four cycles), five camera
  intervals, four momentary mask sequences, and no latched mask. An earlier
  two-cycle run also passed 3/3 sweeps and both mask sequences.
- **The first six-cycle extension exposed a pre-existing hall-coordinate bug.**
  Its first five camera sweeps and box holds were clean, but the supposed hall
  flashes were actually left-vent flashes. W. Foxy attacked at about 28.3 s,
  matching the repeated short-run failure the device owner observed. This was
  an actuator-mapping failure, not evidence against the sweep cadence; the
  runner now sends office flashes to the separately calibrated hall control.
- **The corrected six-cycle default crossed the old failure window.** The
  37.75 s `validated-default-6th-6c` run completed 7/7 selected-camera sweeps
  and all six scheduled monitor/mask cycles, with no Foxy attack or safety
  abort. Five hall beams were visible; both redundant attempts landed during
  some windows, while one whole window remained dark from the game's transient
  light lockout. The post-run gauge stayed in a 52-78% band. This is a bounded
  validation, not yet a full-night clear.
- **Winding is now rate-balanced instead of capacity-seeking.** Nights 6-7
  drain 120 box units/s when not winding and add 300/s while held, so net-zero
  over a five-second cycle is `120*5/(300+120) = 1.429 s`. The fast runner uses
  1400 ms, within one 30 Hz Fusion update of that balance point. Offline gauge
  measurements in the final six-cycle validation stayed around 52-78% and
  never reached 100%.
  By contrast, the old 1700 ms holds reached 100% partway through later holds.
- **The hardened runner passed its 6th Night safety validation.** An exact-PID
  test killed a harmless remote process and its host ADB session. Controlled
  game force-stops then established both failure paths: the raw-scanline guard
  cancels on persistent non-night state, while the independent 70-100 ms focus
  poll prevents queued input from reaching another app if the game process
  disappears outright. A normal two-cycle run completed without false abort,
  pulled its capture, graded it, and left the launcher focused after cleanup.
  That same run reconfirmed that `PRESS_MODE=tap` is observably unreliable: the
  command log was complete, but the recording contained only the opening camera
  interval and one later mask. Keep synchronous `fast-swipe` as the default.
- **Shooter25's bot establishes the in-game alternative for reactive work.** A
  Debian-patched CTFAK extraction of the official PC practice executable shows
  a direct-state Clickteam controller, not a vision bot. See
  [`SHOOTER25-PRACTICE-MOD.md`](SHOOTER25-PRACTICE-MOD.md) for the comparison
  and [`SHOOTER25-BOT-STATE-MACHINE.md`](SHOOTER25-BOT-STATE-MACHINE.md) for
  its controller, office-pan, and actuator reconstruction.

## Next steps

1. Extend the validated synchronous cadence beyond six main cycles before
   treating it as a full-night bot. Keep grading the selected-camera trace and
   gauge; do not treat printed commands as accepted game input. `Continue`
   currently points to Night 1, while 6th Night is the authorized quick testing
   ground. Do not restore the held-light shortcut or asynchronous short swipes.
2. Grab the frame before the static to auto-identify the killer. The
   `gameover` state (red face + bright lower-center text) is implemented.
3. Calibrate `windpct.py` against a deliberately empty-to-full capture if its
   approximate percentages will drive an interactive policy. Keep it out of
   the live Minus 7 loop unless the policy actually needs a branch.
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
