# On-device audio-cue controller

**Status: stopped at gate 1 (2026-08-24). The controller is not viable on this
phone and build, and the plan's own rule says so.**

Gate 0 closed first, and it cost the highest-payoff action: early unmasking is
out of scope because BB's departure plays the sample that 18 edges across seven
characters share. Gate 1 then failed outright. Balloon Boy's approach vocals are
played at **half the channel default** (g414-416 set channel 14 to 25 against
g60's 50), and at that level, injected into real target-device night background,
this detector cannot find them:

| | played level | detected | needs |
| --- | ---: | ---: | ---: |
| sample 17 thud, positive control | -0.1 / -4.4 dB | 1/5, 1/5 | — |
| sample 21 BB vocal | -8.9 / -13.2 dB | 0/5, 0/5 | +11 / +10 dB |
| sample 23 BB vocal | -9.0 / -13.3 dB | 0/5, 0/5 | +9 / +11 dB |
| sample 24 BB vocal | -8.0 / -12.3 dB | 0/5, 0/5 | +6 / +16 dB |

Two independent 20-second stretches of real night audio, with the level anchored
to the measured level of actual thud detections in the same recordings, and the
vocal offset derived from the source channel volumes. Reproduce with
`tools/cue/evaluate.py BACKGROUND --anchor <dB>`.

Gate 1's text is explicit about this branch: *"every candidate cue needed by the
policy must be visible and repeatable in target-device PCM. Otherwise stop."*
The cue is 6-16 dB short. So the remaining packages are closed as unreachable
rather than left open:

| Package | State |
| --- | --- |
| 0. Source-map candidate cues | **Closed.** Every Office sample mapped to its state edge; early unmasking withdrawn |
| 1. Prove playback capture | **Failed.** Capture path works; the cue is 6-16 dB below detectability at the level the game plays it |
| 2. Offline detector | **Unreachable.** Built and characterised, but there is no recoverable cue to hold out |
| 3. Window and action latency | **Partly banked.** The result-receipt leg is measured and kept (225 ms to 59 ms); the audio legs are moot |
| 4. Simulator cue injection | **Unreachable.** Already rejected the counted-vocal policy; the cue cannot be delivered at all |
| 5. Shadow on the real device | **Unreachable.** Nothing to shadow |
| 6. Enable one bounded action | **Unreachable.** Nothing to enable |

**What the verdict is not.** It is not "audio cannot work in principle". It is
measured against the front end this plan specified -- log-band cosine on the
reference's transient core, with a per-run background profile subtracted -- and
that front end is marginal even for the loud cue, finding the thud only 1/5 at
its own measured level. Anyone reopening this has an explicit target rather than
a research question: close a **6-16 dB detectability gap** against this phone's
internal mix, which ANDROID-AUDIO-CAPTURE.md shows carries the music-box loop and
Mangle's static regardless of what the operator hears. A matched filter at full
sample rate, or a longer background estimate, are the obvious first attempts.

**What the plan banked anyway.** The observer plumbing it built is the result
worth keeping, and it is independent of audio: one consented `MediaProjection`
answers a device-local socket with an already-classified pixel in **59 ms p95
against the screencheck path's 225 ms**, which moves the visual-plus-action path
from 395 ms to 229 ms and recovers about 664 ms on the night-6 cycle. Plus the
source map itself, which corrected the Balloon Boy pipeline in three places and
withdrew an unsafe action from the strategy documents.

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

The 2026-08-24 device run removes scheduler phase as the reason to build audio.
Two consecutive device-local frames containing both the clock and flashlight
meter acquired the HUD epoch, and the first `1 AM` transition landed 69,950 ms
later against the source-derived 70,000 ms interval. A MediaProjection image
stream can replace that screencap classifier if it preserves monotonic frame
timestamps, but audio is no longer needed to establish the epoch.

More importantly, phase acquisition did not promote the phase-windowed
sparse-left route. The idealized 267 ms sweep survives only inside its narrow
epoch window; the repeatable stock-HID primitive takes 790 ms, and modeling
that measured actuator produced zero survivors in both ordinary and pinned
worst-case Night 7 cohorts. A vocal onset may still corroborate the visual
clock or arm an occasional visual CAM-05 check, but it cannot rescue that
policy by itself. Reopen the phase use only after proving a faster actuator or
a new exact-simulator policy built around the measured one.

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

That mapping is now resolved, and the answer is negative. Sounds are dispatched
through registers on the `cam 01` object rather than played inline, which is why
an earlier pass over the play actions alone read BB's departure as silent. It is
not silent: g292 and g294 write `cam 01` v21, and g691-694 turn any value 1-4
into **sample 17** — the same handle written by 18 edges across seven
characters, including Toy Chica's, Toy Foxy's, and W. Bonnie/W. Chica's own
mask-clears under the identical `mask fully on` condition.

So **no waveform uniquely announces the early-leave branch**, and the trainer's
`vent-bang` label is confirmed to be a teaching abstraction. The full map,
including the correction that BB's hop 4 plays a vocal *and* a thud and that
arrival at 122 is a thud/sample-21 pair, is in
[`ANDROID-SOURCE-STATUS.md`](../docs/android/ANDROID-SOURCE-STATUS.md); the
constants and their assertions are `THUD_SAMPLE`, `BB_VOCAL_SAMPLES`, and
`BB_ARRIVAL_SAMPLE`.

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

The first protocol slice now exists in `android/cue-helper`: a per-run 128-bit
token protects a length-bounded `GET` request, and the response contains a
fresh monotonic visual/audio snapshot without PCM or image payloads. It is
served on two channels — a `127.0.0.1:49707` loopback port for the on-device
controller, and an abstract unix socket reachable over `adb forward` for host
tooling. `tools/device/query-cue-helper.sh` proves both boundaries against the
real device. This does not implement `ARM`/`HIT`/`MISS`, detector windows, or
live HID decisions; those remain behind the measurement gates below.

### Window schedule

Windows come from known game/controller state, not from a permanently running
voice-activity detector:

| Window | Arm condition | Candidate use | Maximum span |
| --- | --- | --- | --- |
| BB movement | Around the sourced five-second opportunity | Update an uncertainty set for vocal hops 2–4 | Pre-roll plus the measured sample tail |
| BB final approach | A prior cue/state makes hop 5 possible and the monitor will rise | Prepare the BB/Foxy response; shared thud alone cannot identify BB | Until the monitor-gated edge is resolved |
| ~~BB masked~~ | *Removed 2026-08-24 by gate 0* | No source-proven departure cue exists: the branch plays the shared thud | — |
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
- Track scheduler phase separately from route position. The visual HUD latch
  owns the current epoch estimate; a vocal may corroborate it only when its
  measured onset/IPC latency leaves the entire confidence interval inside a
  simulator-derived safe epoch window.
- Let a strong vocal cue narrow that set or arm a visual check; do not invent
  the silent first hop.
- Use a shared thud only as corroboration of a transition that controller state
  already makes possible.
- ~~Unmask before the fifth tick only after a unique departure cue is tied to
  the source transition~~ — **withdrawn 2026-08-24.** The departure cue exists
  but is sample 17, shared with four other characters' mask-clears that fire
  under the same condition. A rule keyed on it unmasks on someone else's
  departure while BB is still at 122. Hold the mask to the fifth tick.
- On `MISS`, `UNKNOWN`, projection loss, control-channel loss, or deadline
  expiry, use the existing visual/full-duration behavior. Disable audio for the
  rest of the night after a capture-path failure rather than repeatedly
  restarting it mid-run.
- Do not promote the phase-windowed sparse-left table on the stock-HID
  actuator: it is simulator-rejected even with a known epoch. Any future table
  still needs an unambiguous fresh epoch; an old/stale one is not a
  conservative observation.
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

**Closed 2026-08-24.** `readdump.py sounds 3` indexes all 40 sample handles in
the Office frame; the register-bank indirection is documented in the ledger.
Verdict by cue:

| Cue | Uniqueness | Consequence |
| --- | --- | --- |
| Departure (g292/294) | Sample 17, shared by 18 edges / 7 characters | **Early unmasking removed from scope** |
| BB vocals (g414-416) | 23 is sole-trigger; 21 and 24 have non-BB triggers that all require someone at 122/123 | Usable as corroboration given controller state, not as identification |
| Hop 5 into the office (g417) | Sample 17 | Not identifying on its own |
| Arrival at 122 (g607) | Adds sample 21 to the thud | The one edge with a two-sound signature |
| BB footsteps (g702) | `Random(5)+1` from a bank 8 characters share | No unique vent cue |

Every vocal hop sets channel 14 to the same volume, so amplitude carries no
range information — a detector cannot infer distance from loudness.

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

#### First collection run (2026-08-24): the cue is quiet by design

`tools/device/collect-cue-audio.sh` and `query-cue-helper.sh log` now capture a
whole night in one pass, and 285 seconds of real night audio were collected
across mask-camp and pilot runs. The result is a clean negative with a source
explanation.

Best score over the whole recording, background-subtracted, against each
reference:

| Sample | Best | Background p99 | |
| --- | ---: | ---: | --- |
| 17 shared thud | **0.606** | 0.476 | positive control: every character's hop plays it |
| 21 BB vocal | 0.486 | 0.367 | |
| 23 BB vocal | 0.437 | 0.335 | |
| 24 BB vocal | 0.347 | 0.249 | |

The thud is found repeatedly during nights at 5-8 second spacings, which is the
movement roll, so the capture and the detector both work. No BB vocal cleared
threshold.

The event sheet says why, and it is not bad luck. Channel 14's start-of-frame
default is 50; g414-416 play every route hop at **25**; g906 plays at **60**
when BB is on the camera you are currently watching. The cue the controller
needs is deliberately the quiet one, at half the channel default, which is
exactly where the injection sweep showed margins collapsing (0.033 at -6 dB).

Two consequences.

The gate is **not closed**, and a second collection run sharpened why.

The first pass could not tell "the cue is undetectable" from "the cue never
happened", because the detector was missing almost everything. The positive
control gave it away: the shared thud is played by every character's hop and
hops come every five seconds, yet whole-sample matching found it **0.4 times a
minute**. Matching the reference's most energetic 0.40 s instead of its whole
length found it **7.6 times a minute** at a higher peak score. Averaging a
one-to-three-second template over a mix where other sounds dominate most of its
span scores like background even when the cue is plainly there, so the template
is now its transient core by default.

With that corrected detector, over 559 s of night audio in two independent
runs:

| Sample | Best | p99 | Detections |
| --- | ---: | ---: | ---: |
| 17 shared thud | 0.850 / 0.819 | 0.751 / 0.728 | **4.6 and 2.9 per minute** |
| 21 BB vocal | 0.581 / 0.597 | 0.426 / 0.444 | 0 |
| 23 BB vocal | 0.527 / 0.567 | 0.430 / 0.427 | 0 |
| 24 BB vocal | 0.586 / 0.631 | 0.431 / 0.477 | 0 |

The same detector, on the same recordings, finds the thud several times a
minute and never finds a Balloon Boy vocal. That is a much stronger negative
than the first pass, and combined with the source fact that his vocals play at
half the channel default it points at gate 1's "otherwise stop" branch.

It is not yet that verdict, and the reason is specific: nothing in these runs
independently confirms that BB moved. Absence of the cue and absence of the
event remain confounded, and the thud cannot separate them because BB's own
hops 4 and 5 play the same shared sample. Settling it needs a run where his
movement is established by another modality -- the pilot's own CAM-05 read, or
labeling the recorded video -- or Custom Night's AI 20, which night 6 cannot
reach because it starts him at 5 and only reaches 9 at 2 AM.

One audio-internal shortcut was tried and came back negative. g814 replays
sample 24 every 2000 ms while BB sits at marker 123, and that periodicity is
detectable even where a single quiet vocal is not, so finding it would prove he
had completed the whole route. Scanning all three recordings for a 2 s-spaced
sample-24 pair, the only strong hit (0.747) falls at 54.9 s in the mask-camp
recording -- roughly twenty seconds *after* that run's game over at 36 s. It is
menu audio. No run so far has evidence that BB reached the office at all, which
is consistent with him barely moving at AI 5 and leaves the confound intact.

The detector's own design is implicated. `tools/cue/features.py` removes each
frame's mean to be level-invariant, which is right for robustness to capture
gain and which discards the one quantity that separates a route hop from
`your view`. A detector wanting both needs a separately calibrated level
feature beside the shape score; that is now the first change to make, ahead of
any more collection.

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

#### Front end built and characterised (2026-08-24); the gate is still open

`tools/cue/` implements the detector shape above in stdlib Python: 32 ms
frames, 16 log-spaced bands from 120 Hz to 7 kHz, each frame's own mean
removed so a score is a *shape* agreement rather than a level, and `UNKNOWN`
for empty, silent, clipped, or too-short windows. `tools/dump/extract-samples.sh`
pulls the reference waveforms out of the APK by handle — outside the repository,
always — so cues are matched against ground truth instead of memory of the
audible mix.

**Reference separability, before any device noise.** This is the ceiling:

| | 21 | 23 | 24 | 17 | 25-29 |
|---|---|---|---|---|---|
| 21 | 1.00 | 0.92 | 0.61 | -0.20 | 0.17-0.26 |
| 23 | 0.92 | 1.00 | 0.60 | -0.31 | -0.01-0.08 |
| 24 | 0.61 | 0.60 | 1.00 | **-0.61** | -0.09-0.02 |
| 17 | -0.20 | -0.31 | -0.61 | 1.00 | **0.76-0.83** |

The three vocals cluster and are anti-correlated with the thud, so
vocal-versus-thud is the easy discrimination. The footstep bank is effectively
one sound (pairwise ~1.00) sitting in the thud's spectral region, so it adds
nothing separable.

**Against the real contaminated background.** `tools/cue/evaluate.py` injects a
reference into a captured device window at a swept ratio.
[`ANDROID-AUDIO-CAPTURE.md`](../docs/device/ANDROID-AUDIO-CAPTURE.md) records
that internal capture always carries the music-box loop and Mangle's static;
this measures what that costs. Scored at the *class* level, because gate 0 left
the controller needing "a BB vocal happened" rather than which one:

| Condition | Raw features | Per-run background subtracted |
|---|---|---|
| background only, no cue | **thud 0.835** — a confident false positive | bb-vocal 0.421, margin 0.084 — no confident call |
| vocal at +12 dB | thud wins, vocal 0.13 | **hit**, margin 0.312 |
| vocal at +6 dB | thud wins | **hit**, margin 0.256 |
| vocal at 0 dB | thud wins | **hit**, margin 0.168 |
| vocal at -6 dB | thud wins | hit, margin 0.033 — below the no-cue margin |
| thud injected | hit 0.945-0.967 | not detected |

Raw, the detector is a noise detector: sample 17 is a 3.2 s broadband template
and the contamination alone scores 0.835 on a window that cannot contain it.
The contamination does not merely add noise, it manufactures thud detections.

So the operating rule is fixed by measurement, not preference:

1. subtract a per-run background profile (per-band median across the window)
   before scoring — the contamination is stationary and the cues are transient,
   which is the only property that separates them;
2. decide on the class margin, not the raw score, and return `UNKNOWN` below
   it — at -6 dB the margin falls under the no-cue margin, so that is the floor;
3. never attempt to detect the thud. Gate 0 rejected it from the source side;
   the signal evidence rejects it independently.

**What is still missing, and it is the gate itself.** This is an injection
study against one 5-second background, not held-out evidence. It has no
calibration/holdout split by session, no cue-by-cue confusion matrix, and no
95% binomial bounds, because those need labeled positive windows from real
gameplay where BB actually moves — which needs nights on the phone with
`query-cue-helper.sh record`. The injected ratio is also a proxy: the true mix
contains the game's own concurrent voices, not a scaled reference over ambience.
Do not read the table above as a detector result. It says only that the cue set
is separable in principle and that background subtraction is required.

The projection classifier threshold is unvalidated for the same reason. Pairing
a raw `screencap` with a projection snapshot cannot settle whether Android's
VirtualDisplay scaler matches the offline bilinear simulation that
[`ONE-PIXEL-VISION.md`](../docs/device/ONE-PIXEL-VISION.md) derived its luma
separation from, because the two captures are not simultaneous and the title
screen animates: three attempts gave projection values of 0, 1 and 47 against
box averages of 67, 40 and 37. It needs a static, labeled view -- which means
the calibrated lit left opening during a night, captured with
`capture-screen-sample.sh` alongside a snapshot. Until then the 59 ms read is a
cheap *observation*, not a validated *decision*.

One bug worth keeping: the first front end floored band energies at an absolute
epsilon, so dropping a signal 20 dB pinned its quiet bands while its loud bands
moved, and the "level-invariant" features changed shape purely because the sound
got quieter. The floor is now relative to each frame's loudest band.
`tools/cue/test-cue.py` asserts the invariance that mistake broke.

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

#### First leg measured (2026-08-24): result receipt

`tools/device/query-cue-helper.sh latency` times snapshot reads entirely inside
one device shell, against the device's own clock, so no adb round trip is
included. 60 samples on the target:

| | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| snapshot read | 48.8 ms | 59.5 ms | 60.8 ms | 66.9 ms |
| same loop, socket call removed | 22.5 ms | 31.6 ms | 32.2 ms | 32.6 ms |

The observation the controller pays drops from the harness's measured **225 ms**
combined screencap p95 ([`ONE-PIXEL-VISION.md`](../docs/device/ONE-PIXEL-VISION.md))
to **59 ms**, and roughly 22 ms of what remains is the shell forking `date` and
`nc` rather than the socket. That is the strongest argument yet for the
projection path, and it is a measurement of the *observer*, not of a decision.

What that buys the controller is arithmetic on measured parts, recorded in
[`ON-DEVICE-VALIDATION.md`](../docs/device/ON-DEVICE-VALIDATION.md): the
visual-plus-action path falls from 395 ms to 229 ms, slack against the shortest
700 ms BB window rises from 305 ms to 471 ms, and the night-6 cycle recovers
about 664 ms -- the same magnitude as the entire three-cut schedule
optimisation, but by changing the sensor instead of removing checks. This is
the observer plumbing the §4 note anticipated, now priced.

The other legs of this package are not measured. Arm-to-first-PCM-frame,
cue-onset-to-classification, and window-close-to-`MISS` all need the `ARM`/`HIT`/
`MISS` window protocol, which does not exist yet -- only `GET`, `CAL`, and `REC`
do. One number is worth recording in advance as a warning: the offline detector
in `tools/cue/` scores a five-second window against ten templates in about two
seconds of host Python. That is fine for calibration and hopeless for a live
window, so the on-device classifier is a reimplementation, not a port, and its
cost has to be measured on the phone before any deadline arithmetic means
anything.

**Gate:** p99 completion plus the existing mask/monitor/input sequence and an
explicit margin must land before the simulator-derived action deadline. Also
show that the helper does not add unacceptable frame, input, audio, or thermal
jitter. Android's API says capture does not add latency to the *playing app*;
that does not excuse measuring the helper's CPU and scheduling cost.

### 4. Add audio observations to the simulator

- Model each cue's onset, measured latency distribution, confusion matrix,
  missing-window probability, and control-channel timeout.
- Test cue-assisted policy changes independently: CAM-05 check arming first,
  scheduler-phase corroboration second, early departure last.
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

#### Perfect-vocal upper bound (2026-08-24)

`tools/hidpilottest.mjs --night=7 --vocal-cam5` now counts the three sourced
vocal events and arms the existing lit CAM-05 confirmation only after the third.
It is an upper bound with zero capture latency and perfect cue delivery, not a
detector claim:

| Cohort | Survival | BB reads/night | Minimum power |
|---|---:|---:|---:|
| 3,000 ordinary | **3,000/3,000** | 25.0 | 218/3000 |
| 1,000 pinned worst | **1,000/1,000** | 28.0 | 373/3000 |

This halves the ordinary sparse-CAM-05 read count and makes the current 520 ms
lit-read model fit, but its direct error budget is unacceptable. Forcing any
one of vocals 1, 2, or 3 to be missed produced **0/1000** survival: the counted
third cue never arrives, BB reaches the office, and Foxy collects. Prefixing one
to three false vocal counts remained mechanically safe behind CAM-05 visual
confirmation, but reduced the minimum power to 187, 125, and 94 frames. That is
only a bounded false-positive diagnostic, not a false-positive-rate model.

Therefore the pure counted-vocal controller is rejected for promotion. The
useful architectures left are:

- use a strongly accepted vocal to arm an occasional lit CAM-05 visual check,
  while a timeout or ambiguity falls back to the explicitly modeled scan; or
- maintain a route uncertainty set and fall back to visual scanning on any cue
  ambiguity, with the resulting power cost tested from measured detector
  errors; or
- independently search for a unique, source-proven departure cue, whose early
  unmask action remains behind the stricter gates above.

Scheduler-phase audio is now diagnostic only. A working MediaProjection path
is still valuable because the same approved session can provide lower-overhead
visual observations and eligible playback PCM, but it supersedes the observer
plumbing—not the actuator measurement or the simulator rejection.

The next simulator iteration must ingest actual cue latency/error distributions;
the perfect-event mode and forced single miss now provide the upper and lower
regression anchors.

**Correction (2026-08-24, from gate 0).** That upper bound is further out of
reach than recorded above. `--vocal-cam5` resets its count on
`vent-bang who === 'bb' && leaving`, and `tools/minus6test.mjs` counts threats
with `who !== 'bb'`. Both read an identity the source does not put in the
audio: every one of those events is sample 17. The 3,000/3,000 figure therefore
assumes a perfectly attributed departure cue that no detector can produce, on
top of the perfect vocal delivery already noted. It does not change the
rejection — that policy was already rejected — but any successor must derive
identity from controller state. The events now carry a `sample` field so a
policy can be held to what the phone can hear.

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

**Resolved 2026-08-24, by refutation.** The source mapping and the target-device
capture disagree, which is a complete answer and not a partial one: the sourced
cue exists, is identified well enough for the surviving architecture, and is
played too quietly to recover from this phone's internal mix. The held-out
detector, latency soak, simulator policy and shadow evidence are not pending
work — there is nothing left for them to measure. “Android can capture audio”
turned out to be exactly the feasibility fact this section warned it was.
