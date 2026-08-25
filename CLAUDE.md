# Working notes for this repository

This project is mostly an **evidence argument**, not a codebase. Most of the
cost here is not writing code — it is drawing a conclusion the repository had
already answered, and then building on it. Every item below exists because that
happened, and the fix is always the same: read the page that already knows.

**Commit on `master`.** This repository does not use branches — overriding the
global agreement's "if on the default branch, branch first".

**`Night 6` is the game's night; `night 6-34` is the 34th device run on it.**
The runs are named `n6-night-34` on disk, and writing them as "night 34" reads
as a night the game does not have.

## Read these before concluding, not after

| Before you claim… | Read |
|---|---|
| a cue is ambiguous, or an animatronic could be responsible | [`docs/strategy/MINUS-7-STRATEGY.md`](docs/strategy/MINUS-7-STRATEGY.md) §"Who is *not* stalled" |
| anything about a device run's configuration or its failure | [`docs/device/HID-MULTITOUCH.md`](docs/device/HID-MULTITOUCH.md) |
| an observation is cheap enough to add to the pilot loop | [`docs/device/ON-DEVICE-VALIDATION.md`](docs/device/ON-DEVICE-VALIDATION.md) |
| anything citing a group number | [`docs/android/SOURCE-DUMP-GUIDE.md`](docs/android/SOURCE-DUMP-GUIDE.md) §4 |

The event sheet describes the **game**. The strategy describes the **run**. A
sample shared by seven characters is not ambiguous if this line stun-locks all
seven — that single distinction invalidated a day of conclusions on 2026-08-24,
including a withdrawn strategy rule and a retraction written into the strategy
document contradicting how the line is actually played.

## Device runs

- **A run with no Balloon Boy read is a known-dead configuration.**
  `HID-MULTITOUCH.md` records **0/3000** Night 6 for it in the exact simulator,
  through the BB→Foxy chain. A run without it has not tested anything.
- **CAM 05 is not the Night 6 checkpoint.** The device-validated classifier is
  the **lit left opening**, and its light costs no flashlight battery.
- **Price every observation before scheduling it.** The cycle has roughly
  **680 ms free**. A `screencap` costs **225 ms**; the cue helper's device-local
  read costs **59 ms** and now covers both the left opening and the CAM 05
  region from the same 20×9 frame. Adding a screencap every four cycles was
  enough to truncate the wind and collapse the box from 52% to 10%.
- **Price a policy against `--device-sweep`, not the ideal actuator.** The
  published 10000/10000 Night 6 figure uses a 267 ms three-camera sweep the
  phone has never produced. At the proven 240 ms spacing the same route is
  0/1000, and a held 790 ms lit sweep alone outspends the whole 3000-frame
  night-6 flashlight. See `HID-MULTITOUCH.md` §"The Night 6 route, priced
  against the phone's actuator".
- **The pilot may not deliver inhumanly timed inputs — absolute, no override
  (2026-08-25).** The device validates strategies a human can transfer to, so
  `trial-minus7.sh` refuses any press within `HUMAN_FLOOR_MS` (350 ms,
  `[INFERRED]` from the trainer's duel gate until the trace census in
  `tools/tracereport.mjs` supersedes it) of the previous one — pre-flight for
  plan files (`tools/device/human-gate.mjs`), live in `press_at`/`hold_at`/
  `pulsed_sweep_at` for everything else. This deliberately grounds **every
  current device route**, the shipped 120 ms Night 6 plan and the classic
  190 ms swipe cycle alike; `test-human-gate.mjs` asserts the refusal, and
  whoever ships a human-executable route flips that assertion and this note
  together.
- **Short taps get dropped** — Fusion polls touch per frame. Use duration
  presses (`input swipe x y x y 120`), which is why `PRESS_MODE=fast-swipe`
  exists and is not merely legacy.
- **A legal input stream is not an accepted one.** `test-hid-trace.mjs` audits
  what the phone was *sent*; only `desync-scan.py` says what the game *did*.
  Presses that pass the auditor's 20 ms floor were still dropped: a monitor
  press within 180 ms of a mask press is lost about half the time, because the
  monitor bar is not drawn while the mask is up. 9 of 14 catalogued desyncs are
  that one seam. See `ON-DEVICE-VALIDATION.md` §"Which press desyncs, and why".
- **One lost monitor press inverts the rest of the night**, and nothing in the
  run notices: the vent read photographs the camera feed, the hall press pans
  the map, the box stops being wound, and the log still reads like a schedule.
  Never observe the monitor inside `MONITOR_ANIM_DOWN` (367 ms) of a monitor
  press — night 6-38's "correction" was a false positive taken 247 ms in, and it
  caused the desync it was looking for.
- `dumpsys window` prints several `mCurrentFocus` lines and the first is often
  `null` mid-transition. Match the package across all of them, never `-m1`.
- **`cmd | tr ... | grep -q` is a broken guard under `set -o pipefail`.** `grep -q`
  exits on the first match, `tr` dies of SIGPIPE, and the pipeline reports 141 --
  so the `if` reads false precisely when the pattern *did* match. It skipped the
  Bluetooth-audio guard twice and let two nights record silence. Measured: only
  a raw streaming filter is affected -- `adb | grep -q` and `adb | grep | grep -q`
  are fine, because `grep` handles SIGPIPE and exits cleanly. Use a herestring
  (`grep -q PAT <<<"$captured"`), and don't "fix" the pipelines that are fine.

## The simulator prices nothing

`pilottest`/`hidpilottest` count frames. A press and a screencap both look free,
so **any survival figure is a statement about the model**, not the device. Do
not promote a policy on simulator survival alone, and say "in the simulator"
when quoting one.

`--device-actuator` narrows that gap without closing it: it prices a run
through the measured phone (launch lateness, the mask-seam monitor drop —
`tools/device/actuator.mjs`). Under it the shipped n6 target goes 500/500 →
0/200, dying to the forcedown parity cascade — which is a statement about
these pilots' *open-loop* monitor model: the live runner's checkpoint read
and verified recovery are not modeled. Survival under the actuator is still
survival in a model.

## Numbers need their control

A favourable number is not a result until something that *should not* produce it
has been checked. A detector reporting 22 thuds across 285 s of night audio was
reported as working, and reasoned about at length, before a waveform
cross-correlation showed **all 22 were false positives**. The controls that
would have caught it were cheap: a recording that cannot contain the cue, and a
second signature that fails differently.

## A run length is a graded interval, not wall clock

`tools/device/grade-run.sh RUN_NAME` runs every instrument this repository owns
against one run and prints one verdict. Run it before quoting any number off a
device run, and quote the interval it reports.

The reason is a worked example. Nights 6-36 and 6-37 were reported at **163 s** and
**153 s**, "past 2 AM", a new record. Graded, they were **26.0 s** and **72.2 s**
alive. The rest was the pilot pressing into a dead game: the retained classifier
frames show the death static, the "Take cake to the children" minigame, and a
"12:00 AM 6th Night" restart card. Two independent failures produced that:

- The watchdog's fast path recognised exactly one way of being dead (a bright,
  silent static screen) and answered "night" to everything else. A detector that
  knows one way to be dead must never be what says you are alive. It may only
  *add* a detection; `screenstate.py` stays the authority.
- `GRADE_RUN=1` graded `"$OUT.mp4"`, and every run ending in an abort saves
  `"$OUT-aborted.mp4"`. So the grading step ran against a file that did not
  exist, printed nothing, and looked exactly like grading in the log.

**A pipeline that silently grades nothing is worse than no pipeline**, because
it reads as coverage. If a step cannot find its input, it must say so and fail.

## Instruments are not a pipeline

This repository is full of instruments -- `camtrace.py`, `sweepcheck.py`,
`windpct.py`, `grade-minus7.py`, `screenstate.py`, `grade-night.py`,
`test-hid-trace.mjs`, `replay-screen-model.py` -- and the failure mode is never
that one is missing. It is that each has to be *remembered*, and what is not
remembered is not run. `screenstate.py` could have refuted the 163 s claim from
any single frame of that recording; nobody invoked it.

So: do not add an instrument without adding it to `grade-run.sh`. An instrument
nobody runs is a comment. This is now enforced: `test-grade-run-coverage.mjs`
fails the engine suite on any `tools/device` script that is neither invoked by
`grade-run.sh` nor consciously excluded, with a reason, in its exclusion list.

## Retractions stay

When a result turns out wrong, correct it in place and keep the original
reasoning with a dated note. Several documents here are worth more for their
retractions than their conclusions.

## Checks

```sh
node tools/test.mjs --engine     # about a minute; run on every edit
tools/device/test-query-cue-helper.sh
tools/device/test-soak-cue-helper.sh
```

CI (`.github/workflows/ci.yml`) runs these three on every push to `master`.
The `--browser` checks stay local: they are graded in real-time milliseconds,
and a loaded shared runner fails them without saying anything about the code.

Device tooling has mock-ADB regressions that never touch a phone. Use them —
they are how a device tool gets tested without a device.
