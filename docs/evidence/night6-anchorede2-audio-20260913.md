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

**The fold's phase drifts linearly**: 308, 278, 238, 208, 178, 138, 108, 48,
498, 458, 428, 378, 368 ms mod 500 across cycles 0-12 -- about -35 ms per
10 s cycle, -0.35 %. The schedule is host-timed and the wind holds are
host-timed; the audio clock is the A2DP sample clock. The audio runs 0.35 %
fast against the host (or the game's 500 ms timer runs 0.35 % slow against
wall time). Either way any phase read off the audio needs this rate correction
first, and it is measurable per run from the WinD fold. Not corrected here.

## What remains before the audio can price a Night 6 aim

1. Separate route-move bangs from endpoint bangs (both s0017): the route move
   is preceded by no encounter; the endpoint bang comes 5 s after one (the
   camdrop witness knows the encounter cycles).
2. Fold the footsteps as the WinD is folded (per 5 s grid, per run), once the
   clock rate is corrected.
3. Read the grid origin: roll-onset phase minus the schedule's delivered epoch.

Evidence artifacts: `artifacts/runs/night6-anchorede2-20260913T170041Z`
(bt-audio.json, tickphase.json, frame trace, campaign.log); the PCM at
`~/fnaf-apks/bt-audio-captures/night6-anchorede2-20260913T170041Z.bt.{raw,wav,json}`.
