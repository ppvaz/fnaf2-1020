# FNaF 2 visual cue-helper probe

The APK owns only the user-approved `MediaProjection` visual stream:

- one persistent `20x9` `VirtualDisplay` backed by an `ImageReader`;
- direct RGBA sampling of logical pixel `(3,6)`; and
- the authenticated loopback/abstract control sockets used by the device
  harness.

Audio is deliberately external. The phone renders FNaF 2 audio to its selected
output, while an external audio authority observes that rendered signal and
publishes facts to the controller. The current host adapter is
`tools/cue/audio-authority.py`, whose current adapter reads a validated A2DP
PCM path. An ESP32 receiver can be another adapter: it must publish the same
`fact-message-v1` fields, with a transport-specific `calibrationProfile` such
as `g56-esp32-a2dp-v1`. The APK therefore does not claim that it captured
audio and has no `RECORD_AUDIO` or `AudioPlaybackCapture` dependency.

This separation is intentional: the audio authority follows the actual
physical receiver, whether that receiver is the current host adapter or an
ESP32, and the
controller can reject stale, missing, or out-of-order facts. A missing route
is `UNKNOWN`, never a negative cue.

The APK now also monitors the phone's A2DP connection to the configured
receiver (`pedro-82cg`, `C4:23:60:B6:03:40`). **Connect audio receiver** opens the
system Bluetooth settings and the status card reports `DISCONNECTED`,
`CONNECTED`, or `STREAMING`. This is a phone-side connection aid and monitor;
the external audio authority remains responsible for the received PCM and
transport route.
Android does not expose a regular-app API to force the user's selected A2DP
output, so pairing/connecting still requires the system Bluetooth UI.

The visual path reports `OBSERVED` values rather than making an empty/threat
claim. Its pixel rule must be recalibrated against frames from the exact target
device before it may control an action. The APK is measurement plumbing, not a
promoted controller.

The visual status also carries a fail-closed screen identity gate. It reports
`screen=CUE_HELPER` only when the 20x9 sensor matches the stable helper layout
calibrated from the retained portrait and landscape frames. A valid frame that
does not match the helper is `screen=UNKNOWN`; it is not promoted to
`FNAF_2`, Android settings, or any other semantic screen. This prevents a
capture of the helper UI itself from being interpreted as game content.

## Build and install

The build is intentionally Gradle-free. It uses the installed Android 36 SDK
and a JDK directly:

```sh
android/cue-helper/build.sh
adb install -r android/cue-helper/build/cue-helper.apk
adb shell am start -n com.fnaf2.cuehelper/.MainActivity
```

If the SDK or JDK is elsewhere, set `ANDROID_SDK_ROOT` or `JAVA_HOME`. Generated
build output and the local debug keystore are ignored.

`android/cue-helper/test.sh` compiles the detector/model parser and visual
helpers against their host unit tests. The detector source is retained for
offline compatibility coverage; it is not packaged into the APK and is not an
on-device audio path. The external authority has its own phone-free regression
at `tools/cue/test-audio-authority.py`.

On the phone:

1. Tap **Connect audio receiver**, grant `BLUETOOTH_CONNECT` if requested, and
   connect `pedro-82cg` in the system Bluetooth settings.
2. Confirm the APK reports `CONNECTED` or `STREAMING` for the receiver.
3. Tap **Start video capture** and grant screen-capture consent.
4. Start the external audio authority on the receiver host, for example:

   ```sh
   tools/cue/audio-authority.py \
     --socket /tmp/fnaf2-audio.sock \
     --profile g56-bluealsa-a2dp-v1
   ```

5. Tap **Open FNaF 2**.
6. Exercise the exact lit-left view used by `bb-left` calibration.
7. Inspect the Android log and the authority's fact stream.

The authority's route preflight is transport-specific because this adapter
currently implements BlueALSA:

```sh
tools/cue/audio-authority.py --check
adb logcat -s FnafCueHelper:I '*:S'
```

A healthy APK line contains visual data and explicitly identifies audio as an
external dependency:

```text
RUNNING visual=OBSERVED seq=... rgba=... luma=... ageUs=... content=2400x1080 visible=1 audio=EXTERNAL authority=audio-authority state=UNKNOWN reason=external-authority-not-connected control=READY ...
```

When the captured content is the helper UI, the visual portion additionally
contains `screen=CUE_HELPER screenScore=...`. If the capture is fresh but the
screen signature is not recognized, it contains `screen=UNKNOWN`; this is a
semantic refusal, not a stale-frame failure.

The APK's A2DP card is only a connection/playing-state indicator. The
authoritative audio facts are still the newline-delimited JSON messages emitted
by the host authority. The app does not claim that the PCM is available to the
Android process.

On API 34+, the helper consumes `onCapturedContentResize()` and
`onCapturedContentVisibilityChanged()`. Hidden, not-yet-sized, stale, or
aspect-mismatched content is `visual=UNKNOWN`; its sampled pixel is never
reported as usable. API 29–33 can still run the visual probe, but do not
provide the same captured-content invariants. Game focus remains a separate
invariant enforced by the device harness.

## External audio authority

The host authority publishes compact `fact-message-v1` records to stdout and,
when `--socket` is supplied, to a Unix stream socket:

```json
{"schema":"fact-message-v1","seq":0,"type":"audio-route","state":"OBSERVED","confidence":1.0,"source":"audio-authority","calibrationProfile":"g56-bluealsa-a2dp-v1","t_received":123,"value":true,"latencyMin":150,"latencyMax":250}
```

The `source` is deliberately transport-neutral. The profile identifies the
calibrated receiver/backend. An ESP32 transport adapter should retain the
same schema, source, primitive values, timestamps, latency bounds, and ordered
sequence numbers, while selecting its own profile. The existing
`src/fact-link.js` receiver is the validation boundary for those messages.
`tools/cue/collect-facts.py` can persist a subscribed stream as a per-run
sidecar; `trial.sh CUE_AUDIO=1 AUDIO_AUTHORITY_SOCKET=PATH` uses that path.

With no model, the authority emits route, RMS, and peak facts only. With an
ignored `cue-model-v1` file, it can emit shadow-only `wind-tick` observations:

```sh
tools/cue/audio-authority.py \
  --socket /tmp/fnaf2-audio.sock \
  --model captures/cue-helper/models/example-cue-model.txt \
  --profile g56-bluealsa-a2dp-v1
```

The model must be calibrated for the selected external transport. A model
captured from Android's deprecated playback-capture path is not evidence for
BlueALSA or ESP32 and must not be reused without external re-calibration.

For a latency probe, a named non-phase template may be enabled explicitly with
`--shadow-cue bang`; this only publishes a shadow fact and cannot arm a control
window. Detector promotion still requires independent held-out calibration.

The current BlueALSA adapter uses the phone's A2DP output and reads
`S32_LE` stereo at 48 kHz, downmixing to 4 kHz mono for the optional matcher.
Those details belong to this adapter, not to the APK/fact contract. The
one-shot recorder remains available for raw evidence:

```sh
tools/cue/capture-bt-audio.sh --check 10:2B:1C:DA:18:2C
```

## Snapshot boundary

The APK's authenticated control socket serves visual observations only. A
fresh 128-bit token is created per consented run. Every request is one bounded
ASCII line; malformed, oversized, or unauthenticated requests receive an
error and no sensor data.

| Request | Response | Notes |
|---|---|---|
| `GET <token>` | `OK <snapshot>` | Current monotonic visual snapshot plus `audio=EXTERNAL`; never PCM or an image. |
| `GRID <token>` | `OK grid=20x9 ...` | Full visual sensor grid. |
| `WATCH <token> status\|<hash>` | `OK watch=...` | Inspect or activate the native visual watchlist. |
| `READ <token>` | `OK read=...` | Read the active visual watchlist. |

`CAL`, `REC`, `LOG`, `MODEL`, `ARM`, and `RESULT` are no longer APK commands;
the service returns `ERROR audio-authority-external`. Audio capture, model
loading, and cue observation belong to the external authority. The device
query wrapper consequently supports only visual snapshot/grid/watchlist/read
operations for this APK.

The two visual channels are:

| Channel | Endpoint | For |
|---|---|---|
| loopback TCP | `127.0.0.1:49707` | the on-device visual controller |
| abstract unix | `@com.fnaf2.cuehelper.control.<session>` | host tooling over `adb forward` |

```sh
tools/device/query-cue-helper.sh                    # loopback snapshot
tools/device/query-cue-helper.sh forward            # forwarded snapshot
tools/device/query-cue-helper.sh grid               # render the visual grid
tools/device/query-cue-helper.sh watchlist status
```

Projection stop tears down the visual display and both control workers, so a
new consent session can start in the same app process. The service remains
`START_NOT_STICKY` and never tries to reuse consent after process death.

## Consent without a tap

On the development phone, this app-op can short-circuit the projection dialog:

```sh
adb shell appops set com.fnaf2.cuehelper PROJECT_MEDIA allow
adb shell appops set com.fnaf2.cuehelper PROJECT_MEDIA default   # undo
```

Leave it at `default` unless a harness run needs it. This affects screen
capture for this app only.

## Target-device visual result

The API-36 Moto g56 previously delivered the `20x9` stream at approximately
60 frames/s during animated content, with typical image-timestamp-to-callback
age around 1–3 ms. A 40-minute memory soak is still required before visual
stability is considered proven:

```sh
tools/device/soak-cue-helper.sh
```

The soak checks helper lifetime, focus, visual sequence progress, content
geometry/visibility, status freshness, PSS/RSS, thread count, and thermal
status. It does not validate external audio; run the authority's route/fact
checks alongside it. Preserve the existing screencheck/HID path until the
independent visual holdout and full-night gates pass.
