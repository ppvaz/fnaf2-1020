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
  camera-light flashes do not become false visible-hall intervals. The count
  is explicitly a rendering lower bound: sourced hall-movement darkness can
  hide a logically accepted Foxy flash.
- `trial-minus7.sh <name> [cycles]` — selectable-night Minus 7 interaction
  runner (`NIGHT=6th` by default; `NIGHT=continue` is the override). It gates
  the start, then executes one absolute-time device-side schedule. Independent
  safety guards cancel the exact remote driver immediately if the game loses
  focus or after three consecutive non-night screenshots. The fast screenshot
  path captures raw on-device and transfers only HUD scanlines. Neither guard
  chooses or retimes an action. The runner enables ADB touch/pointer overlays
  and grades the pulled recording by default (`DEBUG_OVERLAYS=0` and
  `GRADE_RUN=0` are the opt-outs). Clean BB/GF classifier runs must disable the
  global overlays; `POST_CAPTURE_TOUCHES=1` then turns only the touch dot on
  after each raw capture and off before the next, so later hall presses remain
  visible in the recording without contaminating the model input.
- `hid-multitouch-smoke.json` — guarded only by the operator, not a shell
  wrapper: a direct `hid FILE` regression fixture that selects 6th Night and
  verifies hold-light-while-switching-camera reports. Read
  [`HID-MULTITOUCH.md`](HID-MULTITOUCH.md) before using it.
- `screencheck.c` plus `build-screencheck.sh` — static device-local raw-frame
  feature/template classifier. `capture-screen-sample.sh`,
  `build-screen-model.py`, `replay-screen-model.py`, and
  `bench-screencheck.sh` cover labeled capture, model calibration, independent
  holdout replay, and real device latency. See `ON-DEVICE-SCREEN-CHECKS.md` for
  the invocation and safety contract.

## Hard-won harness rules

- **UHID readiness and hybrid contact release are separate gates.** On this
  phone InputReader attaches about 5.1 s after kernel registration; reports
  sent earlier vanish. In a two-contact report, an inactive ID 1 record still
  requires `contact_count=2`, or Linux stops after ID 0 and leaves ID 1 stuck.
  The resulting camera inputs become moves rather than fresh taps. The
  diagnosis, correct packets, kernel trace, and verified two-finger camera
  sweep are preserved in [`HID-MULTITOUCH.md`](HID-MULTITOUCH.md).

- **The Fusion runtime polls touch by frame: zero-duration `input tap` is
  dropped roughly half the time.** Every touch must be a duration press —
  `input swipe x y x y 120`. This explained all the "did nothing" ghost runs.
- Concurrent `input swipe` processes are not independent fingers. Holding the
  camera light while launching camera-button swipes corrupted the input stream:
  a three-cycle trial produced two multi-second mask latches and entered the
  cameras only twice. Keep injected gestures non-overlapping.
- **Host-round-trip interactive driving is impossible**: transferring a frame,
  classifying it on the host, and starting a second ADB command exceeds the
  reaction/cadence budget. The stock-device exception is a branch computed
  entirely inside the runner's existing device shell with `screencheck`; its
  measured cost and remaining calibration gates are below. Trials enable
  `show_touches` and `pointer_location` by default for a visible touch dot and
  crosshair; run with `DEBUG_OVERLAYS=0` to disable both.
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
  real hold: a 60 ms swipe placed the debug pointer correctly but was too short
  to establish a useful visible beam. Later dark windows were initially
  misread as intermittent input lockout. The owned Android event sheet instead
  shows a sourced visual blackout: g875-880 set `hall movement` to 300 frames,
  g202 renders the held hall light dark while it drains, and g489/g745/g855
  still assert Foxy's logical light, reset D, and pin B without consulting that
  counter. The runner therefore waits out the mask-off animation and makes one
  200 ms hall hold. With three 60 ms camera flashes, that is about 76 ms/s
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
  abort. Five hall beams were visible. The other scheduled holds can have been
  hidden by the sourced 300-frame hall-movement rendering blackout, so beam
  count is a lower bound and cannot diagnose input acceptance or Foxy
  protection. The post-run gauge stayed in a 52-78% band. This is a bounded
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
  [`SHOOTER25-PRACTICE-MOD.md`](../in-engine/SHOOTER25-PRACTICE-MOD.md) for the comparison
  and [`SHOOTER25-BOT-STATE-MACHINE.md`](../in-engine/SHOOTER25-BOT-STATE-MACHINE.md) for
  its controller, office-pan, and actuator reconstruction.
- **A minimal stock-device visual path now exists.**
  [`tools/device/screencheck.c`](../../tools/device/screencheck.c) builds to a
  12,680-byte static ARM64 helper and reduces raw `screencap` to color features,
  `match`/`clear`, or a compact nearest-template class entirely inside one
  device shell. No frame crosses USB and no APK/root/runtime dependency is
  added. On this Moto in the 2400x1080 landscape game, 30 interleaved samples
  measured **225 ms combined p95** (206 ms capture, 42 ms classification p95).
  With the existing roughly 170 ms duration press, the estimated visual-plus-
  action path is 395 ms, leaving about 305 ms against the shortest 700 ms BB
  window.
- **The projection path measures 59 ms for the same observation (2026-08-24).**
  The cue helper holds one consented `MediaProjection` producing a 20x9 virtual
  display and answers a device-local socket with the already-classified pixel,
  so a reader pays neither the full-display compose nor the classification. 60
  samples inside one device shell: p50 48.8 ms, **p95 59.5 ms**, p99 60.8 ms,
  max 66.9 ms; the same loop with the socket call removed costs 22.5 ms at p50,
  so the exchange itself is about 26 ms and the rest is the shell forking `date`
  and `nc`. Reproduce with `tools/device/query-cue-helper.sh latency`.

  The consequences are arithmetic on measured parts, not an end-to-end result.
  The visual-plus-action path becomes 59 + 170 = **229 ms**, leaving about
  **471 ms** against the shortest 700 ms BB window instead of 305 ms. On the
  shipped night-6 cycle, whose four observations cost 900 ms of the 5000 ms
  budget, they would cost 236 ms -- about **664 ms/cycle recovered**, which is
  the same magnitude as the entire three-cut schedule optimisation but obtained
  by changing the sensor rather than by removing checks. A `--sync` monitor
  intent that disagrees falls from 415 ms to about 249 ms.

  Two things this does not buy. The read returns the freshest projected frame
  rather than one captured on demand, so its age is reported and a stale frame
  is `UNKNOWN` rather than an observation; and the classifier threshold on this
  path is **not calibrated** -- the luma separation in
  [`ONE-PIXEL-VISION.md`](ONE-PIXEL-VISION.md) comes from `screencap` frames and
  an offline bilinear simulation, not from Android's own VirtualDisplay scaler.
  It also adds a dependency the screencheck path does not have: a consented
  helper that can die mid-night. BB now has independent holdout and live-branch evidence; Golden
  Freddy still lacks an independent positive holdout. Toy Bonnie vision is
  deliberately excluded from the Minus 7 path because its CAM 04 stall already
  controls it. Full build, model, replay, benchmark, invocation, and
  conservative-branch rules are in
  [`ON-DEVICE-SCREEN-CHECKS.md`](ON-DEVICE-SCREEN-CHECKS.md).

## 2026-08-24: a device run where the stalls did not hold

One `PRESS_MODE=hid-multi` pilot run on 6th Night failed on every axis at once:
Withered Bonnie reached the office, Balloon Boy reached the office, and Foxy
ended it. It is recorded because the failure is informative even though the run
was badly configured -- it carried no BB check, and `hid-multi` had not been
validated for this loop.

**The wind was the one thing that worked.** `windpct.py` on that run's capture
shows the box climbing past 80% by 20 s and sitting at 80-100% for the rest of
it. So the failure was not a starved box, and the first reading of this run --
which blamed the box -- was wrong.

**The run failed exactly as this repository already predicted.**
[`HID-MULTITOUCH.md`](HID-MULTITOUCH.md) records that the HID schedule *with no
BB read or response* survives **0/3000** Night 6 runs, "predominantly through
the BB-to-Foxy failure chain". That is the configuration this run used: the BB
check had been dropped to save budget. Balloon Boy reached the office, took the
lights, and Foxy ended it -- the documented chain, start to finish.

Two intermediate diagnoses were recorded here and both were wrong: a starved
box (its box was at 80-100%) and a short-press actuator failure (`hid-multi` is
smoke-tested for two-finger tap sequences). Neither was needed. The same page
also says CAM 05 is *not* the Night 6 checkpoint -- the device-validated
classifier is the lit left opening, which does not consume flashlight battery --
so the run chose the wrong check as well as removing it.

A *different* run the same evening -- `PRESS_MODE=fast-swipe` with
`BB_CAM05_CAPTURE_EVERY=4` -- did starve, and its trace is the clean measurement
of the overhead cost. Full 1.5 s winds held 52-75% for seven cycles, then
truncated to 0.67 s on a roughly 20-second cadence, exactly the capture period,
after which the baseline fell 52, 42, 29, 25, 18, 14, 10 percent and never
recovered. A 206 ms screencap against a cycle with about 680 ms free starves the
wind, and the loss compounds because a short wind leaves less box for the next
cycle to protect.

Two consequences worth carrying. Adding an observation to this loop is not free
and must be priced before it is scheduled; and the cue helper's device-local
read at 59 ms exists precisely so an observation need not cost a screencap. The
helper now also reports the CAM 05 feed region as a block of the same 20x9
frame it already captures, so that path no longer requires one.

## Simulating the pilot (2026-08-20)

`tools/pilottest.mjs` replays `trial-minus7.sh`'s millisecond table in the
sourced engine with no state reads, so schedule changes can be judged without
spending a night on the phone. The shipped blind schedule dies **200/200 to
Foxy**, with Balloon Boy as the cause rather than the recorded killer.

> **Corrected 2026-08-20.** BB has no direct office death. At marker 123, g96
> forces `lit?` to zero every frame and g301/303 stop the vent lights answering.
> He permanently removes every flashlight; Foxy's unreset D then ends the run.
> An 80-cycle phone trial reproduced the chain at ~138 s: BB was visible in the
> office, the scheduled mask flick and hall presses still landed, no beam
> appeared, and W. Foxy attacked. The older “BB walking in kills” wording
> confused cause with death event.

Adding the one observation the phone can actually make — flash the left vent
light with the cams down and classify one screenshot (g289 draws BB at the
opening, g287 draws it empty) — plus a mask hold long enough for g294's five
consecutive masked ticks:

| Schedule | Result |
| --- | --- |
| blind, as shipped | 0/200 — 200 Foxy deaths after BB removes the lights; min box 59%, min power 2460 |
| + vent check | 0/200 — BB/Foxy chain removed, but 87 desynced-raise Golden Freddy deaths and 113 deaths to the seven; min box 0% |
| + vent check + monitor sync | 0/200 — BB/Foxy chain remains removed; remaining deaths are the seven during the response window |
| + Markiplier eviction | 0/200 — worse: 177 Foxy deaths and 200 unnecessary evictions; min power 2252 |

The vent observation is mechanically useful but not a complete strategy. It
removes BB and the Foxy chain; the long response then exposes another failure
mode. The monitor-sync row also depends on an observation that the current
phone runner does not yet make.

### Teaching the pilot Balloon Boy (2026-08-20)

Two input gates were missing from the engine, both about *reachability* rather
than effect, and both flattering the pilot: the mask could go on with the
monitor up (a state the game has no way to reach), and while masked every
other control still answered, when g75/g84 leave a masked player nothing but
taking the mask off. `press()` now drops both, and the human control is
unaffected — `bbtest` never used either, which is the point.

With those in place the vent check's 87 Golden Freddy deaths turned out not to
be a Golden Freddy problem at all. Every one of them landed on the *first*
press of a cycle, the one the table means as "cams down". A sourced forcedown
(g141, executed on the monitor by g262) had already dropped the monitor
underneath the schedule, so that press — a bare toggle — **raised** the cams
instead, into an office where Golden Freddy was waiting, and g777 killed. The
schedule was desynced from the game and had no way to notice.

`--sync` makes the two monitor actions *intents* rather than presses: the
pilot spends one screenshot on the monitor state and presses only if the state
disagrees. The look can be taken early and the decision is a skip, not a timed
reaction. `screencheck` makes its cost feasible, but no device runner currently
implements or validates this state-sync branch.

The Balloon Boy -> Foxy chain is the thing being broken here, and it is worth
stating exactly: BB reaches the office (marker 123), g96 and g301/303 take
every light away, the hall can no longer be flashed, Foxy's D runs past 3 and
he collects. Foxy is the killer; BB is the cause. Over 1000 nights per row:

| Schedule | Foxy deaths | BB reached the office | BB->Foxy chain | Median depth |
| --- | ---: | ---: | ---: | ---: |
| blind, as shipped | 1000/1000 | 1000 | **1000** | 48 s |
| + vent check | 2/1000 | 1 | 0 | 54 s |
| + vent check + `--sync` | **0/1000** | **0** | **0** | 58 s |
| + vent + `--sync`, worst-luck | **0/1000** | **0** | **0** | 48 s |

The chain is gone, under pinned worst-luck RNG as well as normal seeds: Balloon
Boy never reaches the office, so Foxy never collects a run because of him. The
blind schedule's Foxy deaths were never really Foxy's.

`node tools/pilottest.mjs 200 --vent --sync --assert` guards exactly that
claim and nothing more — it asserts BB never gets in and no Foxy death follows
him, and deliberately does **not** assert survival. It runs in
`tools/test.mjs --engine`, normal and `--worst`. The blind schedule fails it
200/200 by construction, which is the check working.

What is left is one mode. Every remaining death is the seven walking in during
the response's 6.4 s cams-down window, where their entry timers run to
completion. Best single night rose 92 s -> 98 s of 420. Real progress, and
nowhere near a win: the response buys Balloon Boy at a price the seven collect.

**The device script is deliberately untouched.** The phone can now classify a
frame within the timing budget, but the exact monitor-state model, holdouts,
and capture-to-skip/press integration have not been validated. A simulator
result is not authority to edit the proven open-loop runner.

**The eviction does not transfer to an open-loop pilot.** Spending the sourced
700 frames of hall light only evicts Foxy if he is actually in the hall while
it runs, and it only pays for itself if BB's forced mask window lands inside
the 500-999 frame nap. Markiplier can arrange both because he hears BB's
laughs and reads the hall; a pilot holding one vent screenshot per cycle knows
neither, so it burns the power and takes the exposure anyway.

The old “clearing BB costs about 8 s” argument is withdrawn. It priced five
mask ticks as a flat five seconds, but g907 increments on one-second event
boundaries: five ticks span 4.017-5.000 s depending on phase. The response's
monitor-down portion is 6.4 s against a 6.67 s stall, so the previous claim
that one interval *must* be uncovered does not follow. The current table pays
the worst phase and has not been aligned to recover that possible second.

What *is* measured is narrower: the vent check removes BB and the Foxy chain,
yet all 200 modeled runs still die to the seven during the long cams-down
response. A CAM 05 check one move earlier may give the policy time to prepare,
but it is a separate visual model and still needs real positive/negative frames.

### The night the phone actually plays (2026-08-23)

Every table above was measured on 10/20, because that was the only night the
engine had: it read one 15-AI cap for the seven and a 17 for Foxy. The AI table
is now sourced per night *and* per hour — g673 zeroes the counters, g674-684
write the table, g787 copies the Custom Night dials, g804 zeroes Golden Freddy
below night 6, g815-821 set the Puppet, and g829/g830/g856-863 cap the result.
Rebuild it from the dump with `tools/dump/aimap.py`; `pilottest --night=6`
replays the same schedule against the night the runner actually selects.

6th Night is two rows, and only the second is 10/20-like:

| | 12 AM | 2 AM |
| --- | ---: | ---: |
| W. Freddy / W. Bonnie / W. Chica | 5 | 10 |
| W. Foxy | 10 | 15 |
| Toy Freddy / Toy Bonnie / Toy Chica | **0** | 5 |
| Mangle | 3 | 10 |
| Balloon Boy | 5 | 9 |
| Puppet | 15 | 15 |
| Golden Freddy | 1 in 10 | 3 |

400 nights per row; 2 AM lands 140 s into a 420 s night:

| Schedule | Cleared | Median | p95 | Best |
| --- | ---: | ---: | ---: | ---: |
| night 6, blind (what the phone runs) | 0/400 | 118 s | 180 s | 228 s |
| night 6, + vent check | 0/400 | 149 s | 194 s | 254 s |
| night 6, + vent + `--sync` | 0/400 | 158 s | 220 s | 265 s |
| 10/20, + vent + `--sync`, for comparison | 0/400 | 58 s | 78 s | 98 s |

**The model and the phone now agree on a number.** 388 of the blind schedule's
400 night-6 deaths are the Balloon Boy -> Foxy chain, and the retained 80-cycle
device trial died to exactly that chain at about 138 s — inside this
distribution, one second under its p75. That is the first quantitative
agreement between the simulator and a recorded night on the device, and it was
not available while the engine could only play 10/20, where the same schedule
dies at a 48 s median.

**6th Night is deeper, not winnable.** The lower early AI roughly triples how
far the schedule gets, and it moves the failure across the 2 AM cliff: blind,
286/400 nights end before 2 AM; with the vent check and `--sync`, 248/400 end
after it. What kills those runs is the seven at marker 123 (358 of 400) and the
Puppet (42) — and the Puppet is new. He is the price of a 6.4 s cams-down
response that does not wind, which 10/20 never charged because nothing survived
long enough to run out of box.

So the answer to "does the night the device selects rescue the shipped
schedule" is no. It buys about two extra minutes and hands the remaining
problem to the 2 AM step-up, where the three Toys switch on at once.

## Superseded visual prototype and retained negative searches

The remote research branch first tried to average a few screenshot rows with
device shell processes. It established the correct architecture but not a live
solution: host `screenstate --adb-fast` took 692-785 ms, pulling/averaging a
rectangle took ~3.3 s, file-based on-device shell averaging took 404 ms, and a
streamed `dd | od | awk` form reached 230 ms with a ~245 ms screencap floor.
In a live trial all fourteen probes returned unavailable and the unpinned form
pushed the schedule about 500 ms late. Those region scripts are intentionally
not merged; the single-process native `screencheck` supersedes them while
retaining their useful “capture and branch locally” boundary.

Three pure simulator reports are retained so the unsuccessful policy ideas are
not repeated:

- `phasesweep.mjs`: cams-down phase can defer BB's latched final hop but no
  200 ms alignment eliminates office arrivals (best was 61/200 overall and
  66/200 among phases where the interval lands cams-down).
- `periodicsweep.mjs`: a blind full response every third/fourth cycle keeps BB
  out, but the mask blocks the hall and the policy dies sooner (about 30 s
  median versus 48 s).
- `flicksweep.mjs`: blindly dropping the Golden Freddy flick loses 199/200 at
  a 13 s median, so a blind schedule cannot buy time that way. A visual policy
  may skip it only on a proven-empty office frame.

### Device-local BB branch checkpoint (2026-08-23)

The native left-opening model has now passed two untouched live holdouts,
including simultaneous translucent Golden Freddy interference. In run K the
device captured one safely lit left-vent frame per cycle before the hall,
classified BB and a provisional GF model from that same raw frame, and masked
42 ms after the second classifier reported the cycle-7 BB positive. The saved
frame visibly contains BB; offline native replay reproduced seven empty results
and the positive at the original `score=0 margin=18`. Cleanup force-stopped the
game before the hall or any large transfer.

The run also prices the unfinished response: eight complete selected-camera
sweeps and 11 rendered hall-beam intervals accompanied a run in which Foxy
remained controlled, but the decomp proves that count under-reports logically
accepted flashes during hall movement. Meanwhile, 1.3 s winds in the 6.5 s
visual cycles drove the music box from full to 9.5% by cycle 7. The branch
therefore remains a safe detection/collection path, not a full BB clear and
resynchronization policy. An earlier run that waited until cycle 8 to sample
died to Foxy around 42 s and captured only post-kill static (`unknown`), which
is why threat sampling now begins at cycle 0 during validation runs.

## Availability of calibration targets

`tools/dump/aimap.py` on the owned canonical Office sheet makes a prior null
Golden Freddy recording unsurprising, but does not prove he was unavailable.
At the start of Night 6, one run in ten assigns him AI 1 and the other nine
assign 0; 2 AM overwrites either result with AI 3. Even on the enabled early
run, each office-spawn check is only AI/20. Custom Night applies the dial and
g830 caps him at 10, making 10/20's office roll 1/2, but Custom Night remains
locked on this save. Night 6 also raises BB from 5 to 9 at 2 AM. Golden Freddy
can supply positives, but sparsely. Toy Bonnie needs no capture for this Minus
7 branch because the selected CAM 04 stall already controls him.

## The classifier has to be trained on the loop that will run it (2026-08-24)

Four Night 6 attempts read `bbinside` or `unknown` on cycles where Balloon Boy
provably could not be present -- he needs five five-second rolls, so nothing
before 25 s is him. None of those reads were the game. Measuring the ROI of the
frames the classifier actually saw separates the two populations cleanly:

| frames | LIGHT button mean luma | vent-opening mean luma |
| --- | ---: | ---: |
| the model's templates, and every `empty` read | ~103 | ~30 |
| every `unknown` read | 33-60 | 37-63 |

`candidate-runs-gh.scm` was built from `capture_lit_at`, which issues
`screencap` a fixed 350 ms after light-down. The live loop instead starts the
capture at a chosen offset and latches on the first output byte, 163-348 ms
later, so the capture start is the only control over where in the vent-light
ramp the frame lands. Moving it to avoid one failure moved the frame out the
other side of the distribution and produced the other:

- start +100 ms -> latch 263-448 ms; mostly `empty score=0`, but the early tail
  catches an unlit opening, and an unlit opening is what BB *in the office*
  looks like, so it reads as a confident `bbinside`;
- start +300 ms -> latch 550-650 ms; past the ramp, and reads go `unknown`.

The fix is not a third offset. `runtime-gh.scm` adds seven frames captured
through the live loop itself, at both latch windows, to the `empty` class.
Leave-one-out separation holds at `--max-score 16` (empty same-class 0..15,
margin 6..19), and both models classify **all 32 independent holdout frames
correctly, including all three BB positives**, so the widened class costs
nothing measurable. Only frames from before 25 s were used, so the label is
certain rather than assumed.

`--max-score` moved from 12 to 16, which makes the model more permissive in
absolute distance. `--min-margin` is unchanged at 6, and the margin is what
separates the classes; the score bound only decides what is far enough from
everything to be `unknown`.

Rebuild it with:

```sh
tools/device/build-screen-model.py --roi 80,600,500,1060 --grid 10x10 --step 2 \
  --max-score 16 --min-margin 6 \
  --output captures/screencheck/bb-left/models/runtime-gh.scm \
  empty=captures/screencheck/bb-left/calibration/run-gh/empty \
  empty=captures/screencheck/bb-left/runtime-empty \
  bb=captures/screencheck/bb-left/calibration/run-gh/bb \
  inside=captures/screencheck/bb-left/calibration/run-gh/inside
```

## 2026-08-24, second session: what was found, and one retraction

Forty device runs. The honest result is **no night 6 clear and no new record**:
the longest graded survival was **120.5 s** (night 6-34) against the 138 s already
on file. Read that first, because two numbers from this session were published
before they were graded and they were wrong.

### Retraction: the 163 s and 153 s "records"

Nights 6-36 and 6-37 were reported at **163 s** and **153 s**, both "past 2 AM", the
first past the standing 138 s record. Graded with `grade-night.py` they are
**26.0 s** and **72.2 s** alive. The remainder was the pilot pressing into a
dead game. The retained classifier frames show it directly: the death static,
the "Take cake to the children" minigame, and a "12:00 AM 6th Night" restart
card, all inside the interval that was quoted as survival.

Two independent failures let that through, and neither was subtle:

- **The watchdog's fast path could only recognise one way of being dead.** A cue
  helper snapshot with `rms=0`, `luma>=200`, `cam5>=200` is the static screen,
  measured across night 6-34's death. Wired as `if (static) gameover else night`
  it answered "night" to the minigame, the restart card and the title menu. A
  detector that knows one way to be dead must never be the thing that says you
  are alive; it may only *add* a detection. `screenstate.py`'s HUD predicate --
  flashlight meter or mask bar -- correctly rejects all three, and is the
  authority again. `test-runner-plan.mjs` now fails if the helper branch of
  `state_once` can print "night".
- **The grading step had been running against a file that does not exist.**
  `GRADE_RUN=1` graded `"$OUT.mp4"`; every run that ends in an abort saves
  `"$OUT-aborted.mp4"`. So for the whole session it printed nothing and looked,
  in the log, exactly like grading. `screenstate.py` could have refuted the
  163 s claim from any single frame of that recording. Nobody ran it.

`tools/device/grade-run.sh` exists because of this: one pipeline that finds
whichever capture exists and runs every instrument -- survival, the HID trace
auditor, camtrace at 60 fps, sweepcheck, windpct, grade-minus7 -- and prints one
verdict. The runner calls it. See CLAUDE.md, "Instruments are not a pipeline".

### Defects found and fixed, each with its evidence

- **`hid` rejects a zero-length delay outright.**
  `IllegalStateException: Delay has missing or invalid duration`, the process
  exits, mksh loses the co-process, the night ends at the next write.
  `plan_emit`'s `hallraise` emitted the light lead unguarded and that lead is 0
  in the shipped geometry, so the hall light was pressed for 0 ms and released.
  The device owner saw it before any log did: "fails to press hall light and
  moves the vision instead". Written up as Trap 3 in `HID-MULTITOUCH.md`, gated
  four ways.
- **The watchdog was blind by construction.** Its capture budget was 0.8 s
  against a measured idle cost of 0.72-0.85 s, so it timed out on essentially
  every poll and printed `unavailable (ignored)` for a whole night. Raised to
  2.5 s and validated under recording load (6/6, where the old budget failed
  even then). Sustained blindness now aborts rather than being ignored forever.
- **The watchdog was starving the classifier.** Polling every 0.25 s while each
  poll costs ~1 s meant it captured almost continuously, competing with the
  classifier's own `screencap`. Night 6-23 read `unknown` on 7 of 8 cycles under
  that contention; the same schedule with the watchdog quieted read
  `empty score=0 margin=19` on 4 of 4.
- **The plan overran its own cycle boundary.** Both steady cycles ended on a
  sweep finishing 5007 ms into a 5000 ms cycle, so the next anchor's monitor
  press landed on the sweep's final camera release. Anchoring the sweep's *end*
  in the emitter removed the overrun entirely.
- **Camera selects were arriving inside `MONITOR_ANIM_UP`.** `engine.js` drops a
  select unless the monitor has finished raising, and the attack cycle asked for
  one exactly 200 ms after the raise -- zero margin against a 204 ms sourced
  animation, deterministic in the engine and a coin flip on a phone whose
  wall-timed anchors land 49-93 ms late. `test-device-input-gaps.mjs` gates it
  against the sourced constant, derived rather than restated.

### Measurements worth keeping

- **`wait_until` overshoots by 49-93 ms**, median 77, because `sleep` and `date`
  are fork+exec here (`sleep 0.02` costs 75 ms wall; one `date` fork ~25 ms).
- **`hid_delay` holds +/-2 ms**, stdev 0.76, measured from the kernel's own
  `getevent` timestamps over 60 contacts. That 25x gap is why the macro exists.
- **The cue helper answers in 42 ms p50 / 57 ms p95**, against ~225 ms for
  `screencap` + `fnaf-screencheck`. The runner had *no* helper integration at
  all until this session; every read was the expensive path, which is why it can
  only afford one read per five-second cycle -- and why Balloon Boy is only ever
  seen once he is already inside.
- **Sweeps are landing.** `sweepcheck.py` reports 11/11 sweeps flashing all of
  CAM 10/04/07 in a real night. camtrace disagreed with "4 complete, 4
  incomplete", but at a *finer* dwell floor it reported more incomplete starts,
  not fewer -- it grades the ordered sequence, not whether the stun was applied.
  A 140 ms spacing was built on the strength of camtrace's reading and then
  withdrawn when the control refuted it; the emitter can still widen (the route
  tolerates 140 with the sweep's end anchored, 400/400, and collapses at 160)
  but 120 remains what ships.

### Golden Freddy is ignored on night 6, deliberately and temporarily

The always-taken mask flick is not a Balloon Boy precaution -- it is the Golden
Freddy clear that the strategy's order rule demands before the hall flash. But
it is a *guess*: two blind mask toggles every cycle in a runner that cannot see
the mask's state, and a dropped toggle latches the mask on and makes every later
left read dark, which the model scores a confident `bbinside`. Priced over 1000
night-6 runs: **1000/1000 with the flick, 478/1000 without**, and every one of
those 522 losses is "raised the monitor with Golden Freddy in the office" with
the earliest at **149 s** -- after the 2 AM step-up. Ignoring him is free for
1000/1000 runs up to 2 AM and the device has never survived past 121 s.

This must be revisited before any attempt that expects to pass 2 AM. Golden
Freddy should be identified, not guessed. The provisional model classifies 22/22
correctly but at a margin of **3** where Balloon Boy's is 18-21, and both its
positives come from a single appearance. Runs now retain every non-empty
classifier frame under `captures/screencheck-keep/<run>/` plus a continuous
~14 Hz cue trace, because he is one run in ten before 2 AM and cannot be
requested, only caught.

### What actually killed the forty runs, and a corrected cause

`tools/device/death-census.py` pulls the death frame out of every recording on
disk and tiles them. Across 33 nights with an identifiable ending:

| killer | count |
| --- | ---: |
| Withered Foxy | 19 |
| Puppet | 3 |
| Golden Freddy | 2 |
| no jumpscare (aborted on cams, or masked) | 9 |

**The obvious reading of that is wrong, and the clock is what refutes it.** Foxy
at 79% invites the documented BB->Foxy chain -- BB reaches the office, g96 takes
every light, the hall cannot be flashed, Foxy's D runs out. But the alive times
cluster hard: median 30 s, and **12 of 33 die between 28 and 32 s**. Balloon Boy
cannot reach the left opening before 25 s and needs at least another five-second
roll to be inside, so he has not taken anything yet.

29-31 s is a constant this page already recorded, long before the pilot existed:
"Three closed-loop 6th Night mask-camp trials died at 29/31/31 s to the W. Foxy
office lunge ... the mask does not deter him, his D grows unflashed." A death
there is Foxy killing **unflashed, from the start** -- the hall flash never
reached him.

Which is what a monitor desync does. With the cams up, the hall press at
(1200,540) lands on the camera map, not the office. The device owner reported
that directly before any log showed it -- "haven't seen any hall light",
"started panning view instead of flashing" -- and the desync detector added this
session confirmed it in-run: cams=down, cams=down, then cams=UP-DESYNCED and
never down again.

So the ordering of causes is: **desync -> no hall flash -> Foxy at ~30 s**, and
the BB->Foxy chain is the *later* failure that only the runs which outlive the
Foxy window ever reach. Night 6-34 is the one that reached it: 120 s, and its
death frame has Foxy's face and Balloon Boy's balloon in the same shot.

The 3 Puppet deaths are box starvation. The 2 Golden Freddy deaths are the risk
being knowingly carried while he is ignored.

### Which press desyncs, and why (2026-08-25)

The paragraph above says a desync is what happens; it does not say which press
is lost or how often, because until now nothing measured that. The artifacts
already on disk do: the HID trace is what the phone was sent, and the recording
is what the game then did. `tools/device/desync-scan.py RUN` lines the two up
and grades the intervals between presses. It is in `grade-run.sh`, so it runs
on every graded run from now on.

Across the 28 nights that have both a trace and a readable capture, **14
desynced and 14 held**. Every one of the 14 is a single monitor press the game
did not act on, and they are not spread evenly over the schedule:

| the monitor press followed | landed | lost | not readable |
| --- | ---: | ---: | ---: |
| **a mask press** | 23 | **9** | 0 |
| a wind hold | 29 | 3 | 56 |
| a hall hold | 67 | 1 | 2 |
| the vent light | 97 | 0 | 3 |
| the mute press | 28 | 0 | 0 |
| **another monitor press** (the in-cycle correction) | 0 | **1** | 0 |

The mask seam has a threshold, and the runner was scheduling under it:

| monitor press, after the mask press | landed | lost |
| --- | ---: | ---: |
| under 140 ms | 2 | 5 |
| 140-180 ms | 4 | 4 |
| 180-220 ms | 11 | 0 |
| over 220 ms | 6 | 0 |

Nine of fourteen desyncs are that one instruction pair, at 100-178 ms. Nothing
at or past 180 ms was lost in 17 tries. The reason is visible in any retained
mask frame: **while the mask is up the monitor bar is not drawn.** Only the
pink mask bar occupies the bottom strip, so a monitor press during the mask-off
animation has no control under it. `MASK_ANIM_OFF` is 15 frames (244 ms), and
the engine's `setMask(false)` clears `maskOn` on the press and leaves the
animation running as decoration, so `press()` accepts a monitor press the phone
throws away. The simulator cannot fail this way; only the phone can.

**The emitter's contract passed every one of these presses.** That is the
control, and it is the part worth keeping: `test-hid-trace.mjs` audits nights 6-10, 6-12 and 6-14 and reports no defect at 8.41 s, 8.41 s and 8.47 s -- 35, 76 and
78 ms released, all above `MIN_RELEASED_MS` -- and the game ignored all three.
It does flag nights 6-22 and 6-28 at exactly the blamed press ("only 0 ms released
between 144,270 and 144,801"), which is the auditor working. A legal stream is
not an accepted one, and the two floors are answering different questions.

Two thirds of this exposure is already gone by accident rather than by
decision: dropping the Golden Freddy flick removed the clear cycle's mask
instruction, so the pair that cost nights 6-10 to 6-28 is no longer scheduled. What
the shipped plan still has is `attack`'s `5917 tap mask` followed by
`6127 hallraise` -- **210 ms**, inside the band that has not lost a press yet
but only 30 ms above one that has.

The other two live seams are smaller and both real:

- **34 ms is the plan's spacing before the hall-flash pair** (`2717 tap monitor`
  after a wind hold ending at 2683, `3267 tap monitor` after a hall hold ending
  at 3233), which is one Fusion poll and the floor `test-recipe.mjs` asserts.
  Three of the fourteen desyncs are there -- nights 6-33, 6-35 and 6-37. Most of
  those windows cannot be graded -- 550 ms is shorter than the flip animation
  inside it -- so the rate is not measurable from these runs; what *is*
  measurable is that the office rendered in 109 of 113 scheduled hall-flash
  windows, so the pair usually lands. Designing to the floor is what makes the
  failures cluster there. (Night 6's loss is the same disease in a geometry the
  runner no longer uses: its monitor press went down while the wind contact was
  still held.)
- **The in-cycle correction can cause the desync it looks for.** Night 6-38:
  the anchor's monitor press at 12.132 s, the cue helper's read 247 ms later
  reporting the cams still up -- which they visibly were, because
  `MONITOR_ANIM_DOWN` is 367 ms and the flip was still running -- and a
  "corrective" press at 12.379 s that the port dropped for the same reason.
  One press, one desync, and the run spent its remaining 58 s inverted. A
  monitor observation taken inside `MONITOR_ANIM_DOWN` of a monitor press is
  not an observation of anything.

  **Fixed 2026-08-25**, and the gate is measured rather than assumed. The
  retained cue traces already contained the answer: across nights 6-36 to 6-38, after
  a lowering press the helper still reported `luma >= CUE_CAMS_UP_LUMA` up to
  **+202 ms** and never later, so `light_down_at` now waits
  `LAST_MONITOR_PRESS_MS + MONITOR_ANIM_DOWN_MS` before it samples -- about
  165 ms of margin over the worst observed case. It was never going to be free:
  the read slips by the anchor press's own lateness, 110-180 ms, which the
  plan's 416 ms of slack before the next instruction absorbs.

  Two things had to move with it. `READ_CAPTURE_DELAY_MS` is a position in the
  vent-light ramp -- the only control over where the classifier's frame lands,
  and moving it is what produced the `bbinside` and `unknown` misreads -- so the
  capture is now placed from when the light actually went down rather than from
  the plan's offset. It was not: with the correction pushing the light 467 ms
  late, the capture had been firing *before the light was down*. And
  `light_down_at`'s own `offset`/`label` came back clobbered from `press_at`,
  because the runner's functions share one scope, so the vent light's log line
  read `monitor-verify (contact 0 down)`. `test-plan-interpreter.sh` covers all
  three: the gate, a genuine desync still being corrected, and the first read of
  a run not waiting for a flip that never happened.

Survival does not separate the two groups in this sample and should not be
claimed to: among runs alive 20 s or longer the median is 30.5 s desynced and
30.2 s held. What separates them is what the run was still capable of -- an
inverted pilot flashes the camera map instead of the hall, reads the feed
instead of the vent, and stops winding -- and the longest run on disk
(night 6-34, 120.5 s) is one whose model held.

### Night 6-40: the gate on the phone, and what is left (2026-08-25)

The flip gate's first device run. **110.5 s alive, and `desync-scan.py` reports
the pilot's model of the monitor held for the whole graded interval** -- the
second-longest run on disk and the first long one with no divergence at any
readable interval. Nineteen consecutive reads came back `empty score=0
margin=19` with `cue[luma=0..102]`, the office, and no `cams still up at the
read` line fired for 97 s. The gate costs more than predicted: the read's light
now goes down about 700-810 ms into the cycle against the plan's 367, because
the anchor press lands ~300 ms in rather than the 130-180 the older traces
suggested. It still clears the next instruction by ~380 ms, and the box never
starved -- `windpct` has it between 80% and 100% the whole way, 71.9% at 115 s.

The one correction that did fire is the fix working rather than the bug: at
97.57 s the post-gate sample read `luma 255`, the classifier agreed
(`cams=UP-DESYNCED`), and the recovery put the cams back down. Compare night 6-38, where the same code sampled 214 ms into a flip and invented the desync.

What caused it is the seam this session did not touch. `test-hid-trace.mjs`
flags **three 0 ms released cam7 -> monitor presses** in this run, at 22.16 s,
37.20 s and 97.14 s: the sweep's final camera release and the next anchor's
monitor press in the same instant. Two landed, the third did not. That is the
same overrun as nights 6-22 to 6-24 in a different place, and it is now the largest
remaining source: the mask seam that cost nine nights is no longer scheduled,
and the flip gate has taken the corrector out.

The run then died the way the census says these runs die. At 105 s the
classifier read `bbinside`, and the game left the night state at 113 s.

### `bbinside` is not a threat to respond to

The class was called `inside` until 2026-08-25, which is what every run log and
retained frame before night 6-40 says. It was renamed because the name has to
survive the next occupant: a dark left opening is the only thing the sensor
sees, and any future blackout will land in the same class. The label is ours,
not sourced -- the event sheet speaks in markers (122 at the opening, 123 in the
office) and never says "inside" -- so it lives in the `.scm` models, which are
untracked. The three bb-left models were relabelled in place and the holdout
replay is byte-identical: 32/32 correct at the same scores and margins.

Until night 6-40 a `bbinside` read fell through to the catch-all, failed closed,
and spent the five-tick mask on it. That is wrong, and the sourced engine says
so plainly: the mask returns Balloon Boy from the *opening* (marker 122), but
once he is at 123 "g96 forces `lit?` to zero every frame ... and **no group ever
moves him back out**. Foxy finishes the job." `bb.inside` is set once and never
cleared, so the flashlight is gone for the rest of the night, the hall can never
be flashed again, and the run is already lost when the read comes back.

So the runner now stops on `bbinside` (exit 49) instead of masking. Masking there
spends wind and exposure on a state the mask does not address, and the only
thing the extra cycles produce is a longer recording of a dead night -- which is
exactly what made nights 6-36 and 6-37 read as records.

### The in-cycle correction fires on a flash (2026-08-25)

With the seam refuted, the desync's live evidence points at the corrector again
-- and this time the number is in the traces rather than in the auditor.

The gate added earlier fixed *when* the correction samples. It did not fix that
**one sample decides**. Steady cams-up is a tight band and saturation is a
separate, short-lived population:

| | nights 6-40, 6-41, 6-42 |
| --- | --- |
| steady cams-up band | **225-250**, median 227 |
| saturated `luma 255` | runs of 1-2 samples; 24-36% are already below 180 by the next sample |

Both clear `CUE_CAMS_UP_LUMA` (180), so the correction cannot tell them apart.
**Every correction on file triggered on 255**, and 255 never appears beside a
classifier read -- the reads carry 0, 102, 226, 227. That is the shape of a
camera light pulse or a hall flash washing the sensor pixel, not a monitor that
is up.

Night 6-42 is the sequence: correction at 17.876 s on a `luma 255`, resync at
20.098 s, resync at 29.875 s, and `desync-scan.py` calls it permanently inverted
at 30.38 s. Night 6-38 died the same way and the fix then was the timing gate.

So the correction now takes a second reading and only spends a press if that one
is high too. It costs 59 ms against the ~416 ms of slack the plan leaves before
the next instruction, and a transient does not survive it; a rejected transient
is logged rather than silently dropped. `test-plan-interpreter.sh` covers it --
a one-sample flash must not be corrected, a genuine desync still must be.

This is a hypothesis with a mechanism and a control, not a confirmed cause: it
has not yet run on the phone. The next night is the test.

### Retraction: the "0 ms released" cycle seam was the auditor's clock (2026-08-25)

**`test-hid-trace.mjs` cannot time a boundary the runner waits through, and its
zero-gap flags at the cycle seam are artifacts.** Everything above that blames
"the sweep's final camera release and the next anchor's monitor press in the
same instant" -- including calling it *the largest remaining source* -- rests on
those flags.

The auditor advances its clock on emitted `delay` records and takes
`now = max(now, mark)` on a mark, so the clock can never be pulled back. It does
run ahead, because the runner spends host-side `wait_until` time between actions
and that emits no delay record while every emitted delay still advances the
clock. Once it is ahead, every corrective mark is discarded:

| run | marks discarded | worst drift |
| --- | ---: | ---: |
| night 6-40 | 68 of 252 | 1637 ms |
| night 6-41 | 10 of 36 | 178 ms |
| night 6-42 | 56 of 130 | 2742 ms |

Measured from the marks instead -- the runner's real clock -- the flagged seams
are not close calls:

| flagged as | real released time |
| --- | ---: |
| night 6-40 @ 22164 ms | **157 ms** |
| night 6-40 @ 37205 ms | **187 ms** |
| night 6-40 @ 97142 ms | **112 ms** |
| night 6-42 @ 12499 ms | **282 ms** |
| night 6-42 @ 52353 ms | **218 ms** |

All are far above the 33 ms Fusion poll the plan is designed to. `run_macro`'s
`FUSION_POLL_MS` seam delay works exactly as `test-runner-plan.mjs` asserts; the
auditor simply cannot see it. The same defect produced the `contact 0 at
1033,157 held 0 ms` vent-light flags, which were briefly taken as the cause of
night 6-41's dark lamp.

Why it survived: **every fixture in the auditor's self-test was delays-only**,
so `max(now, mark)` was never exercised against a mark arriving behind an
over-advanced clock. There is now a case for it, and a trace with a discarded
mark reports its timeline as untrustworthy before any of its numbers.

What this does *not* retract: night 6-41's lamp really was dark, measured from
the recording rather than the trace -- lit exactly once for 531 ms across 20 s.
And night 6-42 really did desync; `desync-scan.py` reads the screen, not the
trace, and it stands. **The desync's mechanism is open again**, and the live
evidence points elsewhere: the runner's own cue-helper read saw the cams up at
17.876 s (`luma 255`) and corrected in-cycle, then resynced twice more before
`desync-scan.py` calls it permanently inverted at 30.38 s. The auditor's timing
numbers cannot be used to choose between candidates until the timeline is
re-based.

### Retraction: `bbinside` was the vent light being off (2026-08-25)

**The class was never Balloon Boy.** Everything above this line about him
reaching the office rests on frames where the vent lamp was dark, and the lamp
is *inside the model's own ROI*, so it could have been read at any point.
Measured across every labelled frame:

| class | frames | lamp green-excess |
| --- | ---: | ---: |
| `empty` + `bb`, calibration and holdout | 49 | **104.0**, every frame |
| `bbinside` (the whole training set) | 2 | **0.2** |
| the frame that ended night 6-41 | 1 | **0.2** |
| the frame that ended night 6-40 | 1 | **-0.9** |

Both exemplars the class was ever built from are unlit openings. There is no
photograph of Balloon Boy in the office anywhere in this repository, so the
class had no positive training data at all -- it was trained on the absence of
the light and then given the authority to end a run.

Night 6-41 is the proof. It died at **13.7 s** on a `bbinside` read, and he
needs five five-second rolls, so nothing before 25 s can be him. Its recording
settles the mechanism independently: across the whole 20 s run **the lamp lit
exactly once, for 531 ms** -- the first read, which returned `empty` -- and the
second vent-light press never lit it at all. Same coordinate, same held contact,
same phase after the monitor animation. The press was simply not accepted, which
is the seam this document already names: a legal input stream is not an accepted
one.

The fix is not a better threshold, because one frame genuinely cannot separate
the three things that darken the lamp -- a dropped press; `in danger` latched so
no light answers (g75/g76/g77); or him really at 123, where g96/g301/g303 stop
the vent lights answering. **Being inside makes the lamp dark, so darkness can
never be the evidence for it.** What separates them is the retry: a dropped
press recovers on the next cycle and marker 123 never does. So the class is now
`nolight`, it fails closed to the mask like any other unreadable frame, and only
a streak of them past `BB_EARLIEST_INSIDE_MS` concludes he is inside. The
rebuilt model keeps the validated boundary exactly: **32/32 holdout, same scores
and margins** (bb 0/18, empty 0/19).

`rejected-dark/` had been a `nolight` bucket all along -- 15 of its 17 frames
have a dark lamp -- and supplied the class its training data.

### The one problem that is still open

~~Balloon Boy reaches the office.~~ **Withdrawn 2026-08-25** -- see the
retraction above. The reads that said so were unlit openings, so the premise is
gone and the "read more often" question it motivated is not yet earned. What is
open is the thing underneath it: **the vent-light press is dropped often enough
to matter**, and until a read is known to be an observation, nothing about
Balloon Boy can be concluded from it either way.

The original reasoning is kept because it was right about everything except the
cause: the pilot does look only once per five-second cycle, and the cue helper
at 42 ms is still the reason a cheaper read is worth asking about. One claim in
it was wrong on its own terms and is corrected here -- the vent light is **not**
gated on the flashlight budget. Only `lit?` drains `battery life` (g284); vent
lights are free, corrected in `ANDROID-SOURCE-STATUS.md` on 2026-08-20 and
missed here.

## Next steps

1. Preserve the validated **BB left-opening** model boundary while recovering
   enough wind for a five-tick mask clear and timed resynchronization. The
   current 1.3 s/6.5 s wind reaches 9.5% by cycle 7 and is not extendable.
2. For **Golden Freddy** positives, either repeat Night-6 starts knowing only
   one in ten enables AI 1 before 2 AM, survive beyond 2 AM for the stable AI 3,
   or beat 6th Night and use 10/20. One translucent source frame now supports a
   provisional stop-only model, and eight independent negatives pass, but it
   still lacks an independent positive animation frame. Keep the normal
   prophylactic office mask flick; a hallway `unknown` must release the light.
3. For each target, build an `SCM1` model, require leave-one-out separation and
   zero holdout false negatives, then benchmark that exact model. Measure the
   complete `screencap | classify -> input/skip` branch inside one device shell.
4. Add visual branches only to an experimental runner. Preserve the open-loop
   runner until screenrecord grading, selected-camera trace, focus/night aborts,
   and actual capture-to-action p95 all pass.
5. Independently, phase the BB response's mask hold to the one-second tick
   boundary and re-measure; it may recover up to roughly one second but does
   not replace the missing visual evidence.

## Bookkeeping

- Captures live in `captures/` (gitignored); delete failed runs immediately —
  raw screenrecords are large.
- Developer overlays (`show_touches`, `pointer_location`) are enabled by
  default whenever `trial-maskcamp.sh` starts and remain in that state after
  the trial. Use `DEBUG_OVERLAYS=0 tools/device/trial-maskcamp.sh ...` to run
  without them.
