# Night 6 binding e, and the first graded run with its audio (2026-09-13)

`night6-anchorede2-20260913T170041Z` (fnv1a-1cd7cd43: hallfix knobs, aim
4870 on the 5000 ms grid, k=0) released 0.48 ms late; the frame trace puts the
delivered epoch at 4814 ms (latched onset leads the first night frame by 56 ms
this time; 65-75 on the two previous traced runs). Effective ~4864 with the
~50 ms input latency: inside the model's band [4767, 4917). It died at 155.5 s
(2 AM) to Withered Foxy at the instant of the post-mask flash (g573): frames
177.6 cams, 178.2 drop, 178.6 office lit under the held camdrop light, 183.7
mask on, 184.1 the post-mask flash lit, 184.5 Foxy.

That is the fourth Night 6 death to Foxy-at-the-flash across two knob families
(b1 at effective ~4985, e2 at ~4864), plus two Balloon Boy deaths at ~4900 and
~5225. The model's phase-to-outcome map does not sit where the phone's does;
the likeliest reason is its grid origin: the model starts Foxy's five-second
counter at the first held night frame, while Fusion's `Every 5000 ms` timer
runs from the frame's start, which precedes the first night frame by the
intro/fade. The audio is the instrument for that, and this run is the first
that carries it.

## The audio capture

`night-run.sh --bt-audio` retained 78.6 MB of raw aptX-HD PCM (S24 in 32-bit,
48 kHz) from the BlueALSA sink across the run, host-clock stamped at spawn
(`bt-audio.json`, upper bound on the first sample). Pairing needed a fresh bond
on both sides (the old one failed with `br-connection-unknown` / LE abort) and
a KeyboardDisplay agent to confirm the passkey; `bluealsa-aplay` runs as root
here and must be stopped with sudo before the PCM is free.

`tickphase.py` on it ([`night6-anchorede2-tickphase-20260913.json`](night6-anchorede2-tickphase-20260913.json)):

| handle | result |
|---|---|
| s0017 vent bang | 10 onsets, NC up to **0.787**; in pairs 2.36 s apart (the sample has two thuds; six events). Their cycle phases (1.2, 3.6, 8.6, 1.5, 3.9, 9.8 s) do not fold on the 5 s grid: these are the ENDPOINT bangs (g538-548, 300 frames after the encounter), not route moves. The witness map overclaimed s0017 as a roll witness; only the route-move bangs are, and they share the handle. |
| s0025-29 footsteps | NC max 0.29-0.40 at a 0.25 threshold: mostly noise. Not usable at single-onset level. |
| s0033 WinD | 6 of ~90 ticks above 0.30 single-onset. **Folded on the 500 ms grid per wind hold: z 6-16 in every cycle that wound** (13 of 13), max NC 0.20-0.36. The ticks are all there, buried. |

**Correction, later the same day: the audio time axis is broken.** The
sidecar shows 195.55 s of samples in 211.59 s of wall clock: 16.0 s (7.6 %)
of the aptX-HD stream never reached the raw. The death scream (s0062, NC 0.75)
sits at 143.6 s after release in audio time while the video puts the jumpscare
at ~150.2 s and the campaign's static read at 156 s. The "clock drift" below is
that loss accumulating, not a rate. Every audio time in this record is early by
an amount that grows through the run; onsets are real, their times are not.
`capture-bt-audio.sh --stop` now writes `missingFraction`/`timeAxis` and
`tickphase.py` refuses to read a phase above 0.5 % loss. The August 2026
validation of this path was on SBC; the transport was switched to SBC for the
next run.

**The fold's phase drifts linearly**: 308, 278, 238, 208, 178, 138, 108, 48,
498, 458, 428, 378, 368 ms mod 500 across cycles 0-12 -- about -35 ms per
10 s cycle, -0.35 %. The schedule is host-timed and the wind holds are
host-timed; the audio clock is the A2DP sample clock. The audio runs 0.35 %
fast against the host (or the game's 500 ms timer runs 0.35 % slow against
wall time). Either way any phase read off the audio needs this rate correction
first, and it is measurable per run from the WinD fold. Not corrected here.

## Detectability census on this capture (NC max / onsets > 0.35, 0.5 s refractory; times early by the loss above)

[`night6-anchorede2-audio-census-20260913.json`](night6-anchorede2-audio-census-20260913.json)

| handle | meaning (AUDIO-WITNESS-MAP) | NC max | onsets | reading |
|---|---|---|---|---|
| s0060 | hall presence loop | **0.95** | 56 | the loop is trivially detectable; a per-cycle level, not an onset, is the right read |
| s0010 | blackout / camera-signal-lost | **1.00** | 7 | encounters at ~57, 87-90, 117-120 s: the `in danger` witness works |
| s0062 / s0012 | jumpscare scream | 0.75 | 1 | death instant to the frame (once the axis is continuous) |
| s0017 | vent bang | 0.79 | 8 | strong; endpoint vs route-move bangs still to be separated |
| s0009 | mask breathing | 0.59 | 3 | detected on some windows only; the loop's onset is soft |
| s0007 | mask/monitor button sound | 0.49 | 8 | every 10 s (27.8, 47.8, 67.8 ...): a per-cycle press witness |
| s0031 / s0030 / s0032 | Mangle movement | 0.54 / 0.40 / 0.40 | 1 each | present, near threshold |
| s0005 | monitor button | 0.60 | 1 | weak at 0.35 |
| s0013 | UI click | 0.99 | 4 | strong when present |
| s0021 bb-hi | Balloon Boy "hi" | 0.35 | 1 | at threshold; s0023 hello 0.34, s0024 laugh 0.17: NOT detected this run (BB never inside) |
| s0016 | light click with BB inside | 0.17 | 0 | not present (no BB inside on this run) |
| s0020 | Mangle radio loop | 0.20 | 0 | not detected; loop bed, needs a level read |
| s0025-29 | Foxy footsteps | 0.29-0.40 | 0-1 | below single-onset detectability; fold only |
| s0034 / s0043 | encounter-30 / Puppet tune | 0.25 / 0.07 | 0 | not present or not detectable |
| s0033 | WinD | 0.36 | 1 | buried; per-hold fold z 6-16 (above) |

## What remains before the audio can price a Night 6 aim

0. A continuous capture: SBC transport (August's validated codec), and the
   sidecar's `timeAxis` CONTINUOUS.

1. Separate route-move bangs from endpoint bangs (both s0017): the route move
   is preceded by no encounter; the endpoint bang comes 5 s after one (the
   camdrop witness knows the encounter cycles).
2. Fold the footsteps as the WinD is folded (per 5 s grid, per run), once the
   clock rate is corrected.
3. Read the grid origin: roll-onset phase minus the schedule's delivered epoch.

Evidence artifacts: `artifacts/runs/night6-anchorede2-20260913T170041Z`
(bt-audio.json, tickphase.json, frame trace, campaign.log); the PCM at
`~/fnaf-apks/bt-audio-captures/night6-anchorede2-20260913T170041Z.bt.{raw,wav,json}`.

## Later the same day: the loss is one early gap, the mask-on sound is a per-cycle anchor, and the kill pins the grid

- **s0007 is the mask-on touch sound** (g267 plays sample 7 on the red
  button; g254 plays sample 5 on the monitor button). Its eight onsets sit at
  audio time 7.76-7.80 mod 10 s over 110 s: a 40 ms spread. The audio clock
  does not drift and does not lose samples during the run; the 16 s deficit is
  one gap before or around the release (A2DP suspends while the phone is
  silent and `bluealsa-cli open` writes nothing for the pause). With SBC or
  not, the axis needs a per-run anchor, and the mask-on sound is it: schedule
  mask-on at 4.249 + delivered 4.814 = 9.063 mod 10 versus audio 7.77 puts
  this capture 1.29 s (+10k) early.
- **The kill instant pins the game's grid.** The video shows mask on at
  183.7 s, the office forced lit at 184.1 (g624 drop-everything), Foxy at
  184.5: the g571 kill on the `Every 10000 ms` tick, at schedule time
  150.2 s -- cycle phase 0.2, i.e. the game's five-second ticks land at
  0.186 + 5k after the release, exactly where a first-night-frame origin with
  the delivered epoch 4814 puts them. **The grid origin is not the error**;
  the model's placement of the ticks is right to ~100 ms.
- **So why Foxy?** At AI 15 (2 AM+) g337 locks when 21 + Random(5) - D <= 15,
  i.e. D >= 6 with 20 % per tick, D >= 10 with certainty. The mid-cycle tick
  at 5.186 comes ~0.9 s after the camdrop light and ~0.7 s into the mask
  window; if the camdrop reset lands, D is 1 there. The tick at 0.186 comes
  ~80 ms after the post-mask flash lights; if the flash lands, D is 0. Foxy
  therefore killed on a cycle where a reset did not land: the post-mask flash
  is refused when the mask-off effect (307 ms median, 352 max) plus the
  244 ms animation reaches past the flash press at +600 (margin ~50 ms), and
  the camdrop light overlaps `viewing` = 0 only if the drop's effect precedes
  the light's release. Both are actuation-latency edges the model does not
  carry; on Night 5 (AI 7) a missed reset costs nothing, on Night 6 (AI 15)
  one missed reset followed by a lucky roll kills. The instrument for the
  next run: the hall doorway at 60 fps during every camdrop and every
  post-mask flash (lit / dark / flat), per cycle, next to the audio anchor.

## The per-cycle ledger (video + audio, same run)

[`night6-anchorede2-cycle-ledger-20260913.json`](night6-anchorede2-cycle-ledger-20260913.json).
Geometry: 640x288 frames; doorway region x240-453, y80-213; the camdrop
light never renders a lit hall at any cycle (released before the drop
completes: the reset, if it lands, is invisible, via `viewing` = 0 at the
press); the post-mask flash read at +0.05..+0.18 s after its press, before
the raise white-out, against the 0.2 s before it.

| cycle | occupant at the drop (colour rule) | post-mask flash (door, pre) | office after mask-off |
|---|---|---|---|
| 0 | empty | 28.8 / 9.4 LIT | 15.9 |
| 1 | empty | 10.4 / 9.0 **FLAT** | 15.9 |
| 2 | empty | 28.9 / 9.5 LIT | 16.0 |
| 3 | empty | 28.9 / 8.6 LIT | 15.7 |
| 4 | empty | 28.9 / 9.5 LIT (Withered Foxy standing in the beam) | 15.9 |
| 5 | occupant, hue 57 (27 k px; not in the corpus rule) | 15.5 / 9.5 DIM | 16.0 |
| 6 | empty | 8.1 / 1.7 **FLAT** | **3.3** (defended) |
| 7 | empty | 15.5 / 8.6 DIM | 15.8 |
| 8 | **Withered Freddy** (38 k px, hue 19) | 15.4 / 9.1 DIM | 15.9 |
| 9 | empty | 8.1 / 1.7 **FLAT** | **3.4** (defended) |
| 10 | empty | 28.9 / 9.0 LIT | 15.8 |
| 11 | **Withered Bonnie** (28 k px, hue 227) | 28.9 / 8.6 LIT | 15.8 |
| 12 | empty | 8.1 / 1.6 **FLAT** | **3.3** (defended) |
| 13 | empty | 15.4 / 8.6 DIM | 15.8 |
| 14 | empty (cams never dropped: dead at 150.2) | 28.2 / 9.5 LIT | 16.0 |

Audio agrees cycle for cycle: the blackout / signal-lost loop (s0010) starts
at schedule 58.1, 88.2, 118.1 s (cycle phase 8.1-8.2 in cycles 5, 8, 11, the
three occupied drops), and the office is darker after the mask window that
followed each (6, 9, 12), whose flash is FLAT -- the hallfix finding again:
after a defended encounter the flash does not fire. Three flash classes on
this geometry: LIT ~29, DIM ~15.5, FLAT ~8-10.

What killed: the last reset before the death was cycle 13's DIM flash at
140.11 s (dark-rendered beams still reset, g489/g745); the mid-cycle tick at
145.186 saw D = 5 + the masked second = 6, which at AI 15 locks with
Random(5) = 0 (g337), and g571 killed on the 10 s tick at 150.186 with no
blackout to cover it. The camdrop reset at 143.85-144.12 (light held while
`viewing` = 0) would have zeroed D first -- it did not: either Foxy was not
at hall stage 1 for g745 (the light only decays D by one per 500 ms while he
is at CAM 08, g864) or the overlap did not happen. With one reset per cycle
this binding carries a ~20 % lock per tick from 2 AM; the Night 6 route needs
D < 6 at BOTH ticks, i.e. a reset that lands within ~4 s before each tick.
