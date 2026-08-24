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
  window. BB now has independent holdout and live-branch evidence; Golden
  Freddy still lacks an independent positive holdout. Toy Bonnie vision is
  deliberately excluded from the Minus 7 path because its CAM 04 stall already
  controls it. Full build, model, replay, benchmark, invocation, and
  conservative-branch rules are in
  [`ON-DEVICE-SCREEN-CHECKS.md`](ON-DEVICE-SCREEN-CHECKS.md).

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
