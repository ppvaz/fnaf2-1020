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

## Retraction and second run, later the same evening

**The "swallowed flash" mechanism above is retracted.** It was tested by the
runs it motivated, and it failed the test.

- `night5-hallfix-20260912T230319Z` (winner `fnv1a-34463603`: hall flash at
  mask-off + 600 ms, mask window 5.211 s) **won Night 5** — the third 6 AM,
  42/42 gates, 0 corrections — and its audit read the hall flashes **22 lit,
  19 dark**: the same census as the win before the change (19 lit, 22 dark at
  mask-off + 380). Per cycle, DARK does not correlate with that cycle's
  mask-off latency (LIT: p50 314 ms, 273–350; DARK: p50 314 ms, 283–358), and
  the dark flashes arrive in runs of consecutive cycles (100–120 s, 230–260 s,
  310–330 s, …). The dump says what a dark hall is: g875–880 set `hall
  movement` to 300 frames whenever a hall-routed character overlaps the hall,
  **g202 renders the held hall light dark while it drains, and g489/g745/g855
  still assert Foxy's logical light, reset D and pin B without consulting it**
  (`ON-DEVICE-VALIDATION.md`, hall calibration). A dark flash is a landed
  flash with the beam hidden. The flashes were landing, and resetting Foxy,
  dark or lit. Record:
  [`night5-third-6am-hallfix-20260912.json`](night5-third-6am-hallfix-20260912.json).
- Consequently the win owes nothing to the change, and the causal chain for
  the 26 s Foxy death (no reset → early lock → camdrop flash on a locked Foxy)
  has no measured support. The 26 s death is **unexplained**.
- `night6-foxyfix-20260912T231146Z` (winner `fnv1a-44e8eff2`, the first
  `DEATH_TARGETED` bundle; prediction on record before the run: Foxy 75 % at
  80/150/170 s, Puppet 25 % at 27/33/50 s, no wins): died to **Withered Foxy
  at ~238 s**, 24/24 gates agreed. The frames: mask on to video 271.3 s, the
  office reappears at 271.4 s, Foxy's jumpscare at 271.5 s — he attacks the
  instant the mask drops, the model's "locked on, no blackout covered the 10 s
  interval" path. Killer as predicted; time beyond the model's p90 (170 s),
  inside its range (max 280 s).

The dark census is a measurement in its own right. P(dark | landed) is the
probability that the `hall movement` latch is running at the flash instant;
the model puts that at 96 % (Night 5) / 94 % (Night 6), because it refreshes
the latch every frame Foxy *stands* in the hall (94 % of the night). The
phone reads 46 % / 43 %, rising through the night (Night 5: 1/6 at 12 AM →
5/7 at 5 AM). Refusals cannot lower a dark count below its landed-dark floor,
so the model's hall occupancy is too high on this build — Foxy stands there
less than modelled, or standing does not overlap g875's object and only
transits do. The hall cells cannot separate a refused flash from a landed
dark one; a refusal witness has to come from the light's own HUD/SFX or from
Foxy's behaviour in a death-targeting run. Open.

What the two Night 6 runs say together: Foxy is the killer both times, at 26 s
and 238 s, on the same route with two flash offsets that made no measurable
difference to whether flashes land. The model's Night 6 Foxy (80/150/170 s)
brackets one and misses the other by 3×; with n = 2 that is a dispersion
problem before it is a bias problem. The next death-targeting run on Night 6
should deliberately *vary the reset cadence* (skip the post-mask flash, or
skip the camdrop light) so Foxy's D growth on this build is measured directly
rather than inferred from a death time.

Model rigidity findings from the fix search (raise, CAM 09 stun refresh and
camdrop each rigid to ~120 ms through Toy Bonnie's stun) stand: they were
measured in the model, not on the phone, and this retraction does not touch
them.
