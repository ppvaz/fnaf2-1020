# FNaF 2 visual cue-helper probe

The APK owns only the user-approved `MediaProjection` visual stream:

- one persistent `20x9` `VirtualDisplay` backed by an `ImageReader`;
- direct RGBA sampling of logical pixel `(3,6)`; and
- the authenticated loopback/abstract control sockets used by the device
  harness.

Audio uses the external loopback path:
`FNaF 2 -> Bluetooth A2DP -> ESP32 -> PCM UDP 49710 -> APK`. The ESP32
decodes the complete A2DP mix and sends the PCM to the phone on `FNAF2-AUDIO`.
The APK validates the packet contract, feeds the same payload to its analyzer
and WAV recorder, and the optional phone monitor reproduces it through an
`AudioTrack` routed to the built-in speaker. Because this phone's media
strategy remains globally attached to A2DP, the monitor uses the independent
alarm/speaker strategy and 4x saturating PCM gain; routing it as ordinary media
causes AudioFlinger to remove the track before playback. Health facts remain
on UDP `49709`.
The PC/BlueALSA authority is an optional offline/legacy calibration path; it is
not required at runtime. The APK has no `RECORD_AUDIO` or
`AudioPlaybackCapture` dependency.

The ESP32 image is intentionally transport-only: it contains no cue assets,
semantic names, or matched filters. The phone is the authority for cue IDs,
timestamps, phase clock, visual context, recording, and human monitoring. A
missing route or missing PCM is `UNKNOWN`, never a negative cue.

The APK now also monitors the phone's A2DP connection to the configured
receiver by the stable name `FNAF2 Audio Consumer`; its Bluetooth address is
discovered at runtime and may differ between ESP32 boards. **Connect audio receiver** opens the
system Bluetooth settings and the status card reports `DISCONNECTED`,
`CONNECTED`, or `STREAMING`. This is a phone-side connection aid and monitor;
the external audio authority remains responsible for the received PCM and
transport route.
The ESP32 Wi‑Fi setup is requested only when the connected A2DP receiver has
that firmware name. **Connect ESP32 Wi-Fi** requests the local-only
`FNAF2-AUDIO` network through `WifiNetworkSpecifier`; Android shows the consent
dialog on first use. Registration uses a fresh socket bound only to that
network. The process is not globally rebound to the no-Internet AP, and stale
network requests are discarded on a button retry. Other A2DP receivers, such
as the legacy host adapter, do not require or display this step.
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

`android/cue-helper/test.sh` compiles the shared detector/model parser, the
phone `AudioAnalyzer`/phase clock, and visual helpers against host unit tests.
The external legacy authority has its own phone-free regression at
`tools/cue/test-audio-authority.py`.

On the phone:

1. Tap **Connect audio receiver**, grant `BLUETOOTH_CONNECT` if requested, and
   connect `FNAF2 Audio Consumer` in the system Bluetooth settings.
2. Confirm the APK reports `CONNECTED` or `STREAMING` for the receiver.
3. Tap **Connect ESP32 Wi-Fi** and accept Android's request for
   `FNAF2-AUDIO` (password `fnaf2-audio`).
4. Tap **Start video capture** and grant screen-capture consent.
5. Tap **Open FNaF 2**.
6. Tap **Monitor ESP32 PCM on phone** if you want to hear the returned mix.
   It first reports `STARTING` and becomes `ON` after four packets are buffered.
7. Optionally tap **Record ESP audio (dev)** to save the same returned PCM.
8. Inspect the Audio/Diagnostic tabs: `audioMonitor=ON source=esp32-pcm` and
   `audioAnalyzer=...` confirm that the phone is consuming UDP `49710`. No host
   audio authority is needed for this path.

For the legacy BlueALSA host path, start the external audio authority on the
receiver host after step 4, for example:

   ```sh
   tools/cue/audio-authority.py \
     --socket /tmp/fnaf2-audio.sock \
     --profile g56-bluealsa-a2dp-v1
   ```

The authority's route preflight is transport-specific because this adapter
currently implements BlueALSA:

```sh
tools/cue/audio-authority.py --check
adb logcat -s FnafCueHelper:I '*:S'
```

A healthy APK line contains visual data and identifies the ESP32 PCM path:

```text
RUNNING visual=OBSERVED seq=... rgba=... luma=... ageUs=... content=2400x1080 visible=1 audio=ESP32 authority=esp32-audio-consumer ... audioMonitor=ON source=esp32-pcm ...
```

When the captured content is the helper UI, the visual portion additionally
contains `screen=CUE_HELPER screenScore=...`. If the capture is fresh but the
screen signature is not recognized, it contains `screen=UNKNOWN`; this is a
semantic refusal, not a stale-frame failure.

The APK's A2DP card is a connection/playing-state indicator. The ESP32 health
facts are accepted on UDP `49709`; PCM on UDP `49710` is independently consumed
by the analyzer, recorder, and optional monitor.

On API 34+, the helper consumes `onCapturedContentResize()` and
`onCapturedContentVisibilityChanged()`. Hidden, not-yet-sized, stale, or
aspect-mismatched content is `visual=UNKNOWN`; its sampled pixel is never
reported as usable. API 29–33 can still run the visual probe, but do not
provide the same captured-content invariants. Game focus remains a separate
invariant enforced by the device harness.

## External audio authority

The ESP32 is the runtime audio authority for this architecture. During an
active capture session the APK listens on UDP `0.0.0.0:49709` for its health
facts and on UDP `0.0.0.0:49710` for the PCM loopback. The ESP32's Wi-Fi AP is
`FNAF2-AUDIO` (password `fnaf2-audio`). The health listener accepts only
`audio-route`, `audio-rms`, and `audio-peak` from source
`esp32-audio-consumer`; cue facts and actions are not accepted from UDP.

The PCM packet is a 28-byte little-endian header followed by stereo signed
16-bit PCM:

`magic:u32 version:u8 channels:u8 format:u8 reserved:u8 sample_rate:u32 seq:u32 t_capture_us:u64 payload_bytes:u16 reserved2:u16`

`magic` is `0x46325043`, `version` is `1`, and `format` is `1`. The APK checks
rate, payload alignment, packet length, and sequence continuity before sending
the bytes to the analyzer, recorder, or speaker queue. It uses a four-packet
startup buffer and a bounded 32-packet queue; packet loss is reported as
`lost`/`dropped`, never hidden as a clean cue stream.

The sample rate is the negotiated SBC rate reported by the ESP32. SBC octet-0
bits map as `0x80=16000`, `0x40=32000`, `0x20=44100`, and `0x10=48000` Hz.
Earlier bridge builds had this table reversed; a `0x20`/44.1 kHz game stream
was labelled 32 kHz, making monitoring and WAV playback about 37.8% slow.
Recordings created after the corrected firmware flash carry the proper rate.

The legacy host authority remains useful for offline BlueALSA calibration. It
publishes compact `fact-message-v1` records to stdout and, when `--socket` is
supplied, to a Unix stream socket:

```json
{"schema":"fact-message-v1","seq":0,"type":"audio-route","state":"OBSERVED","confidence":1.0,"source":"audio-authority","calibrationProfile":"g56-bluealsa-a2dp-v1","t_received":123,"value":true,"latencyMin":150,"latencyMax":250}
```

The `source` is deliberately transport-neutral. The profile identifies the
calibrated receiver/backend. The existing `src/fact-link.js` receiver is the
validation boundary for legacy host facts. `tools/cue/collect-facts.py` can
persist a subscribed stream as a per-run sidecar.

With no model, the authority emits route, RMS, and peak facts only. With an
ignored `cue-model-v1` file, it can emit shadow-only `wind-tick` observations:

```sh
tools/cue/audio-authority.py \
  --socket /tmp/fnaf2-audio.sock \
  --model captures/cue-helper/models/example-cue-model.txt \
  --profile g56-bluealsa-a2dp-v1
```

The model must be calibrated for the selected transport. A model from the
returned ESP32 PCM path is not interchangeable with legacy BlueALSA evidence
without re-calibration.

For a latency probe, a named non-phase template may be enabled explicitly with
`--shadow-cue bang`; this only publishes a shadow fact and cannot arm a control
window. Detector promotion still requires independent held-out calibration.

The phone applies a positive visual context gate before emitting any local cue
event: the fresh 20x9 grid must identify `FNAF2_NIGHT`, meaning the office HUD
is visible. The title/menu (and its BGM), transitions, game-over, and any
unknown visual state therefore cannot emit a `cue-bang`; they remain in
transport/score telemetry only. Route/RMS/peak health facts remain observable
on every screen.

The current BlueALSA adapter uses the phone's A2DP output and reads
`S32_LE` stereo at 48 kHz for offline evidence. Those details belong to that
adapter, not to the APK/ESP32 packet contract. The one-shot recorder remains
available for raw evidence:

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
| `GET <token>` | `OK <snapshot>` | Current monotonic visual snapshot plus audio health/analyzer status; never PCM or an image. |
| `GRID <token>` | `OK grid=20x9 ...` | Full visual sensor grid. |
| `WATCH <token> status\|<hash>` | `OK watch=...` | Inspect or activate the native visual watchlist. |
| `READ <token>` | `OK read=...` | Read the active visual watchlist. |

`CAL`, `LOG`, `ARM`, and `RESULT` are no longer APK commands. Model import and
PCM recording are APK UI operations; cue observation is shadow-only until
independent calibration. The device query wrapper supports visual
snapshot/grid/watchlist/read operations, not raw PCM streaming.

The two visual channels are:

| Channel | Endpoint | For |
|---|---|---|
| loopback TCP | `127.0.0.1:49707` | the on-device visual controller |
| abstract unix | `@com.fnaf2.cuehelper.control.<session>` | host tooling over `adb forward` |
| Wi-Fi UDP | `0.0.0.0:49709` | ESP32 shadow audio health facts |
| Wi-Fi UDP | `0.0.0.0:49710` | ESP32 stereo PCM loopback |

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
