# Plan progress

**Updated:** 2026-08-26

**Overall:** **33%** — 29 of 89 mandatory top-level work packages are closed.

**Expanded stock-device roadmap (Plans 09–15):** **7%** — 3 of 44 mandatory
packages are closed.

## Very next step

**Landed 2026-08-26 21:20 BRT, and it contradicts something the repository
said:** the **double-camera glitch transfers to Android**. A retained classifier
frame from the cleared Night 1 (`n1-full-1640`, runner clock 92879 ms) shows CAM
04 and CAM 07 lit at once; re-read against the dump, the camera selection is two
fields (`viewing` counter 55 / `your view` marker 126) and the monitor-raise
restore (g1 → g2) writes only the first, from a `last viewed` that g263 samples
every 200 ms. Groups 450-457 read the marker for *who* is stunned and `viewing`
for the `<> 8 / <> 9 / <> 11` immunity, so the exclusions are bypassable. Four
documents plus `minus2test.mjs`'s header said the opposite and are corrected in
place. **Nothing is modelled or measured**: the engine has no two-camera state,
no glitch-aware probe exists, and nobody has tried to arm it on the phone —
that is plan 02's new package 2a. Full sourcing and controls:
`docs/android/ANDROID-SOURCE-STATUS.md` §"2026-08-26: the double-camera glitch
*does* transfer". **This does not change the hardware thread below**, which is
still the live next action.

**Resume point, written 2026-08-26 20:01 BRT.** Four scoped changes landed on
`master` this pass:

- `e04924c` makes the session producer use an OS monotonic clock shared across
  its separate Python processes. In this environment `time.monotonic()` is
  process-relative; it produced negative, out-of-order manifest events. The
  end-to-end session producer gate now passes.
- `98eb7ff` removes the runner's duplicate sweep-light constant and incomplete
  coordinate resolver, and structurally gates every remaining HID timestamp
  against a freshly frozen value.
- `d5cb725` resolves the deliberately red cycle-seam check. The emitted sweep
  ends on the nominal boundary, but the runner delivers the next anchor after
  a drift-aware **33 ms** released gap. The plan did not need to move.
- `ff8fc00` adds and gates a generic, fractional intro-card classifier. It says
  `intro`, never guesses the night ordinal. On local real evidence it accepts
  5/5 Night 1 card frames, rejects 21/21 non-card frames and all 17/17 6 AM
  frames, and the cleared Night 1 timelines from intro through a positive 6 AM.

**The working tree is not clean.** An active concurrent source pass is changing
`src/config.js`, `src/engine.js`, `src/ui.js`, `tools/simtest.mjs`,
`tools/sourcetest.mjs`, and `tools/dump/coverage.py`; it was outside the scoped
commits above and is being preserved. At the first snapshot the full engine run
passed **52 of 53 checks** and failed `simtest` on the marker-123 model. The
source pass then split the reaction and committed-attack states and expanded
into hall-light pinning, Toy Chica timing and Puppet routing; the latest focused
run passes all 159 sourced-rule checks but fails `simtest` because W. Bonnie
does not cross after the new hall-light B tail drains. Let that pass finish and
restore the full green gate before touching the phone; a route priced while its
engine is changing is not gate-clean.

**The hardware ladder is Night 2, not Night 6.** The live title observer reads
`items=continue,newGame`, so Sixth Night is not unlocked. The device owner
directly confirmed the open game's Continue label says **Night 2**. Once the
suite is green, run the bounded fork-free-clock check with a trace:

```sh
BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm \
NIGHT=continue CALIBRATION_STORY_NIGHT=2 STORY_CURSOR_OBSERVED=2 \
HID_TRACE_RUN=1 GRADE_RUN=1 \
tools/device/trial-minus7.sh n2-clock-cycle-20260826 1
```

If its real-cycle log proves the clock and delivered seam, attempt the full
Night 2 immediately with a fresh run name and `90` cycles. A clear must be
proved by positive 6 AM **and** the title/save cursor advancing to Night 3.

# NIGHT 1 IS CLEARED ON THE DEVICE.

The first full-night stock-device clear this project has recorded. Run
`n1-full-1640`, 2026-08-26.

**The proof is the save, not a classifier.** The label under `Continue` read
**Night 1** before the run — checked twice at full resolution — and reads
**Night 2** after it. The device owner watched the 6 AM screen. The driver
printed `night6-left finished: 74 cycles` at **417.9 s** of a 420 s night, and
the capture saved as `n1-full-1640.mp4`, not `-aborted`. Re-graded after the
fix below, `grade-night.py` reports **420.2 s alive**.

**The save cursor now sits at Night 2**, so a repeat of this command plays
Night 2, not Night 1. `STORY_CURSOR_OBSERVED` must be set to what is actually
on screen; it is checked against the requested night and refuses on mismatch.

```sh
BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm \
NIGHT=continue CALIBRATION_STORY_NIGHT=2 STORY_CURSOR_OBSERVED=2 \
tools/device/trial-minus7.sh NAME 90
```

**Read this before celebrating it.** The run desynced roughly **eight times and
the runner noticed once**, and every one of its 9 "Balloon Boy responses" was
false — BB's AI is 0 on Night 1 and he cannot act. Night 1 is the easiest night
in the game and has 4192 frames of flashlight headroom; the same faults on
Night 5 or 6, which have 192, are unlikely to be survivable. **This is a floor,
not a ceiling.**

**No package closed.** The headline stays 29/88. Plan 13 package 3 is advanced,
not closed: 6 AM and the generic intro are now classified, but the intro's night
ordinal, minigames, save advancement, committed real holdouts, and media-PTS ↔
runner-clock alignment remain open. An honest percentage that does not move is
worth more than a flattering one.

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

**Superseded by the resume point at the top of this file.** This section used
to call for Night 6, but the live title now proves Sixth Night is not unlocked
and the device owner read the Continue cursor as Night 2. The fork-free-clock
question remains first, now as a bounded Night 2 cycle; a passing result is
followed by a full graded Night 2 attempt.

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

**Both surveys are retained in full** under
[`docs/research/`](../docs/research/README.md), which now indexes all four
reports with what each answers and where it was distilled to. An `UNKNOWN` in
them is a result, not a gap: it means the question was asked and the public
record does not answer it, so nobody needs to search again.

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

### The cycle seam is resolved; the current red check is unrelated

The deliberately red `recipe` check was comparing the emitted plan's nominal
clock with the runner's delivered wall clock. The sweep does end exactly on the
nominal boundary, but `run_macro` waits through `rm_shift + FUSION_POLL_MS`
before writing the next anchor. That delivers **33 ms released**, clears the
HID auditor's 20 ms floor, and carries lateness forward rather than compressing
later seams. `test-recipe.mjs`, `test-runner-plan.mjs`, and the real shell
interpreter now prove the complete path.

The 4660 → 4640 counterfactual was still priced, 1200 seeds per cell. Under the
measured actuator both shipped and candidate were 0/1200 on Nights 5 and 6 for
an unrelated lateness cliff, with **zero seam drops** in roughly 1.25 million
sent actions. With lateness zeroed, both were 1200/1200. Moving the sweep offers
no seam benefit, so the recipe stays at 4660.

The suite is currently red only because of the separate uncommitted marker-123
engine edits named in the top resume point. Do not confuse that source-model
conflict with the resolved cycle boundary.

### Retracted 2026-08-26: the cycle-wrap seam was not the desync cause

Earlier today this dashboard named the cycle wrap-around as the prime suspect
for the cleared Night 1's ~8 desyncs: every cycle's last instruction ends
exactly on the next cycle's `0 tap monitor`, 0 ms released against the HID
auditor's 20 ms floor.

**The 0 ms is real in the emitted plan and irrelevant in delivery.** The runner
already compensates: `trial-minus7.sh:2476` waits
`rm_base + rm_cursor + rm_shift + FUSION_POLL_MS`, holding the next anchor back
one Fusion poll (33 ms), and `test-runner-plan.mjs:223` pins that. Because the
wait is relative to `rm_shift`, a late macro moves the boundary with it instead
of compressing the seam. The delivered gap is 33 ms and legal.

So the sweep-shift variants priced against it — 20 ms free, 33 ms costing 3.5
points on night 6 — were pricing a fix for a defect the runner does not have.
Those figures stay on the record because they measure something real about
Foxy's tolerance, but they are not a desync fix.

**This is the second time this exact mistake has been made here.** The trace
auditor made it first, mistaking the nominal plan clock for wall-clock delivery,
and its zero-gap finding was retracted for the same reason. `test-recipe.mjs`
now checks the DELIVERED seam rather than the nominal one, which is the check
that would have caught both of us.

What caused the Night 1 desyncs is therefore **open again**. `HID_TRACE_RUN=1`
on the next graded run remains the way to attribute them, since only
`desync-scan.py` can line the sent trace against what the game did.

### Open, with what is known

- **The music box contradicts `src/config.js` and is not fixed.** Measured on
  Night 1: inert for the first ~133 s, then ~55 s full→empty, against a constant
  of 16.67 s that `recipe.mjs` states is the *Nights 6-7* rate. The per-night
  drain groups have not been located in the dump; the wind side is sourced
  (g652 sets 2000, g638/g643 add +5/tick, g645 snaps to 300). Do not change the
  constant until the drain is sourced.
- **Lifecycle package 3 is advanced, not closed.** A positive 6 AM is recognised
  by `run-timeline.py`, and the new fractional intro-card classifier is gated by
  a committed synthetic generator. Against local real media: intro 5/5,
  non-card 21/21 rejected, 6 AM 17/17 rejected as intro and accepted as 6 AM;
  `n1-full-1640` reports intro at 3.0–5.5 s and clear at 428.5 s. Still absent:
  minigame fixtures/classification, Night 2–6 intro evidence and ordinal
  recognition, a committed real holdout corpus, media-PTS ↔ runner-clock
  alignment, and save-advancement classification. Those gaps keep the package
  open.
- **The controller desyncs far more than it detects, and pan is the tell.**
  Measured on the cleared Night 1: 16 of 16 `empty` vent reads sit at 0–6 px of
  office pan, and 6 of 7 false `inside` reads at **64–178 px**, with the
  classifier's margin tracking pan monotonically (0 px → 19, 6 px → 20,
  displaced → 18, which is the `inside` boundary). Per the device owner,
  unexpected pan during a run *means* desync. So that run desynced roughly
  **eight times and the runner noticed once** — and its one correction failed:
  the resync at 93089 ms was followed five seconds later by a read that still
  photographed the Main Hall camera feed. Two consequences: every `inside` on
  that night was false (BB's AI is 0), and a panned office means every press in
  that cycle lands on coordinates calibrated for an unpanned one. Pan is a
  better desync detector than the luma check and is **unpriced inside the
  cycle** — a full-frame correlation, so price it before scheduling it.
  `ON-DEVICE-SCREEN-CHECKS.md` §"The left-opening classifier measures camera
  pan" has the frames and the method.
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
| [02 — Minus 3 mode](02-minus-3-mode.md) | 1 / 7 | **14%** | **Reopened 2026-08-26.** The glitchless Minus Two verdict stands (16/200, consecutive-mask failure), but the reason the *family* was closed — "Minus Toys cannot transfer, the build has no double-camera state" — is retracted: `viewing` and the `your view` marker are separate fields and a monitor raise restores only `viewing` from a 200 ms-stale sample, so the CAM 08/09/11 flash exclusions are bypassable. A device frame caught both buttons lit. Minus Toys is unprobed, not refuted; the framing decision is blocked behind the new package 2a | Package 2a: split the engine's camera selection into counter + marker, write a glitch-aware Minus Toys probe, and measure the 200 ms arming window on the device |
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
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 2 / 8 | **25%** | **Night 1 CLEARED on device 2026-08-26** (`n1-full-1640`, 420.2 s alive, save advanced Night 1 → Night 2). Package 3 is **advanced, not closed**: generic intro and positive 6 AM now timeline the real clear, while minigames, ordinal recognition, committed real holdouts, clock alignment and save advancement remain open. The live title has only New Game + Continue and the device owner confirmed cursor Night 2; Sixth Night is not unlocked. All six story configurations pass the last committed human gate (99.1, 68.9, 78.8, 73.2, 63.9, 56.1%), but the current uncommitted marker-123 edits leave the full suite red and must be reconciled before hardware | Reconcile the marker-123 source model, then one traced Night 2 cycle and a full graded Night 2 attempt |
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
- Plan 02 gained a package 2a on 2026-08-26 (88 -> 89 mandatory): the
  double-camera glitch turned out to exist on Android, so the Minus Toys half of
  the family needs an engine state, a probe and a device measurement that were
  never written. Its percentage falls 17% -> 14% on the same numerator, which is
  the honest direction.
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
