# On-device audio-cue controller

**Status:** recovered from the interrupted 2026-08-24 `/btw` thread; design and
promotion gates recorded, implementation not started.

## Decision

Build this only as a measured, fail-safe experiment. Android can expose eligible
game playback to an `AudioRecord`, and the data and detection work can remain on
the phone. A small helper APK should own capture and classification while the
existing device-local shell/HID controller sends only short arm requests and
receives cue results over a local control channel. PCM must never make a live
adb round trip.

The default is **windowed capture**, not constant reading:

- obtain one user-approved `MediaProjection` session before the night;
- keep its foreground service ready so consent is not repeated;
- start `AudioRecord` just before a known cue window and stop it at the window's
  deadline;
- classify in memory and discard the PCM after the result;
- do no recording or analysis between armed windows.

Keeping projection authorization alive is not the same as continually reading
audio. If repeated `AudioRecord.startRecording()` calls cannot deliver the first
frame before the measured deadline, the windowed design fails its timing gate.
A continuously drained stream with window-gated analysis is a possible later
fallback, but it changes the operator's “just on windows” constraint and must
not be adopted silently.

This is runtime-affordable in principle. Even an uncompressed 48 kHz, stereo,
16-bit input is 192,000 bytes/s; a six-second in-memory window is about 1.15 MB.
After downmixing to 16 kHz mono, it is 32,000 bytes/s. The real risks are capture
eligibility, the target build's contaminated internal mix, capture-start latency,
and whether detector errors leave any viable Night 7 policy—not storage or host
bandwidth.

## Why it is needed

The phase-safe visual/HID prototype in
[`HID-MULTITOUCH.md`](../docs/device/HID-MULTITOUCH.md) is a Night 6 result, not a
Night 7 controller. Night 7 makes BB's masked interval compete with Foxy's hall
coverage. The useful audio questions are therefore narrower than “recognize all
game sounds”:

1. Can an approach cue provide BB state early enough to schedule Foxy and the
   three camera flashes safely?
2. Is there a distinct, source-proven BB departure cue that can end a mask
   interval before the five-second worst case?
3. If either answer is yes, does a policy using that result survive measured
   latency and realistic false positives, false negatives, and missing windows?

The second question has the highest potential payoff and the highest safety
burden. An incorrect early unmask is not an acceptable classifier error.

## Facts the controller must not blur together

The current Android source mapping says:

- BB moves every five seconds on a successful roll and takes five hops from
  CAM 10 to the left opening;
- the first hop is silent;
- samples 21, 24, and 23 are randomly selected BB vocals on the second, third,
  and fourth hops;
- the fifth, monitor-gated hop uses sample 17, a movement thud shared with other
  characters;
- after BB reaches marker 122, a fully-on mask gives a 10% leave roll each
  second and forces departure after five consecutive masked ticks.

That mapping does **not** yet prove which recorded waveform, if any, uniquely
announces the early-leave branch. The trainer's synthesized `laugh` and
`vent-bang` labels are teaching abstractions, not evidence that those exact
sounds occur at every corresponding Android state transition. Resolve the open
sound-cue item in
[`ANDROID-SOURCE-STATUS.md`](../docs/android/ANDROID-SOURCE-STATUS.md) before
writing an action rule.

The target phone adds a separate complication: internal recordings contain the
music-box winding loop and Mangle's static even when the operator cannot hear
them. The evidence and implications are recorded in
[`ANDROID-AUDIO-CAPTURE.md`](../docs/device/ANDROID-AUDIO-CAPTURE.md). A detector
must be calibrated on raw PCM from this exact phone/build and challenged with
those loops as negative background.

## Proposed boundary

### Helper APK

Use a small, purpose-built APK rather than stock adb `screenrecord`, which has no
playback-audio output. On Android 10/API 29 or newer, the helper should:

- request `RECORD_AUDIO` and user consent for `MediaProjection`;
- run the projection in a foreground service; on Android 14+, declare the
  `mediaProjection` service type and its corresponding foreground-service
  permission;
- create an `AudioPlaybackCaptureConfiguration` filtered to the FNaF 2 package
  UID and eligible game/media usages;
- create one `AudioRecord` at a supported native format, then downmix/downsample
  in the helper;
- register projection-stop handling and turn every outstanding window into
  `UNKNOWN` if consent is revoked or capture dies.

The official Android constraints are summarized in the
[`AudioPlaybackCapture` guide](https://developer.android.com/media/platform/av-capture)
and
[`MediaProjection` guide](https://developer.android.com/media/grow/media-projection).
Capture requires the helper and source app to be in the same user profile, and
the game must permit playback capture through its target SDK, manifest, usage,
and capture policy. Inspecting the package is useful, but only receiving the
expected target samples proves feasibility.

Do not recreate a projection for each window. Android 14+ requires fresh user
consent for each new `MediaProjection` capture session. Start one deliberate
session before gameplay and reuse its audio-capture path until the night ends
or the user revokes it.

### Device-local control plane

The capture and detector remain in one process. The existing controller remains
device-local and exchanges bounded messages, not audio. Prefer a loopback socket
if the target device's shell client is reliable; otherwise prove another local
IPC route before implementation. A minimal protocol is enough:

```text
ARM <window-id> <cue-set> <open-ns> <close-ns>
HIT <window-id> <cue-id> <cue-ns> <score>
MISS <window-id>
UNKNOWN <window-id> <reason>
```

Authenticate the session with a per-run random token, bind only to loopback,
bound every field, and close the service when the trial harness exits. The
controller must use monotonic timestamps and must never block its HID schedule
waiting for a reply. A result arriving after its action deadline is `UNKNOWN`,
not a late command.

### Window schedule

Windows come from known game/controller state, not from a permanently running
voice-activity detector:

| Window | Arm condition | Candidate use | Maximum span |
| --- | --- | --- | --- |
| BB movement | Around the sourced five-second opportunity | Update an uncertainty set for vocal hops 2–4 | Pre-roll plus the measured sample tail |
| BB final approach | A prior cue/state makes hop 5 possible and the monitor will rise | Prepare the BB/Foxy response; shared thud alone cannot identify BB | Until the monitor-gated edge is resolved |
| BB masked | BB at marker 122 is independently established and the mask is fully on | Detect only a source-proven departure cue | One contiguous interval through the fifth masked tick |
| Music-box tick | Controller is already winding | Optional clock/phase cross-check | A short expected-tick window |

Do not begin with Mangle static or general hall ambience. The captured static is
known to be polluted, and neither cue directly closes the BB/Foxy scheduling
problem.

## Detector shape

Start with deterministic signal processing, not an ML runtime:

1. preallocate a PCM ring buffer and all feature storage;
2. downmix and resample to a documented mono rate;
3. remove DC and normalize against a per-run background profile;
4. compare log-band or compact spectrogram features against the three BB vocal
   templates and any separately proven departure template;
5. require duration, score margin, and cue-specific thresholds;
6. return `UNKNOWN` for clipping, silence, discontinuity, buffer overrun, or an
   ambiguous top score.

The three random BB vocals need separate measurements. Sample 17's shared thud
may corroborate a state already established by phase and monitor state, but it
must never be the sole positive BB identifier. Persistent Mangle/music-box
energy belongs in negative training and holdout windows; subtracting a baseline
is an experiment, not proof that the artifact is gone.

Keep raw game audio and learned templates outside git. Store them in a local,
ignored calibration directory and commit only collection scripts, schemas,
threshold metadata, hashes, and aggregate reports. Controller mode must neither
write PCM to disk nor upload it.

## Controller semantics

Audio is an observation, not permission to bypass defenses.

- Track an uncertainty set for BB's possible route position using the known
  initial state, five-second opportunities, monitor state, and accepted cues.
- Let a strong vocal cue narrow that set or arm a visual check; do not invent
  the silent first hop.
- Use a shared thud only as corroboration of a transition that controller state
  already makes possible.
- Unmask before the fifth tick only after a unique departure cue is tied to the
  source transition, passes held-out device tests, and survives the controller
  simulator's error injection.
- On `MISS`, `UNKNOWN`, projection loss, control-channel loss, or deadline
  expiry, use the existing visual/full-duration behavior. Disable audio for the
  rest of the night after a capture-path failure rather than repeatedly
  restarting it mid-run.
- Never translate an unknown cue into “threat present” blindly. On Night 7,
  unnecessary mask time can itself be lethal through Foxy, so fallback must be
  the simulator-proven non-audio policy or a bounded visual check.

The first useful version may therefore be shadow-only or advisory. If the
simulator shows that one realistic missed/false cue can kill a run, audio must
not drive that branch until an independent observation removes the single-point
failure.

## Work packages and promotion gates

### 0. Source-map candidate cues

- Locate the Android sound-play events for BB vocals, sample 17, vent sounds,
  and the marker-122 early and forced departure branches.
- Record a table of sample ID, state transition, event ordering, expected game
  tick, and whether the sound is unique or shared.
- Correct any trainer wording that treats a synthesized label as source fact.

**Gate:** no cue can control an action until its state edge and uniqueness are
documented. If the early-leave branch has no unique playback event, remove early
unmasking from scope.

### 1. Prove playback capture on the target build

- Build the smallest consent/capture probe using the production API path.
- Filter by the game's UID and enumerate the actual audio format returned.
- Collect labeled positive windows for all three BB vocals and negative windows
  covering ordinary ambience, winding, persistent Mangle/static, monitor
  transitions, hall flashes, other characters' movement thuds, and silence.
- Compare the internal PCM with the sound the operator heard; label the capture
  stream, not memory of the audible mix.

**Gate:** every candidate cue needed by the policy must be visible and repeatable
in target-device PCM. Otherwise stop; microphone capture is suitable for
post-run research, not this controller's timing loop.

### 2. Build and evaluate the offline detector

- Split calibration and holdout by complete run/session, never by adjacent
  windows from one recording.
- Tune only on calibration data and report a cue-by-cue confusion matrix on the
  untouched holdout.
- Report 95% binomial upper bounds for false-negative and false-positive rates,
  not just “zero errors observed.”
- Replay clipping, truncated pre-roll, missing frames, ambiguous overlaps, and
  the loudest contaminated negatives.

**Gate:** measured error bounds must fit the maximum error rates later derived
by the controller simulator. A good aggregate accuracy cannot hide a dangerous
departure false positive.

### 3. Measure window and action latency

Timestamp, with `elapsedRealtimeNanos()` or the native monotonic clock:

- arm request to first PCM frame;
- cue onset to classification;
- window close to `MISS`/`UNKNOWN`;
- result emission to controller receipt;
- result receipt to the first required HID report.

Measure cold service start separately from warm per-window starts. Run enough
windows to report p50, p95, p99, maximum, overruns, and late-result count, then
repeat through a full seven-minute thermal/GC soak with the game active. Disable
disk writes and verbose logging for the production measurement.

**Gate:** p99 completion plus the existing mask/monitor/input sequence and an
explicit margin must land before the simulator-derived action deadline. Also
show that the helper does not add unacceptable frame, input, audio, or thermal
jitter. Android's API says capture does not add latency to the *playing app*;
that does not excuse measuring the helper's CPU and scheduling cost.

### 4. Add audio observations to the simulator

- Model each cue's onset, measured latency distribution, confusion matrix,
  missing-window probability, and control-channel timeout.
- Test cue-assisted policy changes independently: approach scheduling first,
  early departure last.
- Include persistent/background false triggers and shared-thud ambiguity.
- Run at least the repository's current 10,000 ordinary and 3,000 worst-case
  seed classes, plus targeted boundary sweeps around five-second movement,
  mask, monitor, Foxy, and camera-stun deadlines.
- Force each single failure mode in isolation, then sample compound failures
  from the measured distributions.

**Gate:** the cue-assisted Night 7 policy must improve the relevant conflict and
remain safe on timeout/unknown. The simulator sets the detector error budget;
do not choose a convenient accuracy target first and rationalize the policy
around it.

### 5. Shadow on the real device

- Run the helper and controller together, but log suggested observations while
  the current controller ignores them.
- Label outcomes against synchronized video/source-derived state where possible.
- Exercise projection revocation, app background/foreground, focus loss, helper
  death, audio silence, IPC loss, and harness interruption.
- Publish per-cue counts, late results, unknowns, and confidence bounds; do not
  summarize a night as merely passed/failed.

**Gate:** the shadow distribution must match or improve on offline/soak evidence,
and every lifecycle fault must degrade to the documented non-audio behavior.

### 6. Enable one bounded action at a time

Promote approach-state updates before early unmasking. Keep a run-time kill
switch, an audio-disabled control mode, and structured decision logs without
PCM. The first action-enabled trial must use a branch that a timeout can still
recover from. Early unmasking is last and requires all prior gates plus an
independent guard that makes a false departure classification non-lethal.

## Deliverables

- `tools/android/audio-cue/` helper source, reproducible build instructions, and
  exact Android permissions/API contract;
- an ignored local calibration layout plus a versioned manifest/report schema;
- capture probe, offline replay evaluator, and timing/soak command;
- simulator cue/error injection with a Night 7 policy report;
- shadow-mode integration in the device harness;
- updated source-status, device-validation, and tool-index documentation with
  dated evidence.

## Done when

The task is complete only when the source mapping, target-device capture,
held-out detector results, latency soak, simulator policy, lifecycle fallback,
and shadow evidence all agree. Until then, “Android can capture audio” is a
feasibility fact—not evidence that an audio cue can safely control Night 7.
