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

`[SOURCED, runtime side]` (event sheet, 2026-08-29) FNaF 2's Clickteam runtime
**does** leave every ambient loop playing and gate audibility purely by channel
volume:

- **g60 / g61** (Start of Frame, `Set channel volume`) set the initial mix.
  g61 **zeroes channels 2, 3, 8, 9, 13, 16, 30, 31** — every conditionally-heard
  loop starts silent.
- **g62–g68** (Start of Frame, then `Every 500…3000 ms`) issue `Play sample if
  not already playing` on each loop's own channel, so the loop is *always
  running* regardless of game state — the timer just re-arms it.
- Game state then raises the muted channels: the mask groups drive channel 8
  (breathing), the blackout groups channel 9, the box danger level channels 13
  (g596–600), Mangle proximity channel 16 (g732/733).

So on the runtime side the mechanism is not a guess: the loops never stop, only
their volume moves. `[INFERRED]` remains only for the Android half — that
`AudioPlaybackCapture` reads the pre-volume channel or otherwise ignores the
volume automation, which is what lets the recorder receive loops the live mix
silences. Do **not** elevate the Android half to a sourced rule; the runtime
half above now is one.

### Sound-handle map (event sheet, cross-checked by the device owner's ear)

| handle | file | Fusion name | channel | what it is | volume driven by |
|---|---|---|---|---|---|
| 3 | s0003 | `'C'` | 3 | room ambience | g61→0, g109/g110 |
| 9 | s0009 | `'d'` | 8 | **mask-up breathing** | g61→0; mask groups g281/g283/g287–297 |
| 10 | s0010 | `'s'` | 9 | **blackout / camera-signal-lost** | g448 mutes when `in danger == 0` **and** `your view`.AV1 `== 0`; g449/g478 → 60 |
| 15 | s0015 | `'M'` | 13 | **the music box** | g596→0 (not viewing CAM 11); g597 40 / g598–599 15 / g600 5 by `music button` v0 (box level) |
| 20 | s0020 | `'e'` | 16 | **Mangle** | g61→0; g732/g733 → 40 (Mangle proximity) |
| 33 | s0033 | `'WinD'` | 12 | winding ratchet (see phase-clock section) | not on this system — g637/g644 `Play sample` per 500 ms tick |
| 60 | s0060 | `'W'` | 31 | hall ambience ("someone near the hall" — owner uses it as a W. Foxy watch cue); exact volume gate not yet traced | g61→0; g68 keeps it looping |

This **corrects the 2026-08-29 detectability study's guesses**: s0020 is Mangle,
not the music-box tune; s0010 is the blackout sound, not Mangle static; the
music box is **s0015**, which that study never tested. The study's conclusion is
unaffected — it mixed WinD against two real stationary game loops and the
identities do not change the matched-filter result — but re-run any SBR number
with s0015 + s0020 as the bed.

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

## The winding tick (sample 33) as a phase reference — 2026-08-29

A candidate use of recorded audio that is *not* a threat cue: the music-box
winding ratchet. `readdump.py sounds 3 33` → **groups 637 and 644 only**, both
playing `Sample 'WinD'` (handle 33, `res/raw/s0033.wav`, a 0.284 s mono burst)
on a `Time: 500 loops: 0` — a global "Every 500 ms" Fusion timer — while the
wind button is held and `viewing == 11`. g637 is the mouse twin, g644 the
touch twin. One handle, one channel, no random bank: it is always sample 33.

Why it is interesting: it is **strictly 2 Hz on a fixed frame grid** (the timer
is global and free-running, not restarted on wind press), so each onset carries
`frame mod 30`. That is a phase reference — the thing `MINUS-3-STRATEGY.md` §3's
device refutation says open-loop Minus Toys lacks. And **every strategy on every
night must wind** (the Puppet is always armed), so it is a phase source for the
whole device-pilot program, not one strategy.

**Detectability (synthetic study, 2026-08-29):**

- The coarse **band-energy / recall stage is useless** — s0033's band profile is
  0.97-similar to a tonal contaminant candidate.
- A **per-tick waveform matched filter** (`correlate.best_match` at the known
  grid position) is clean: ≈0.8 normalised xcorr at 0 dB SBR, ≈0.3 at −12 dB vs
  a ~0.09 off-grid floor. Single tick reliable to ≈ −10..−12 dB SBR.
- **Folding that score across the ~60-tick 2 Hz grid** adds ≈+9 dB → phase
  recovery to ≈ **−20 dB SBR** when the tick is buried, with a **sub-millisecond**
  folded onset (inside the ±33 ms `DEVICE_EPOCH_LATCH` bracket).
- **In the realistic regime it is not close.** Leaked music-box + Mangle loops
  both at full volume, WinD at ~equal RMS over them: **57/57 grid ticks
  recovered** (median grid-corr 0.685), **0/57 in the no-WinD control**
  (0.080 grid, 0.081 off-grid). While you are actually winding, WinD is a
  foreground broadband transient and the stationary loops correlate ~0.08
  against it.
- **Naive epoch-folding on an energy envelope does NOT work** — the always-on
  ambient loops carry their own sub-0.5 s periodicity and a crude onset envelope
  mislocates the ratchet by 25–140 ms. Matched-filter-over-fold + bed
  subtraction (`detect.subtract`) is the shape; not built yet.
- **No other game audio is a phase-clock candidate** — the mask SFX (g254/g267/
  g270/g274) are one-shot press-triggered sounds, not periodic; a masked loop
  would anchor to the press, not the game grid. Only g637/g644's global 500 ms
  timer gives absolute phase.

**The section's own warning still applies.** Whether sample 33 *also* leaks
continuously is **unmeasured**:

- **It leaks:** the wind-gate is lost (tick ≠ winding), but a continuous leak
  still folds to a 2 Hz phase — usable as a pure phase source *if* the leak
  rides the same global 500 ms timer.
- **It doesn't:** an external-mic capture of the audible mix is clean, and the
  tick doubles as an "am I actually winding" confirmation.

The contaminants themselves are **not yet sourced to handles** — s0035 is the
Night-1 phone call, not the music-box tune; unverified candidates are s0020
(tonal), s0009 (noise), s0010 (74 s loop, g66).

Modelled as `WIND_TICK_SAMPLE`/`WIND_TICK_FRAMES` in `config.js`, emitted as a
`wind-tick` event, pinned by `sourcetest.mjs`.

## Discrete SFX are on the fast mixer and NOT captured — settled 2026-08-29

The winding tick, and every other discrete `Play sample` cue, **does not appear
in the internal capture on this device.** Confirmed three independent ways
against `n1-minustoys-calib-01` (Moto g56, `com.scottgames.fnaf2` 2.0.7+26):

1. **Ear** — 318 s of the real internal capture, audited by the device owner:
   no winding tick anywhere, just a continuous loop bed.
2. **Matched filter** — `s0033` injected into the capture scores 0.89/0.70/0.43
   at +6/0/−6 dB SBR (pipeline works), but matched-filter scan of the real
   capture at 656 onset candidates is at the ~0.045 noise floor for s0033,
   s0015 and s0020. Capture RMS is identical winding vs not-winding (0.994).
3. **`dumpsys media.audio_flinger` while winding** — FNaF (uid 10741) runs
   ~12 tracks on `AudioOut_15` = `AUDIO_OUTPUT_FLAG_DEEP_BUFFER` (the ambient
   loops, `Usg` 1 = USAGE_MEDIA) **plus one track (id 4999, session 14409) on
   `AudioOut_1D` = `AUDIO_OUTPUT_FLAG_FAST`** — the FastMixer thread,
   `mixPeriod=5.33 ms`. That fast track flips active↔standby every ~0.5 s with a
   **12513-frame (0.284 s at 44.1 kHz) burst = WinD's exact length.** WinD *is*
   that fast track.

**Mechanism.** Two AOSP topologies exist. Classic
([latency design](https://source.android.com/docs/core/audio/latency/design)):
"the normal mixer's sink is a blocking pipe to the fast mixer's track 0" — one
HAL output, and playback capture *does* get SoundPool. The g56 instead has
**three separate output threads each with its own `AudioStreamOut`**
(`AudioOut_D` PRIMARY, `AudioOut_15` DEEP_BUFFER, `AudioOut_1D` FAST), combined
only downstream at the HAL. `AudioPlaybackCapture` taps the normal mixer's
software output; the FAST stream is a sibling it never sees. **Device-specific:
a phone with the classic topology would capture these cues.**

**Not a tagging or policy issue.** `Application/CSoundPlayer.java:125` builds
`new AudioAttributes.Builder().setUsage(14).setContentType(4).setLegacyStreamType(3)`
— `setUsage(14)` is `USAGE_GAME`, which *is* capturable (and the runtime
resolves it to USAGE_MEDIA anyway via the legacy stream type). No
`setAllowedCapturePolicy` opt-out. Manifest `targetSdk=36`, no
`allowAudioPlaybackCapture` override. Music and SFX carry the same attributes —
music is captured, SFX are not — so it is purely the fast-mixer routing.

**Every fix is privileged:**

| Approach | Verdict on this phone |
|---|---|
| `setprop af.fast_track_multiplier 0` (drop SoundPool to the normal mixer) | **Denied** — `user` build, no root (tested: "Failed to set property"). |
| [XAudioCapture](https://github.com/wzhy90/XAudioCapture) (LSPosed) | Doesn't apply — it force-adds the *capture policy*; FNaF already allows capture. Needs Xposed regardless. |
| Tap the FAST HAL output / HAL loopback (`tinyalsa`) | System/root only. |

### Consequences

- **The winding-tick phase clock via internal capture is refuted.** External-mic
  capture of the audible mix (BT A2DP sink on a Linux box, or a wired 3.5 mm
  tap) is the only non-root path; the recompile's openal-soft `Play sample`
  hook is the frame-perfect one.
- **`plans/08` (the audio-cue controller) is blocked on this device.** BB's
  laughs are samples 21/23/24 — the same SoundPool/fast path. The cue helper's
  2026-08-24 "PCM was nonzero" result was the ambient bed, never the vocals. An
  on-device `AudioPlaybackCapture` cue controller cannot hear discrete cues here
  without root.
- Recorded audio is still useful for **offline detector proofing** — an external
  mix recording can validate a detector that a rooted or recompiled build would
  then run live.
