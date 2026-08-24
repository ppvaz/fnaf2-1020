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

This is a route decision, not a claimed clear. The current left-opening branch
in `trial-minus7.sh` is still the deliberately slow 6.5 s capture/safe-stop
calibration path. It must be retimed around the 340 ms HID camera sweep and the
full BB response must pass simulation before another full-night device attempt.

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
- It does not imply the same flashlight-power budget is affordable on 10/20
  Night 7. The current scope is Night 6.
