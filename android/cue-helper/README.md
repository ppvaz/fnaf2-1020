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

Any projection, display, image, or audio failure marks the corresponding sensor
unavailable. Projection stop tears both paths down. The service is deliberately
`START_NOT_STICKY`: it never tries to reuse consent after process death.

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
RUNNING visual=OBSERVED seq=... rgba=... luma=... ageUs=... audio=OBSERVED rate=... rms=... peak=... ageUs=...
```

This is measurement plumbing, not a promoted controller. Preserve the existing
screencheck/HID path until independent holdouts and a full-night soak pass.

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
