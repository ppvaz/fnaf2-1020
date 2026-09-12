# Night 6 as a death prediction — Foxy named, three times too early, 2026-09-12

The first run read against a prediction written before it. Pedro asked for
Night 6 on the phone "to see whether the Foxy prediction is right"; it was
right about the killer and wrong about the time, and the run measured why.
The instrument this run established is described in
[`ON-DEVICE-VALIDATION.md`](../device/ON-DEVICE-VALIDATION.md) ("Death
prediction and death targeting").

## The run

| | |
|---|---|
| run | `night6-foxytest-20260912T223944Z` (campaign `campaign-2026-09-12T22-39-59.747Z`) |
| binding | `minus-toys`, winner `fnv1a-05d2f9a6` — the exact knobs of the second Night 5 win (wind 3030, camdrop 13650, mask 4249/9560, hall 9940) |
| release | drawn epoch (no anchor aim registered for this binding) |
| retained | video `captures/night6-foxytest-20260912T223944Z.mp4` (sha256 `5f16d85f…50b8d678`), frame trace `night6-foxytest-20260912T223944Z-725996751003041.tsv`, `input-events.txt` (getevent) |

## Prediction (stated before the run, model phase census, 3000 replays over 20 phases)

- Foxy in **75 %** of phases, death at **80 / 150 / 170 s** (p10 / p50 / p90; range 50–230).
- Puppet in **25 %** (the four puppet slices), death at 27 / 33 / 50 s.
- Wins: **0**.

## Observation

- **Withered Foxy, ~26 s after the release.** Lifecycle read `state=static`
  at +27.7 s, `gameover` at +33.7 s. Frames (video; HUD first at ~29.5 s):
  mask on 46.5–51.0 s, office 51.5 s, monitor raising 52.0 s, cameras up on
  CAM 11 winding 52.5–55.5 s, monitor lowering 55.8 s, Foxy in the office
  55.9 s, jumpscare 56.0–56.1 s, static from 56.2 s.
- 3 cycle gates, all `AGREED`, 0 corrections.
- **Residual:** killer as predicted; time 26 s against a p10 of 80 s.

## Why: the post-mask hall flash is swallowed on this handset

- The contact audit (`tap-stall-audit`, on the frame trace) grades the hall
  flash at +9 940 ms **lit** and the one at +19 940 ms **DARK**.
- Its latency table (kernel press edge → first effect frame, getevent vs
  frame trace, monotonic clock): mask-off press→effect **312–315 ms** here
  (286–374 ms on `night5-aim940`). The mask-off animation that follows is
  244 ms, and every office light is refused while it runs (g75: lights need
  `mask = 0`, which is the end of that animation). So the light cannot answer
  before ~560 ms after the mask-off press; the flash is scheduled at +380 ms
  with a 33 ms contact. It lights only when the latency comes in early.
- Without that reset, Foxy's D climbs ~15 per cycle (1/s, 2/s under the
  mask). At Night 6's AI 10 he locks at D ≥ 11 — within two cycles — and the
  camdrop's held light on the monitor drop is then a flash on a locked Foxy:
  the instant kill the model itself carries. Night 5's runs survived the same
  swallowed flashes (13/34 and 22/41 dark on the two earlier traced runs)
  because Foxy at AI 5–7 needs D ≥ 14 on one roll in five.
- The model's miss is an **input**, not a mechanism: it has no mask-off
  latency, so its flash lands on a mask that is already off.

## What follows

- **Every camera-side knob is rigid.** In the model, moving the raise, the
  CAM 09 stun refresh, or the camdrop by 120–240 ms each costs 40–60 % of
  Night 5 seeds to Toy Bonnie's 40-frame attack (his 6.66 s stun lapses).
  Only the mask edges and the wind move.
- **The 10 s cycle is over-subscribed by 50–150 ms** once the refusal window
  is real: mask 5.311 s + 0.56 s refusal + flash + the 3.7 s raise→camdrop
  chain + 0.449 s camdrop→mask = 10.05 s.
- **Follow-up binding `fnv1a-34463603` (Night 5) / `fnv1a-44e8eff2` (Night 6)**
  (`artifacts/night5-hallfix`, `artifacts/night6-hallfix`): hall flash at
  mask-off + 600 ms, mask window 5.211 s, everything else as it won. Night 5
  gates 3000/3000 normal and worst. Night 6 is a `DEATH_TARGETED` bundle: the
  model predicts Foxy at 80/150/170 s in 75 % of phases, the Puppet in the
  rest, no wins — and that prediction is the claim the next run tests.

Not a route claim. `MODEL_ONLY` prediction, `DEVICE_MEASURED` observation.
