# Plan progress

**Updated:** 2026-08-26

**Overall:** **33%** — 29 of 88 mandatory top-level work packages are closed.

**Expanded stock-device roadmap (Plans 09–15):** **7%** — 3 of 44 mandatory
packages are closed.

## Very next step

**Resume point, written 2026-08-26.** The tree is **clean** and the engine suite
is **green at 50 checks**. A large uncommitted body from two prior sessions has
been verified and landed as three commits: the `desync-scan.py` alignment
refusal, the Night 6 route repair with the runner's evidence fixes, and the cue
helper's shadow-only detector.

Two real defects were found and fixed while landing it, both of which had the
suite red: `test-plan-interpreter.sh` died on an unbound `NIGHT6_LEFT` — the new
human-floor bypass shipped with neither arm tested, and both are now pinned —
and `android/cue-helper/test.sh`, the only check that exercises the live audio
detector, ran nowhere and resolved its JDK by hardcoding one laptop's Homebrew
prefix. It is in the suite now.

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
2. Then run Night 6 graded. The run will now produce evidence whether it wins or
   loses — see the three items closed below.

### Closed in the tree this session, not yet committed

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

### Open, with what is known

- **The music box contradicts `src/config.js` and is not fixed.** Measured on
  Night 1: inert for the first ~133 s, then ~55 s full→empty, against a constant
  of 16.67 s that `recipe.mjs` states is the *Nights 6-7* rate. The per-night
  drain groups have not been located in the dump; the wind side is sourced
  (g652 sets 2000, g638/g643 add +5/tick, g645 snaps to 300). Do not change the
  constant until the drain is sourced.
- **The minigames are still unmodelled.** The `screenrecord` cap that used to
  sit beside this item is gone (see "Closed in the tree" above), so a 6 AM can
  now be recorded — but nothing yet classifies the intro card, the 6 AM
  transition, or a minigame. That is Plan 13 package 3, and until it lands a
  recording that reaches 6 AM still cannot be *graded* as a clear.
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
  (367 ms) and would clear the old 350 ms floor anyway, so this is a missing
  check rather than a known-bad press. Both arms of the bypass are now pinned by
  `test-plan-interpreter.sh`; what is *not* covered is the reactive press.
- **The right vent costs ~570 ms of pan round trip** against ~680 ms of free
  cycle, and no schedule prices it. Plan 03 depends on it.
- **`docs/ARCHITECTURE-AUDIT.md`** holds ten ranked findings. **1, 2 and 4 are
  resolved**; the rest are not. **Finding 8 is the mission-critical one** — the
  claim CLAUDE.md states as absolute, "the device runs nothing the model gate
  has not passed", is *false*, and it is the claim that authorizes every device
  run on the Plan 12 ladder. `trial-maskcamp.sh` is a second runner that never
  calls the gate; ~370 lines of inline `press_at` literals remain in
  `trial-minus7.sh` with no test asserting them; and the "no inline schedule
  fallback" check tested for the absence of a *prose phrase* until this session
  made it structural. The reactive-press gap noted above is a fourth item on
  that list. Fixing finding 8 is worth more than another simulator number.
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
