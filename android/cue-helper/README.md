# Unified MediaProjection cue-helper probe

This is the first runnable APK for the combined on-device sensor. One
user-approved `MediaProjection` owns:

- exactly one persistent `20x9` `VirtualDisplay` backed by an `ImageReader`;
- direct RGBA sampling of logical pixel `(3,6)` without creating a bitmap; and
- one mono PCM16 `AudioRecord`, filtered to `com.scottgames.fnaf2` through
  `AudioPlaybackCaptureConfiguration`.

The visual path currently reports `OBSERVED` values rather than making an
empty/threat claim. The offline pixel rule must be recalibrated against frames
produced by this exact target-device compositor before it may control an action.
The audio path reports only RMS/peak plumbing evidence; cue templates and
window arming remain behind the gates in
[`plans/08-audio-cue-controller.md`](../../plans/08-audio-cue-controller.md).

Any projection, display, image, audio, or local-control failure marks the
corresponding path unavailable. Projection stop tears every path down. The
service is deliberately `START_NOT_STICKY`: it never tries to reuse consent
after process death.

## Build and install

The build is intentionally Gradle-free. It uses the installed Android 36 SDK
and a JDK directly:

```sh
android/cue-helper/build.sh
adb install -r android/cue-helper/build/cue-helper.apk
adb shell am start -n com.fnafminus7.cuehelper/.MainActivity
```

If the SDK or JDK is elsewhere, set `ANDROID_SDK_ROOT` or `JAVA_HOME`. Generated
build output and the local debug keystore are ignored.

On the phone:

1. Tap **Start unified capture**.
2. Grant audio permission and screen-capture consent.
3. Tap **Open FNaF 2**.
4. Exercise the exact lit-left view used by `bb-left` calibration.
5. Return to the helper or inspect the device log.

```sh
adb logcat -s FnafCueHelper:I '*:S'
```

A healthy line contains both observations:

```text
RUNNING visual=OBSERVED seq=... rgba=... luma=... ageUs=... content=2400x1080 visible=1 audio=OBSERVED rate=... rms=... peak=... ageUs=... control=READY port=49707 socket=... token=...
```

On API 34+, the helper also consumes `onCapturedContentResize()` and
`onCapturedContentVisibilityChanged()`. Content the callback reports as hidden,
not yet sized, stale, or aspect-mismatched is `visual=UNKNOWN`; its sampled
pixel is never reported as a usable observation. API 29–33 can still prove
playback capture, but the visual probe remains `UNKNOWN` because those content
invariants are not available. Game focus remains a separate invariant enforced
by the device harness and soak command.

`content=` and `visible=` are `[CALIBRATED]` on the API-36 Moto g56
(2026-08-24). The platform documents both callbacks only by example, for a
captured *task*, and the helper consents through
`MediaProjectionConfig.createConfigForDefaultDisplay()` — a whole-display
session. That session does emit both, immediately after capture begins:

```text
captured content resized: 1080x2400
captured content visible=true
```

The aspect gate then earns its keep straight away. With the phone in portrait
the same run reports `visual=UNKNOWN reason=aspect-mismatch content=1080x2400
visible=1`, because sampling pixel (3,6) of a portrait frame letterboxed into
the 20x9 surface would be meaningless. It flips to `visual=OBSERVED
content=2400x1080` the moment FNaF takes the display in landscape. A capture
that never reported geometry would show `reason=visibility-pending` in the
first second, not 40 minutes into a soak.

This is measurement plumbing, not a promoted controller. Preserve the existing
screencheck/HID path until independent holdouts and a full-night soak pass.

## Snapshot boundary

One protocol, served on two channels. A fresh 128-bit token is created per
consented run and published in the helper's own log. `GET <token>` returns one
bounded ASCII line with the current monotonic snapshot; malformed, oversized,
or incorrectly authenticated requests receive an error and no sensor data.
Audio never crosses as PCM, and visual frames never cross as images.

| Channel | Endpoint | For |
|---|---|---|
| loopback TCP | `127.0.0.1:49707` | the on-device controller, which must decide without an adb round trip |
| abstract unix | `@com.fnafminus7.cuehelper.control` | host tooling over `adb forward`, with nothing on the device opening a port |

Both are `[CALIBRATED]` on the target (2026-08-24). Either channel failing
downgrades the status line to `control=DEGRADED` with the dead endpoint printed
as `none`; one dead listener never silences the other.

```sh
tools/device/query-cue-helper.sh            # loopback, the default
tools/device/query-cue-helper.sh forward    # cable-bound abstract socket
```

Both resolve the current helper PID/token, require an FNaF-focused physical
display, and fail if the returned visual snapshot is `UNKNOWN`. `loopback`
performs the exchange entirely inside one `adb shell`, so it models what the
controller will do on the phone; `forward` allocates an ephemeral host port and
removes it again on exit. Either way this is a bridge for calibration and
timing work, not a live host-driven controller.

Two device details cost real time here, both fixed in the code but worth
knowing:

- `InetAddress.getLoopbackAddress()` resolves to `::1` on this target, so the
  documented `127.0.0.1:49707` contract was refused until the bind was pinned
  to the IPv4 loopback. The listener correctly appears in `/proc/net/tcp6` as
  `::ffff:127.0.0.1` — Java's v4-mapped form, not an IPv6 bind.
- macOS BSD `nc` returns an empty body for the forwarded exchange even when
  `adb forward` is healthy. The host client is `python3`, not netcat.

### Consent without a tap

`MediaProjection` consent normally needs a human tap, which makes repeatable
soak runs awkward. On this dev phone the app op short-circuits the dialog:

```sh
adb shell appops set com.fnafminus7.cuehelper PROJECT_MEDIA allow
adb shell appops set com.fnafminus7.cuehelper PROJECT_MEDIA default   # undo
```

Leave it on `default` unless a harness run needs it. It removes the screen
capture prompt for this app only.

One harness note: `uiautomator dump` returned a stale layout for this
activity's buttons once the status text grew, and presses landed on nothing.
`adb exec-out screencap -p` is the reliable way to locate them.

## First target-device result (2026-08-24)

The API-36 Moto g56 ran one unified projection with the real FNaF process:

- the `20x9` stream delivered approximately 60 frames/s during animated game
  content, with typical image-timestamp-to-callback age around 1–3 ms;
- 16 kHz mono PCM16 playback capture was nonzero while the phone/game output
  was muted, then returned to exact silence when FNaF stopped;
- a normal six-cycle Night 6 pilot completed all 7/7 selected-camera sweeps in
  37.58 s, versus 37.72 s for the retained no-helper baseline;
- the two recordings contained 2,084 and 2,104 frames respectively, a roughly
  0.6% rate difference that one run cannot distinguish from ordinary variance;
- after about 40 minutes of active projection, thermal HAL status remained 0:
  CPU 38.6 C, GPU 38.5 C, SOC 39.1 C, skin 30.0 C, and battery 28.8 C.

The first integration failure was not capture performance. The virtual display
adds an expected `mCurrentFocus=null` record before the physical display's FNaF
record, exposing a single-display assumption in `trial-minus7.sh`. The focus
guard now searches specifically for an FNaF-focused record and still fails
closed if none exists.

The first soak also found an unresolved memory gate. Helper PSS was about 49.5
MiB at an earlier sample and 81.3 MiB near the 40-minute stop point. The probe
was formatting a new visual status string on every 60 fps frame despite logging
only periodically. The implementation now formats only once per second and
reduces status/log cadence, but this optimized build has not yet repeated the
40-minute soak. Do not call memory stability proven until it does.

With capture already running and FNaF visible in calibrated landscape, the
repeatable gate is:

```sh
tools/device/soak-cue-helper.sh
```

It takes 41 one-minute samples (40 minutes endpoint-to-endpoint) into ignored
`captures/cue-helper/`, fails on a helper restart, lost game focus, stalled
visual/audio stream, stale status, or fail-closed visual status, and records
PSS, RSS, thread count, frame ages, captured-content geometry/visibility, and
thermal status. It does not launch, focus, or press the game. Use shorter
explicit sample/interval arguments only for plumbing checks; they do not close
the long-soak gate.
