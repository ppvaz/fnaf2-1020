# Android HID multitouch: the two traps

This note records the stock-device input work from 2026-08-24 so a later
session does not have to rediscover it. The target was a Moto g56 5G running
the official FNaF 2 Android v2.0.7 build, but both failures are general Android
HID concerns.

## Outcome

`/system/bin/hid` can drive reliable two-finger input without root. A verified
report stream held contact 0 on the camera-light control while contact 1 tapped
CAM 10, CAM 04, and CAM 07. The recording contained the complete
`10 -> 04 -> 07 -> 11` selected-camera trace while the light stayed down.

The working device fixture is
[`tools/device/hid-multitouch-smoke.json`](../../tools/device/hid-multitouch-smoke.json).
It is a **device action**: it selects 6th Night and injects touches. Do not run
it unless the game is focused and it is safe to start that night.

## Night 6 strategy consequence

HID buys enough cycle time to change **where** Balloon Boy is detected; it does
not make Balloon Boy safe to ignore. The exact simulator's HID schedule with no
BB read or response survived **0/3000** Night 6 runs, predominantly through the
BB-to-Foxy failure chain.

CAM 05 is therefore not the selected Night 6 checkpoint. The project already
has a device-validated classifier for BB in the lit left opening, including two
independent positives and an untouched simultaneous BB/Golden-Freddy frame.
That check uses the left vent light, which does not consume flashlight battery.
The HID time saving belongs there: shorten the camera sweep, keep the
once-per-cycle left-opening read, and start the five-tick mask response only
when that read is non-empty. CAM 05 remains useful for calibration or strategy
comparison, not as a required step in the intended Night 6 controller.

This is a route decision, not a claimed clear. The phase-independent simulator
policy now survives **10000/10000** ordinary and **3000/3000** pinned-worst
Night 6 runs, with no missed BB state, a minimum 56% box, and a compact 267 ms
three-camera sweep. Its all-threat negative control fails, so the classifier
cannot safely fail closed on every cycle.

The 267 ms sweep in that result is an **idealized simulator actuator**, not a
phone result. Device trials below now prove that this distinction is
load-bearing. `HID_LEFT_SURVIVAL=1` is consequently capped at four pre-read
epoch/sweep-probe cycles; it cannot reach a BB decision or be used for a
full-night attempt.

## Night 7 sparse CAM 05 probe

Phase-aligning CAM 05 checks removes many unnecessary reads, but does not make
the measured lit-capture path affordable on 10/20 by itself. BB starts at CAM
10 and needs four successful five-second rolls to reach CAM 05, so 20.0 s is
the absolute arrival bound. A check immediately *before* that boundary is too
early: the first useful pre-boundary read completes just before 25 s (or it can
run immediately after 20 s). After a negative, every following five-second
boundary still needs coverage until BB is found.

A CAM 05 positive also does not guarantee that one raise will put BB in the
opening. His final hop retains the Night 7 75% movement roll. The controller
must lower across the opportunity, raise and read again, and repeat when he is
still on CAM 05; otherwise the nominal one-raise response silently fails one
time in four.

`tools/hidpilottest.mjs --night=7 --sparse-cam5` preserves those constraints.
With the current 520 ms lit-read model it survived **0/5000** ordinary and
**0/1000** pinned-worst nights: the battery reached zero and the resulting
failures were overwhelmingly Foxy. The same schedule with hypothetical unlit,
free reads survived **3000/3000** ordinary and **1000/1000** worst-luck nights,
with no missed BB states, proving that timing rather than route logic is the
barrier. It averaged 48.8 reads per ordinary night and 41 in worst luck.

A diagnostic 370 ms light hold survived **3000/3000 + 1000/1000**, but its
minimum remaining power was only 9 frames in the ordinary set. The phone needs
about 350 ms merely to draw a visibly lit vent, before screencap readiness, so
370 ms is an unvalidated and operationally fragile threshold—not a Night 7
controller claim. Sparse CAM 05 becomes viable only if an on-device immutable-
buffer test proves that acquisition bound with margin, or the base flashlight
cycle is made cheaper. Music-box time is not the limiting resource here.

### Cheaper phase-windowed left-opening candidate

CAM 05 is not the architecture floor. A sparse left-opening controller can use
the battery-free vent light, provided it controls the scheduler phase tightly:

1. Wait until BB can first have reached the opening.
2. Lower, clear a possible office Golden Freddy, and reset Foxy.
3. Acquire the free lit-left frame, then put on the prophylactic mask while the
   classifier finishes.
4. On an empty result, wind and land the normal late three-camera sweep. On BB,
   retain that mask through the aligned five ticks and recover before the prior
   camera stuns expire.

`tools/hidpilottest.mjs --night=7 --sparse-left` makes the dependency explicit.
At zero pilot offset it survived **10000/10000 ordinary and 3000/3000 pinned-
worst** nights with no missed BB state, a minimum 57% box, and **1257/3000**
flashlight frames remaining. A 340 ms offset survived another **1000/1000**;
345 ms survived only **1/1000**, overwhelmingly failing to Foxy. The useful
epoch window is therefore bounded between those measurements, not described as
generic timing tolerance.

That is a useful architecture upper bound, but it is **rejected for the stock
HID phone pilot**. Two independent device gates were measured rather than
inferred.

#### Scheduler phase: acquired

`DEVICE_EPOCH_LATCH=1` now detects the first immutable frame containing both
the top-right clock and full top-left flashlight meter entirely on-device. It
requires the signature on two consecutive frames but preserves the first
matching timestamp as T0. The two-part predicate matters: the first clock-only
version falsely triggered once on the bright title animation after four
captures, and the night watchdog correctly aborted it.

The confirmed detector produced last-clear → first-HUD brackets of **252, 312,
331, and 305 ms**. The asymmetric simulator phase sweep tolerates delayed T0
through about 340 ms but almost no early T0, so the conservative first-positive
edge is correct; midpoint interpolation is not. A 94-second recorded trial put
1 AM **69,950 ms** after the first office HUD, within the analyzer's 50 ms
resolution of the sourced 70,000 ms hour edge. `tools/device/clocktrace.mjs`
turns that relationship into an assertion.

MediaProjection can tighten this observation and replace the screencap loop,
but scheduler phase is no longer the unresolved blocker. Any replacement must
retain the originating image timestamp and the two-part false-positive gate.

#### Camera actuator: rejected

The ideal table needs CAM 10, CAM 04, and CAM 07 inside a 267 ms lit sweep.
Phone recordings rejected batched 267, 357, 477, and 597 ms gestures: early
forms rendered only CAM 07, wider forms accepted inconsistent subsets, and a
burst of `hid delay` commands did not behave as a cumulative macro. The
shortest repeatedly proven primitive remains wall-timed: 70 ms light settle,
100 ms contacts starting 240 ms apart, and **790 ms total**. A corrected staging
recording showed **2/2 complete 10 → 04 → 07 → 11 traces**.

`tools/hidpilottest.mjs --night=7 --sparse-left --device-sweep` models that
exact 70/240/240/240 ms device profile, shifts the late sweeps earlier, prevents
wind/contact overlap, and prices the later BB recovery. It survived **0/3,000
ordinary and 0/1,000 pinned-worst** nights; Golden Freddy, inside-office, and
Foxy failures show that the longer sweep destroys the stun bridge rather than
merely costing box time. `--assert-rejected` preserves this negative contract.

Therefore MediaProjection alone does not promote sparse-left: it improves the
observer, while the disproven component is now the actuator/policy combination.
The branch reopens only with a separately verified faster camera actuator or a
new exact-simulator policy built around the 790 ms sweep.

The perfect-vocal comparison is useful but not a fallback by itself. Counting
three source events before enabling the 520 ms CAM-05 path survived 3000
ordinary and 1000 worst-luck simulations, leaving at least 218 and 373 power
frames respectively. Forcing any single counted vocal to be missed made the
same policy survive 0/1000. Plan 08 therefore retains vocals as an occasional
visual-check arm or measured research signal, not as the now-unneeded primary
phase source and not as an audio-only route counter.

### Screencap readiness is observable

Starting `screencap` and masking after a fixed delay does not identify which
frame SurfaceFlinger captured. On this phone, a fixed 80 ms overlap returned
both a literal mask frame and an unlit-office frame. The useful boundary is the
first output byte: start `screencap` into a file while the left vent light is
held, poll until the file becomes non-empty, then release the light and put on
the mask while capture and classification finish. At that point the captured
buffer is immutable.

A three-cycle Night 6 staging run started capture in parallel with the vent
draw. The first byte arrived at +690 ms, +764 ms, and +761 ms from each cycle
anchor; all three retained frames classified as confident `empty` results.
The runner also locks its strategy capture against the safety watchdog and no
longer treats a transient unavailable watchdog capture as evidence that the
night ended. This validates the empty capture path only—not BB response timing
or a complete night.

## Trap 1: UHID open is earlier than Android input readiness

The `hid` command returns from registration after the kernel sends
`UHID_START` and `UHID_OPEN`. That does not mean `InputReader` has attached the
new touchscreen. On this phone the measured gap was about **5.1 seconds**:

```text
01:20:41.483  hid process opens/registers the UHID device
01:20:46.585  InputReader: Device added ... sources=TOUCHSCREEN
```

Reports sent in that gap are silently lost. A two-second sleep therefore
registered a touchscreen that Android could list later, while every early game
input appeared to do nothing.

Do not pay this delay inside a live night. Start the persistent HID process on
the title screen, then gate on the device name appearing in `dumpsys input`.
Only start the night after that framework-level readiness signal. A fixed
seven-second delay is acceptable for an isolated fixture; the real runner
polls readiness with a timeout.

This is the same distinction called out by AOSP's
[`hid` documentation](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/cmds/hid/README.md):
kernel readiness does not account for inputflinger, and a controller must wait
for the input-device-added notification before issuing reports.

## Trap 2: Contact Count describes records in the packet

The report descriptor carries two finger collections. Each finger occupies
five bytes:

```text
flags/contact-id, X low, X high, Y low, Y high
```

The low two flag bits are Tip Switch and In Range. The upper six bits are the
Contact Identifier. Therefore these are the important first bytes:

```text
0x03  contact ID 0 active
0x07  contact ID 1 active
0x00  contact ID 0 inactive
0x04  contact ID 1 inactive
```

The failed stream changed from two active fingers to one like this:

```text
contact_count = 1
ID 0 active
ID 1 inactive
```

Linux stopped after consuming the one record promised by `contact_count`, so
it never read ID 1's inactive record. Contact 1 remained down. Later camera
"taps" became `ABS_MT_POSITION` moves in the same slot, and even the nominal
all-up packet released only contact 0.

The working transition includes both records even though only one remains
active:

```text
contact_count = 2
ID 0 active at the held light coordinate
ID 1 inactive at its last camera coordinate
```

That produces `ABS_MT_TRACKING_ID = -1` for slot 1. The next camera packet can
activate ID 1 again and receives a fresh tracking ID. Releasing everything uses
two inactive records for the same reason.

This matches Linux's hybrid multitouch implementation: the contact-count field
sets how many contact collections the driver expects to consume from the
report. It also matches mature automation interfaces such as
[`minitouch`](https://github.com/DeviceFarmer/minitouch), which model every
contact's down/up lifecycle explicitly and warn that a lost touch-end corrupts
the stream.

## Verified report sequence

For a held-light camera tap:

1. Send one active record for ID 0 at the light coordinate.
2. Send two active records: ID 0 unchanged, ID 1 on the camera button.
3. Hold for at least 100-120 ms so the 30 Hz Fusion runtime sees it.
4. Send a two-record packet: ID 0 active, ID 1 inactive.
5. Repeat steps 2-4 for the next camera.
6. Send a two-record packet with both IDs inactive to release the light.

The kernel trace must show a new `ABS_MT_TRACKING_ID` for slot 1 followed by
`ffffffff` before the next camera. Merely seeing two Android pointer dots is
not sufficient evidence.

## Coordinate mapping on this phone

The virtual descriptor uses 2400x1080 axes, but InputReader exposes it through
the phone's portrait-natural display before rotating the landscape game. The
measured inverse transform from game coordinates is:

```text
rawX = (1080 - screenY) * 20 / 9
rawY = screenX * 9 / 20
```

Keep this device-specific mapping in the controller. Recalibrate it for a
different resolution or orientation.

## Evidence and limits

- The corrected kernel trace emitted independent slot-1 down/up pairs for all
  three camera buttons.
- `camtrace.py` found CAM 10 for 0.30 s, CAM 04 for 0.30 s, CAM 07 for 0.63 s,
  then CAM 11: one complete sweep and no incomplete starts.
- This proves the multitouch primitive, not a complete Night 6 strategy.
- A subsequent 130-second run collected 25 clean unlit CAM 05 frames. They
  were visually unusable for BB detection, confirming the device owner's
  observation. The earlier unlit idea came only from ambiguous video/action
  timing and is rejected; `BB_CAM05_UNLIT` remains a negative-control capture
  switch, not a survival path.
- Omitting every BB read/response is also rejected (0/3000 exact Night 6
  simulations). The intended replacement for CAM 05 is the validated lit
  left-opening read, not a blind cycle.
- The phase-safe left-opening policy passes 10000 ordinary and 3000 worst-luck
  exact Night 6 simulations. Device evidence currently covers only three empty
  classifier cycles; the older staged response table is not a clear claim.
- It does not imply the same flashlight-power budget is affordable on 10/20
  Night 7. The current scope is Night 6.
