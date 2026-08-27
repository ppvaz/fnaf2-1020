# Android internal-audio capture does not match the audible mix

This note records an FNaF 2 mobile recording artifact reported on the owned
Android build and independently described by other players. It matters beyond
sharing gameplay clips: any future audio-cue detector must establish what the
capture API actually receives before treating recorded audio as game state.

## Outcome

The device owner reports that every internal-audio capture made from the game
contains the music-box winding sound and Mangle's radio/static continuously,
including periods when those sounds were not audible during play. This is
almost certainly an application/runtime playback-capture bug, not damaged
recordings or intended gameplay audio.

Independent reports describe the same signature:

- A [2025 FNaF 2 Android report](https://www.reddit.com/r/fivenightsatfreddys/comments/1ksk7g7/)
  names Mangle's sound, the music box, and hallway ambience appearing at full
  volume in a screen recording despite not being heard during play.
- A [2022 mobile report](https://www.reddit.com/r/fivenightsatfreddys/comments/vkf8dl/)
  describes Mangle's static being present throughout the recording but absent
  while playing.
- A [2024 remastered-mobile report](https://www.reddit.com/r/fivenightsatfreddys/comments/1etjatc/)
  describes Mangle's radio and office animatronic audio persisting through the
  recording.
- Closely related artifacts are reported in other mobile Clickteam FNaF ports:
  [UCN music-box audio throughout a recording](https://www.reddit.com/r/fivenightsatfreddys/comments/1umy8tw/),
  [UCN Phantom Mangle and BB/JJ sounds present only in the recording](https://www.reddit.com/r/fivenightsatfreddys/comments/1b8nr1v/),
  and [similar Sister Location and UCN internal-audio behavior](https://www.reddit.com/r/fivenightsatfreddys/comments/1cakfqn/).

These are community observations rather than an official Clickteam or game bug
ticket. Their exact match across different recorders, devices, years, and
Clickteam FNaF ports is strong corroboration, but it does not by itself locate
the defect.

## What is known, and what is inferred

`[SOURCED]` Android's `AudioPlaybackCapture` API copies eligible application
playback into a recorder. Capture eligibility depends on the source
application's usage and capture policy. It is an internal playback path, not a
microphone recording of the phone speaker. Android also states that capturing
audio this way does not affect the latency of the application whose audio is
captured. See the official
[`AudioPlaybackCapture` overview](https://developer.android.com/media/platform/av-capture)
and
[`AudioPlaybackCaptureConfiguration` reference](https://developer.android.com/reference/android/media/AudioPlaybackCaptureConfiguration).

`[INFERRED]` FNaF 2's Clickteam runtime probably leaves the music-box and Mangle
loops active on internal sound channels, then controls whether the player hears
them through channel volume or runtime mixing. The Android capture path and
the runtime appear to disagree about that state, allowing the recorder to
receive loops that the live speaker/headphone mix suppresses.

That explanation fits the observations, but the current evidence cannot decide
whether the defect is in Clickteam's Android channel handling, an Android/OEM
playback-capture interaction, or both. Do **not** elevate the proposed mechanism
to a sourced engine rule. What is established is the mismatch between recorded
internal audio and the sound heard by the player.

The repository's adb harness uses Android's shell `screenrecord`. That tool's
documented output is video-only; an OEM screen recorder or a purpose-built
`AudioPlaybackCapture` helper is a different path. See AOSP's
[`screenrecord` shell documentation](https://android.googlesource.com/platform/frameworks/base/+/84bf8073a8a80cf464eba1dada0eb7585f9943d5/docs/html/tools/help/shell.jd).

## Consequence for an audio-cue detector

Internal capture cannot be assumed to represent the player's audible mix. In
particular:

- Mangle/static and music-box energy may be permanently present in the PCM,
  even when gameplay says those cues are inactive.
- A detector trained from shared screen recordings could learn the capture
  artifact instead of the intended cue.
- Windowed capture around a known game tick reduces processing work, but does
  not remove an always-present contaminating loop.
- BB's short laughs may still be separable by a narrow time-frequency template;
  this must be demonstrated against raw PCM from the target phone rather than
  assumed from what the operator hears.

Before audio controls any Night 7 action, collect labeled positive and negative
windows from the target build and inspect their waveform/spectrogram. Include
negative windows with Mangle present and with the music box winding. The first
acceptance test is whether BB laughs remain distinguishable under the captured
background; end-to-end timing is a separate test after that.

The proposed on-device boundary, window schedule, failure semantics, and
promotion gates are preserved in
[`plans/08-audio-cue-controller.md`](../../plans/08-audio-cue-controller.md).
That plan keeps PCM and detection on the phone and does not assume that the
helper must read continuously.

## Bluetooth silently empties the capture (2026-08-25)

`AudioPlaybackCapture` taps the phone's mix. **A2DP offload does not go through
that mix**, so with Bluetooth headphones connected the helper receives
zero-filled buffers -- and reports itself healthy while doing it.

Night 6-42 is the worked example. It recorded **71 s of a live Night 6 in which
Balloon Boy was visibly on the Game Area camera at 19.4 s**, and every one of
its 1142784 samples was exactly zero. Throughout, the helper logged
`audio=OBSERVED rate=16000 frames=... rms=0 peak=0` with the frame counter
advancing normally, and the run's cue trace carried `rms max 0, peak max 0`
across all 561 samples. `dumpsys audio` said `Devices: bt_a2dp(80)` on every
stream. Nothing in the pipeline could tell that from a quiet night.

This is the same shape as every other failure in this repository: a sensor that
knows one way to be working must not be what says the capture is fine. So:

- `trial.sh` refuses to start with `CUE_AUDIO=1` while audio is routed to
  A2DP, rather than recording silence through the night;
- `scan-night.sh` fails (exit 3) on an all-zero capture instead of reporting a
  clean scan, because **silence is not "no bangs", it is no observation**.

Two traps found while wiring that guard, both worth keeping:

- **`grep -q` must not be on the right of a pipe under `set -o pipefail`.** It
  exits the instant it matches, the writer takes SIGPIPE, and the pipeline
  reports 141 -- so the `if` reads false however well the pattern matched. This
  skipped the Bluetooth guard twice, and two nights recorded silence anyway
  before it was noticed. Piping into `grep -c` and comparing hides the bug,
  because `-c` reads to the end; a herestring avoids it entirely.
- **The helper does not release its control socket when its capture restarts.**
  Asking a running instance to start capture again fails with
  `java.io.IOException: Address already in use`, and it then reports
  `visual/audio/control=UNAVAILABLE(startup-IOException)` -- which reads as a
  broken helper rather than a stale one. `adb shell am force-stop
  com.fnafminus7.cuehelper` and relaunch; the consent has to be granted again.

## Practical recording workarounds

For a clip intended to match what the player heard, record the physical output
with a microphone or an external audio path instead of Android internal audio.
That trades some quality and convenience for an honest audible mix. Bluetooth
output is not a dependable fix because an internal recorder may capture before
the speaker/headphone route.

There is no established in-game repair in the sources above. Post-processing
may reduce the persistent layer, but it cannot be trusted to reconstruct the
original mix perfectly.
