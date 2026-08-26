# Plan progress

**Updated:** 2026-08-26

**Overall:** **33%** — 29 of 88 mandatory top-level work packages are closed.

**Expanded stock-device roadmap (Plans 09–15):** **7%** — 3 of 44 mandatory
packages are closed.

## Very next step

**Resume point, written 2026-08-26.** The tree is **clean** and the engine suite
is **green at 50 checks**. A large uncommitted body from two prior sessions was
verified and landed, and the session's own findings landed with it — eleven
commits, `ea1f9f1`..`ab8d70c`. Nothing below is half-applied.

Two defects were found and fixed while landing it, both of which had the suite
**red**: `test-plan-interpreter.sh` died on an unbound `NIGHT6_LEFT` — the new
human-floor bypass shipped with neither arm tested, and both are now pinned —
and `android/cue-helper/test.sh`, the only check that exercises the live audio
detector, ran nowhere and resolved its JDK by hardcoding one laptop's Homebrew
prefix. It is in the suite now, and CI pins a JDK for it.

**No package closed.** The headline stays 29/88: everything below either repaired
something already counted, or recorded what a package still needs. An honest
percentage that does not move is worth more than a flattering one.

### The single most important thing learned today

**Night 6 was refused, and then the refusal was fixed at its cause.** The gate
was passing on its seed block: `GATE_RUNS` was 100, which cannot measure a rate
near its own bar, and over 1200 seeds the shipped plan was 449/1200 = 37.4%
against a 40% contract. It was correctly refused.

The cause turned out to be a lost input, not a bad bar. The clear branch's first
Foxy reset sat in a standalone hall slot that landed inside mask-off and did
nothing at the measured read latency; carrying that contact on the existing
post-read `maskraise` row restores it without moving the read, the sweep, or the
measured 180 ms mask→monitor seam. **Re-verified independently this session, on
the same 1200 seeds: all six nights now clear the unchanged 40% contract** —
99.1, 68.9, 78.8, 73.2, 63.9 and **56.1** per cent. The bar never moved.

**The margin was bought with flashlight, and that bill is not recorded anywhere
else.** The restored contact is lit, so light spend went 2148 → 2808 frames on
every night. Nights 1–4 absorb it; **Nights 5 and 6 fall from 852 to 192 frames
of headroom**, about 3.2 s of light against a 3000-frame budget. The two nights
that most need slack now have the least. `test-night-matrix.mjs` fails the suite
if headroom reaches zero, but nothing warns on approach.

### The next concrete action

**Attempt a graded Night 6 run.** This is newly unblocked: Night 6 is the only
night `trial-minus7.sh` can play end to end (`NIGHT=6th` → `sixthNight`), and it
is now gate-clean. Nights 1–5 are reachable only through the bounded
`CALIBRATION_STORY_NIGHT=1..5` path, which is Continue-only and refuses more
than **one cycle** (`trial-minus7.sh:320`) — a full lower-night run needs Plan
13 package 5, and no lower night has ever been attempted on the device.

Do it in this order, because the first step is cheap and invalidates the second
if it fails:

1. Verify the fork-free clock **on hardware inside a real cycle**. `date` cost
   21 ms per fork+exec and `wait_until` busy-waited on it; the runner now reads
   `/proc/uptime` fork-free, which landed 0 ms late on 15/15 with a live night
   running — but that was a **bare shell loop**, not the real cycle with
   `hid_mark`, HID writes and the classifier in it. Priced through
   `actuator.mjs` the change takes Nights 1–5 to 200/200 and Night 6 to 171/200
   **in the simulator**. The knee is a frame count: free to 41 ms, gone at 42.

   **This was attempted once today and answered nothing** — `n1-clock-cycle-`
   `20260826`, graded at **alive ≥1.5 s** of an 8.8 s recording, died four lines
   in. Both things that killed it are now fixed, and the run is worth reading
   before the next attempt: its five-line driver log is the whole story, and it
   is written up in `RUN-TELEMETRY.md` §10. Briefly — the scalar human floor
   aborted the plan at its own accepted 120 ms compound boundary, **and** the
   epoch centring silently wrapped 32-bit, putting T0 exactly 2^32 ms low, an
   origin wrong by 20,679 days. They masked each other: the abort is the only
   reason a whole night was not then timed against that origin. The log ranked
   first of ten signals in that survey at 0 ms cost, landed the same day, and
   caught two unknown defects on its first run.
2. Then run Night 6 graded. The run will now produce evidence whether it wins or
   loses — see the items closed below.

**If the phone is not available, there is now real work that does not need it.**
Plan 13 package 3's intro classifier is unblocked: the fixture exists, its
signature is measured, and its negative control is written down (plan 13,
"The intro card's signature"). Build it with fractional boxes rather than in
`lifecycle-observe.py`'s sensor-bound model, and gate the *decision* with
synthetic fixtures from a committed generator, following
`testdata/make-title-fixture.py`. That closes half of package 3. The other half
needs a 6 AM, and no 6 AM frame exists anywhere — which is what step 2 above is
for.

### Closed and committed this session

Each of these was an "Open" item here as recently as this morning:

- **A 6 AM can now be recorded.** `screenrecord` no longer caps at 180 s. The
  runner probes the handset's `--help` for the advertised unlimited mode and
  uses `--time-limit 0`; a device that does not advertise it is **refused, not
  degraded**, because a plausible-looking 180 s artifact of a 420 s night is
  worse than no video (`trial-minus7.sh:115-137`).
- **Grading is no longer success-only.** `grade-run.sh` runs on every exit path,
  so the run that failed is no longer the run that is never graded. The runner's
  own exit status is preserved.
- **The driver's stdout/stderr is durable.** It tees to `$OUT-run.log` and is
  declared in the session manifest as operational metadata with
  `clock_domain=null` — honest, because the stream mixes runner-relative decision
  lines with transport errors that carry no clock.
- **A real 32-bit wrap bug in the remote shell is fixed.** Android's mksh does
  signed 32-bit arithmetic and epoch milliseconds are ~1.8e12, so the epoch
  centring arithmetic wrapped; `epoch_sub_ms`/`epoch_diff_ms` keep the value as a
  string and calculate only on its parts. The interpreter test pins the exact
  value that wrapped in the first real attempt.
- **`desync-scan.py` can no longer invent an alignment.** `align()` refuses a
  trace with no monitor presses, no confident edges, zero matches, or an optimum
  on a search boundary, and `scan()` reports `UNKNOWN` and exits before
  attributing anything.

### External check, 2026-08-26: is this architecture normal?

Surveyed, because nobody had. **It is not normal — it is near-unprecedented, and
the one precedent is instructive rather than discouraging.** Full write-up in
`HID-MULTITOUCH.md` §"Prior art". Three things that change what to work on:

- **`hid-multi` is on the right side of the only documented detection line.**
  Android stamps injected input with `deviceId = -1` *by deliberate design*
  (AOSP `InputDispatcher.cpp`), and per a scrcpy contributor the only mechanisms
  that do not are AOA HID and uinput. Every mainstream alternative — `adb shell
  input`, MaaTouch, scrcpy's sdk mode, Airtest maxtouch, minitouch — is
  detectable; this route is not. That was not why it was chosen, and it is a
  second reason to keep it.
- **The one prior attempt died of something we do not use.** `phisap` drove an
  unrooted handset in hard real time via **AOAv2** and broke on Android 13 on
  vendor USB-gadget bugs. This project runs `/system/bin/hid`, a **uhid** device
  created on the phone — verified, not assumed — so it gets the same identity
  property without the dependency that killed the precedent.
- **Its author's unsolved problem was ours.** He shipped a working 1 kHz HID
  touchscreen and then started his timer *by having a human press space*,
  because he could not read the song's progress without root. His rule — "Full
  Combo but not All-Perfect always means the timer sync is off, never the plan"
  — is this repository's graded-interval rule in miniature. **Actuation was
  never the bottleneck for the only person who tried this before.** The cue
  helper and the epoch latch are the parts of this project with no prior art,
  and today's 32-bit T0 wrap says that is still where the risk lives.

Also corroborated: 225 ms `screencap` sits where the literature says it should,
the 59 ms device-local read beats anything published for a physical handset, and
the ≥100 ms contact rule is Unity's own documented failure mode. And one honest
negative: **no case was found of any Android game detecting a bot by input
timing** — only by input identity. That does not license relaxing the human gate,
whose justification is evidential rather than ban-avoidance, but it does mean the
gate should stop being argued for on detection grounds.

### The stale claim that mattered most, corrected 2026-08-26

**`CLAUDE.md` was asserting a device limit the repository had withdrawn two days
earlier.** Its `--device-sweep` bullet said *"at the proven 240 ms spacing the
same route is 0/1000"*, and used it to argue the 267 ms three-camera sweep is
unproducible. But `HID-MULTITOUCH.md` §"Answered: the phone accepts 120 ms
spacing (2026-08-24)" had already **withdrawn 240 ms as a measurement artifact**
— `camtrace.py` decoded at 30 fps and demanded a 100 ms stable run, so at 160 ms
every dwell reported as exactly the 0.10 s floor and read as a dropped
selection. Re-graded at the recording's native 60 fps, the same three probe runs
are **4/4 at 240, 160 and 120 ms**. Nothing about the input changed.

That page's own table prices the phase window by spacing: 240 ms → 2 frames
("not landable"), 160 ms → 6, **120 ms → 12 frames (200 ms)** against an ~80 ms
`DEVICE_EPOCH_LATCH` bracket. So the blocker it calls *singular* — the camera
actuator's inter-selection spacing — **was answered in the phone's favour.**

**Scope it honestly: this unlocks nothing new.** `DEVICE_SPACING_MS` is already
120 in `recipe.mjs`, `test-recipe.mjs` already gates against it, and the shipped
route already spends it. The engine absorbed the finding on the day it was made;
only the always-loaded instructions file lagged. What the correction prevents is
a *future* session reading CLAUDE.md, believing the sweep route is dead, and
re-deriving a conclusion the repository had already overturned — which is
precisely the cost this project's front page says it exists to stop.

A 2026-08-26 literature pass reached the same conclusion from the other side:
**nothing in Android, evdev, uinput, InputReader or InputDispatcher imposes any
inter-press floor.** AOSP's own synthesised swipe runs at 120 Hz; RERAN replays
raw event streams on real phones at 3.87 ms median. Full write-up in
`HID-MULTITOUCH.md` §"Input injection and sequential budgets", which also
corroborates three of our numbers, corrects two more, and names two silent
failure modes we have not guarded — the evdev ring overflowing to `SYN_DROPPED`
(whole-frame drop in `EventHub`), and the kernel dropping unchanged `EV_ABS`
after fuzz.

**The one with a lever attached:** on `screencap`'s path `sourceCrop` is
*ignored in source* and every layer is composited regardless of region, while
AOSP's own small-region sampler budgets **3 ms** for the same shape of work by
caching its buffer, filtering layers, and never leaving SurfaceFlinger. Our
59 ms for 180 pixels is ~20× that, which points at fixed per-read entry cost
rather than pixels.

### Open, with what is known

- **The music box contradicts `src/config.js` and is not fixed.** Measured on
  Night 1: inert for the first ~133 s, then ~55 s full→empty, against a constant
  of 16.67 s that `recipe.mjs` states is the *Nights 6-7* rate. The per-night
  drain groups have not been located in the dump; the wind side is sourced
  (g652 sets 2000, g638/g643 add +5/tick, g645 snaps to 300). Do not change the
  constant until the drain is sourced.
- **A 6 AM still cannot be graded, and the fixtures say why.** The
  `screenrecord` cap that used to sit beside this item is gone, so a 6 AM can now
  be *recorded* — but nothing classifies the intro card, the 6 AM transition, or
  a minigame. Plan 13 package 3, inventoried 2026-08-26 and now **half
  startable without a phone**:
  - **Present:** `captures/lifecycle/n1-intro-cal-20260826.mp4` holds the
    `12:00 AM / 1st Night` card *and* the intro→night transition, with the
    boundary labelled by `screenstate.py` itself (`other` through the card,
    `night` from ~8 s). That is the intro classifier's material, today.
  - **Absent:** **no 6 AM frame exists anywhere in the repository.** Package 3
    can build and gate the intro half and cannot close on the other.
  - **Was a trap, now fixed:** `captures/lifecycle/n1-clear/` contained a
    *death* — `screenstate.py` reads its `final.png` as `gameover`. Renamed
    `n1-clear-attempt-died/` with a README. Nothing referenced it, but it was
    aimed exactly at this package: whoever built 6 AM fixtures would have found
    a directory called `n1-clear` and fitted the classifier to a Game Over.
  - **Outranks all of it:** **`captures/` is gitignored.** Every fixture above
    exists on one laptop and in no clone, so package 3's holdout set needs
    somewhere to live before it can be a gate anyone else can run.
- **Nights 5 and 6 have 192 frames of flashlight headroom, down from 852.** The
  Night 6 route repair paid for its gate margin in light. Nothing warns as that
  approaches zero; `test-night-matrix.mjs` only fails once it crosses. Price any
  new lit observation against 192 frames, not against the old 852.
- **The live human floor is now off on the shipped route, and nothing replaced
  it for runtime presses.** `human_floor_check` returns early when
  `NIGHT6_LEFT=1` (`trial-minus7.sh:1570`), because the model gate prices the
  emitted plan and the old scalar check aborted on the plan's own deliberate
  120/180 ms compound boundaries. That is defensible for *scheduled* presses.
  But the corrector's monitor-verify press in `light_down_at` is **not in the
  plan** — it is a runtime reaction — so on the shipped route it is now priced
  by nothing at all. In the modelled path it waits out `MONITOR_ANIM_DOWN`
  (367 ms) and clears the old 350 ms floor anyway — but **the margin is 50 ms**,
  measured: the corrective press lands at 400 ms against a 350 ms floor. So this
  is a missing check rather than a known-bad press, with less room than anyone
  had assumed. `test-plan-interpreter.sh` pins both arms of the bypass *and*
  that 400 ms gap, so shortening the corrector's wait by 51 ms now fails locally
  instead of on the phone. Pinning is not pricing: routing reactive presses
  through a check that knows they are unplanned needs the device in the loop,
  and was deliberately not attempted blind against the one gate-clean route.
- **The right vent costs ~570 ms of pan round trip** against ~680 ms of free
  cycle, and no schedule prices it. Plan 03 depends on it.
- **`docs/ARCHITECTURE-AUDIT.md`** holds ten ranked findings. **1, 2 and 4 are
  resolved, and 8 is mostly resolved**; the rest are not. Finding 8 was the
  mission-critical one, because the claim CLAUDE.md stated as absolute — "the
  device runs nothing the model gate has not passed" — was *false*, and it is
  what authorizes every device run on the Plan 12 ladder. Now: the 378 dead
  inline `press_at` lines are deleted, `test-runner-plan.mjs` scans the whole
  driver instead of a slice that ended where they began (verified by positive
  control against the old file), the prose-absence check is structural, and
  CLAUDE.md's rule is scoped to what is actually enforced. **Two things still
  sit outside the gate**: `trial-maskcamp.sh`, which needs a decision rather
  than one session's judgement — gate it, port its table, or retire it — and
  the reactive presses noted above, which are now priced by nothing.
- `docs/device/RUN-TELEMETRY.md` ranks ten diagnostic signals by value per
  millisecond. Items 3–6 total ~23 ms of a 5000 ms cycle and belong in the
  plan's ~416 ms post-read slack; re-check placement with `windpct.py
  --samples`, since the screencap that once collapsed the box 52% → 10% was
  only 10.3 ms/s and did it by landing on the wind.
- Two defects found while reading and not fixed: `SWEEP_LIGHT_LEAD_MS` and
  `plan_control_xy` are each **defined twice** in `trial-minus7.sh` (the first
  `plan_control_xy` lacks the `hall` and `ventl` arms), and `hid_mark "$actual"`
  reads a stale global in the calibration branches while the printf beside it
  uses a fresh one. Calibration paths only, not the shipped route.

## Dashboard

| Plan | Closed / mandatory packages | Progress | Current state | Next gate |
|---|---:|---:|---|---|
| [01 — research pass](01-research-pass.md) | 3 / 3 | **100%** | Done | None |
| [02 — Minus 3 mode](02-minus-3-mode.md) | 1 / 6 | **17%** | Research/simulator verdict complete; framing decision blocks implementation | Decide best-odds practice, PC history, or close the mode |
| [03 — right-vent-camp mode](03-right-vent-camp-mode.md) | 1 / 5 | **20%** | Engine sourcing complete (2026-08-24); reactive coach, decision table, ladder and grading untouched | Design the reactive coach: situation detection, expected response, reaction window, decision grading |
| [04 — optimize Minus 7](04-optimize-minus-7.md) | 3 / 4 | **75%** | Search and grading work complete | Replace inferred human profile with accumulated trainer traces |
| [05 — derive new strategy](05-derive-new-strategy.md) | 5 / 5 | **100%** | Closed by sourced refutation/negative result | Reopen only after a source-rule change |
| [06 — hybrid search](06-hybrid-strategy-search.md) | 6 / 6 | **100%** | Closed with no survivor | Reopen only after a corrected mechanic changes reachable policy space |
| [07 — tooling consolidation](07-tooling-consolidation.md) | 5 / 8 | **63%** | Correctness pass complete; opportunistic refactors remain | Extract shared browser session during the next browser-tool change |
| [08 — audio-cue controller](08-audio-cue-controller.md) | 2 / 7 | **29%** | Source map and playback capture pass. A live **fail-closed, shadow-only** detector now exists on device (`ARM`/`RESULT`/`MODEL`, named refusal reasons, `UNKNOWN` for every degradation) and **cannot influence a run** — the runner sends only `GET` and reads only the visual pixel. It closes no package: the exporter is not an evaluator, close→MISS latency is unmeasurable as built, and no shadow run exists | Derive or retract the guessed `threshold=0.25`/`margin=0.05` now provisioned on the phone, then the session-split holdout and confusion matrix |
| [09 — observation corpus](09-observation-corpus.md) | 1 / 6 | **17%** | Schemas, validator and producers all landed; every runner emits a manifest on every exit path, proven against mock adb only | Validate one real captured session; the next hardware run closes package 2 |
| [10 — stock-device controller](10-stock-device-controller.md) | 0 / 7 | **0%** | Package 0 advanced: pan sourced and measured, both lights verified, office proven 1600×768 and the screen mapping derived; the right vent's scene X stays unknown | Price the right vent's ~570 ms pan round trip, then close the vocabulary |
| [11 — policy interface](11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Lateness decomposed and priced: the knee is the 2→3 frame boundary, and the fork-free clock recovers Nights 1–5 in the simulator; Night 7 stays blocked by the phase island | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 2 / 8 | **25%** | **All six nights now pass the human gate** (99.1, 68.9, 78.8, 73.2, 63.9, 56.1%) after the Night 6 route repair; title observed; a real death classifies with no unknown. But only Night 6 is *runnable* end to end — Nights 1–5 are one-cycle calibration only (package 5) | Classify the intro card and 6 AM (package 3); a recording that reaches 6 AM still cannot be graded as a clear |
| [14 — device portability](14-device-portability-and-profiles.md) | 0 / 6 | **0%** | Proposed; the canvas→screen mapping is now derived (stretch-to-fill, predicted 1720 against a measured 1700–1800) rather than calibrated | Inventory and classify the coupling: geometry, layout mode, pixel models, timing |
| [15 — sensor independence](15-sensor-independent-observations.md) | 0 / 5 | **0%** | Proposed; every classifier is bound to one capture method and the cue helper's fast read is blocked on a `screencap` threshold | Inventory every fact × sensor pairing as calibrated, assumed, or absent |

## Counting rule

- The denominator is the mandatory numbered work packages in each plan. Plan
  11's explicitly optional Gymnasium package is excluded.
- Plan 13 adds eight mandatory packages; the completion numerator remains
  unchanged until one of its gates actually closes.
- Plan 14 adds six mandatory packages on 2026-08-26 (77 -> 83 mandatory). Its
  package 6 needs a second handset the project does not have; it is counted
  because the plan's done criteria cannot close without it, unlike Plan 11's
  Gymnasium package which is optional to its own goal.
- Plan 15 adds five mandatory packages on 2026-08-26 (83 -> 88 mandatory). It
  exists because the same game fact is currently re-taught per capture method,
  and three more sensor-bound classifiers were added the same day.
- Plan 10 gained a package 0 on 2026-08-26 (76 -> 77 mandatory): the basic
  interaction vocabulary the schedule is made of was never established, and
  office panning appears in the record only as a failure mode.
- A package contributes only when its plan marks it closed, completed, passed,
  or closed by a documented negative result. Partial or “advanced” work receives
  no fractional credit.
- Plans 05 and 06 count as complete because their done criteria explicitly
  accept a recorded refutation/no-survivor result; implementation was correctly
  not started after the candidate failed.
- Prerequisite research outside a plan's numbered implementation packages is
  described in the state column but does not inflate its percentage.
- Adding, removing, reopening, or closing a mandatory package changes the
  numerator or denominator here in the same commit.
- A row is read off its plan's own completion markers, never from memory. This
  file was written on 2026-08-26, after several plans had already closed
  packages, and a same-day audit found Plan 03's row had been authored stale:
  its work item 1 closed on 2026-08-24 and the row still said `0 / 5` and named
  that finished work as the next gate. The audit also found Plan 08's "Done
  when" section still carrying a withdrawn refutation that, read literally,
  closed five packages the plan's own table lists as open.

This percentage measures completion of the written plans, not probability of a
clear. In particular, simulator success, a bounded device branch, a Night 6
attempt, a Night 6 clear, and a 10/20 clear remain distinct claims under
[Plan 12](12-end-to-end-evidence-campaign.md).
