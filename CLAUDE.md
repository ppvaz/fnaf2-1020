# Working notes for this repository

This project is mostly an **evidence argument**, not a codebase. Most of the
cost here is not writing code — it is drawing a conclusion the repository had
already answered, and then building on it. Every item below exists because that
happened, and the fix is always the same: read the page that already knows.

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
- **Short taps get dropped** — Fusion polls touch per frame. Use duration
  presses (`input swipe x y x y 120`), which is why `PRESS_MODE=fast-swipe`
  exists and is not merely legacy.
- `dumpsys window` prints several `mCurrentFocus` lines and the first is often
  `null` mid-transition. Match the package across all of them, never `-m1`.

## The simulator prices nothing

`pilottest`/`hidpilottest` count frames. A press and a screencap both look free,
so **any survival figure is a statement about the model**, not the device. Do
not promote a policy on simulator survival alone, and say "in the simulator"
when quoting one.

## Numbers need their control

A favourable number is not a result until something that *should not* produce it
has been checked. A detector reporting 22 thuds across 285 s of night audio was
reported as working, and reasoned about at length, before a waveform
cross-correlation showed **all 22 were false positives**. The controls that
would have caught it were cheap: a recording that cannot contain the cue, and a
second signature that fails differently.

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

Device tooling has mock-ADB regressions that never touch a phone. Use them —
they are how a device tool gets tested without a device.
