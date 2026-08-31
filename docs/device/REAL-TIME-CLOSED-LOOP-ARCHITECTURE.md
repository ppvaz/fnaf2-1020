# Real-time closed-loop controller architecture

**Status: proposed architecture, 2026-08-31.** This is the control boundary
for the stock-device controller work. It supersedes the experimental idea of
using the ESP32 as an audio bridge that returns decoded PCM to the phone.

## Decision

The ESP32 is a **real-time coprocessor and reflex node**, not an audio bridge.
It may receive the phone's audible mix, but it processes that stream locally
into small, timestamped semantic facts. It must not forward the full decoded
PCM stream back to the phone as an input to the live controller.

The 2026-08-30 phone -> ESP32 A2DP -> Wi-Fi/UDP PCM -> same-phone-helper
experiment had severe loss problems. No loss rate or latency percentile has yet
been retained, so this is a **[CALIBRATED, qualitative]** rejection, not a
quantitative transport result. Until a separate bench record establishes a
bounded loss/jitter profile for a different transport, the PCM-return design is
not a runtime candidate—not even as a source of timing truth.

This is a useful distinction:

```text
invalid: phone audio -> ESP32 -> Wi-Fi PCM bridge -> phone detector
valid:   phone audio -> ESP32 local DSP -> timestamped CUE / HEALTH fact
```

Audio recordings can still be collected as an explicitly non-authoritative,
offline diagnostic artifact. They are not allowed to close a live safety or
phase-control loop.

## Controller shape

The system is multi-rate and asynchronous. Sensing, state estimation,
planning, and input execution overlap; a slow computation never blocks the
fast path.

```text
Android video ----> visual event detector ---\
                                          timestamped facts
ESP32 local DSP --> audio event detector ----> shared belief state
                                                    |          |
                                                    v          v
                                             L1 reflex     L3 planner
                                                    \          /
                                                     action arbiter
                                                           |
                                                     HID / touch
                                                           |
                                                         game
```

Each event carries a monotonic acquisition timestamp, source identity,
confidence, calibration profile, sequence number, and health/age information.
The receiver must treat sequence gaps, stale events, and unknown calibration as
loss of evidence—not as a negative game observation.

The belief is the only shared representation of hidden game state. It predicts
forward from the last accepted action and elapsed monotonic time, then applies
new facts at their observation time. It records uncertainty instead of turning
missing audio/video into a confident boolean.

## Latency classes and pre-emption

| Layer | Target cadence / budget | Owner | Responsibility |
|---|---:|---|---|
| L0: I/O | sub-ms where hardware permits | acquisition / actuator MCU | timestamping, input delivery, watchdogs |
| L1: reflex | ~1–5 ms after a local fact | ESP32/reflex node and actuator peer | deadline actions, cancellation, safe hold |
| L2: belief | ~10–30 ms | phone or controller host | event fusion, prediction, uncertainty, health |
| L3: tactical | ~100–500 ms | controller host | select and revise a short safe action prefix |
| L4: strategic | 100 ms to seconds | optional planner/model | policy parameters, diagnostics, candidate plans |

The budgets are design targets, **not measured device performance**. Promotion
requires end-to-end p50/p95/p99/p99.9 traces for each path.

Lower layers pre-empt higher layers. The arbiter has one ordering:

```text
verified emergency reflex > verification/recovery > approved tactical prefix > strategy proposal
```

An L1 action cancels any conflicting uncommitted actions. Actions already at
the actuator require an explicit cancellation/commit state; the controller
must never claim that an interrupt withdrew an input which has already been
delivered. On link or sensor-health failure, it enters a named conservative
hold/recovery behavior rather than continuing a stale plan.

## Responsibilities by node

- **ESP32 audio/reflex node:** decode available audible audio, run bounded DSP
  and cue classification locally, own local timers, emit semantic events and
  health facts, and execute locally reachable reflexes. It does not export a
  continuous PCM stream for online control.
- **Android Cue Helper:** produces visual events and control-state
  confirmations, and may maintain a richer belief/planner. Its capture rate
  and compositor delay are measured inputs to the model, not assumed to be
  real-time.
- **Actuator:** owns monotonic input timing and reports command acceptance. A
  wired link is preferred between a deadline-critical reflex source and the
  actuator. The original ESP32-WROOM-32 has no native USB-device controller,
  so it cannot itself be the wired USB-HID endpoint; that requires a separate
  HID-capable MCU (for example an ESP32-S3) or the currently validated
  on-device input path.

For a two-MCU build, the audio/reflex ESP32 and HID MCU communicate by a
bounded wired protocol (UART/SPI). The message is an idempotent event or
reflex command with sequence number and deadline—not a wall-clock macro.
Wireless transport may carry noncritical observations and strategic updates,
but is not the sole authority for a lethal deadline.

## Fact and action contracts

Facts preserve the difference between observing an event and receiving a
message:

```text
Fact { type, value, confidence, source, calibrationProfile,
       sequence, t_observed, t_received, latencyMin, latencyMax, health }
```

Audio PCM arrival is not `t_observed`. It is only a transport receipt time
unless the local ESP32 detector supplies its acquisition timestamp and measured
latency bounds.

Actions use an explicit lifetime:

```text
proposed -> approved -> committed-at-actuator -> observed / expired / cancelled
```

The planner can approve a bounded prefix (for example a camera-down/flash/up
cycle) while it computes the next one. The L1 reflex controller can interrupt
the remaining prefix immediately when a proven threat fact arrives.

## Measurement gate

Do not call this architecture real-time merely because each component runs.
For each live configuration, record and retain:

1. sensor acquisition to semantic-fact timestamp;
2. fact delivery to belief update;
3. reflex decision to actuator receipt;
4. actuator receipt to visible game result;
5. event/fact/command loss, reordering, stale age, and cancellation outcomes;
6. behavior during A2DP silence/resume, Wi-Fi degradation, and upstream loss.

The relevant proof is the full `event -> action -> observed result` path at
p99/p99.9, not an average loop time. A configuration that lacks a trace must
remain shadow-only.

## Consequences for existing plans

- Plan 08's phone/ESP32 PCM loopback is retracted as a runtime architecture;
  audio classification moves to the ESP32 local DSP path.
- Plan 20 owns the belief, tactical planner, and arbiter semantics; its P6
  hardware work must use this document's event-only boundary.
- `ANDROID-AUDIO-CAPTURE.md` retains the A2DP-mix evidence, but no longer
  presents Wi-Fi PCM return as a runtime target.

The engineering rule is simple: **keep sensing and acting while slower
inference is running, and keep full audio off the control transport.**

## Host choice: macOS is not an A2DP-sink target

**Research note, 2026-08-31.** A phone + PC/Mac controller is a credible
replacement for the ESP32 experiment, but the Mac must not be specified as the
phone's native Bluetooth A2DP receiver.

Apple's macOS documentation describes Bluetooth audio devices as the Mac's
output (headphones/speakers) or, for audio input, a headset. Its public A2DP
documentation likewise describes A2DP as routing audio *from* an app to a
paired Bluetooth device. No Apple-supported setting or public API was found
that turns a current Mac into an A2DP audio sink for an Android phone.

The one located macOS sink library, `airander/A2DP-SINK`, is a community
proof-of-concept: it publishes an A2DP “Audio Sink” SDP record, accepts the
AVDTP/L2CAP negotiation itself, and hands **raw RTP packets** to its caller. It
is not a CoreAudio input device, not a complete PCM receiver, and was archived
in 2021. It is useful historical evidence that an app can implement the role,
not a runtime dependency or evidence of compatibility with a current macOS
release.

Sources: [Apple: connect Bluetooth audio devices](https://support.apple.com/en-euro/guide/mac-help/blth1004/mac),
[Apple: A2DP output route](https://developer.apple.com/documentation/avfaudio/avaudiosession/port/bluetootha2dp),
[archived A2DP-SINK project](https://github.com/airander/A2DP-SINK).

The practical choices are therefore:

| Topology | Verdict | Boundary |
|---|---|---|
| Android -> native macOS Bluetooth -> Mac PCM | **Reject** | macOS does not offer the required supported A2DP-sink role. |
| Android -> community A2DP app -> local Mac detector | Shadow-mode experiment only | Requires a maintained fork that owns codec negotiation, RTP loss/reordering, decode, clocking, and telemetry. |
| Android -> Linux/BlueZ receiver -> Mac semantic facts | **Preferred Mac pattern** | The Linux node owns A2DP decode/local cue extraction; it sends sequenced facts, not PCM, to the Mac. |
| Android -> hardware A2DP receiver -> USB line-in on Mac | Bench-only fallback | Analog capture avoids the PCM-return bridge but needs a new full-path latency/loss calibration. |
| Android -> Windows A2DP receiver -> local controller | Bench-only alternative | Treat the receiver and audio graph as an untrusted sensor until measured. |

Linux has supported receiver primitives: PipeWire exposes an `a2dp_sink` role
and a capture-node path, while BlueALSA's `bluealsa-aplay` captures streams
from connected Bluetooth devices. They make a small Linux host (or spare PC)
the cleanest external-audio endpoint. Neither is a promise of low latency;
A2DP buffering, silence/resume behavior, and end-to-end jitter still require
the measurement gate above. Sources: [PipeWire Bluetooth roles](https://docs.pipewire.org/1.2/page_man_pipewire-props_7.html),
[BlueALSA player documentation](https://github.com/arkq/bluez-alsa/blob/master/doc/bluealsa-aplay.1.rst).

### macOS community-sink probe — rejected 2026-08-31

`airander/A2DP-SINK` was built successfully as an ad-hoc signed arm64 app on
the project Mac (Apple silicon, macOS 26.6.2). It published the original
service record, whose `0x0001` service-class list is `0x110B` (Audio Sink),
and the phone paired with the Mac.

The media-profile gate failed:

- Android rendered the peer as a **computer**, not a speaker/headphone;
- the active connection reported only generic ACL/GATT services;
- Android exposed no Media audio toggle; and
- the probe received **zero** incoming A2DP/RTP packets.

`[INFERRED]` The blocking omission is the local Bluetooth **Class of Device**:
the old app can add an SDP service but does not change macOS's host-level
computer class. A reference A2DP sink sets an Audio/Rendering/Audio class
(`0x240400`), and A2DP guidance recommends the Audio service bit plus the
Audio/Video major device class. macOS's public `IOBluetoothDevice` API exposes
the class only as a property of *remote* devices; no supported local-class
setter was found. Therefore a normal application service record is insufficient
on this release. Sources: [Bluetooth SIG A2DP UUIDs](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/index-en.html),
[BTstack reference sink](https://github.com/bluekitchen/btstack/blob/master/example/a2dp_sink_demo.c),
[Silicon Labs A2DP guidance](https://www.silabs.com/documents/public/application-notes/AN986.pdf).

Do not pursue a private `bluetoothd`/raw-HCI class override for the controller.
It would turn the sensor into a macOS-version-specific system hack with no
reliable recovery or timing story. This closes the native-macOS A2DP-sink
route for the project; the Linux/BlueZ receiver remains the supported external
audio direction.
