# FNaF 2 10/20 — Gate-aware hybrid search

### Simulator research report, 2026-08-19; reopened 2026-08-20

> **Current verdict: reopened as an Android lead, not yet a strategy.** A later
> source correction changed the result again: groups 538–555 poll the mask while
> an attacker is at marker 122, so an unarmed attacker arriving while the mask is
> *already on* must leave immediately. The old engine checked only on the mask-on
> input frame. With continuous polling represented, the perfect-information gate
> bot now survives 150/150 clean and 150/150 pinned seeds under monitor denial.
> It reads hidden arming timers and the marker-122 identities/state machine remain
> partly decoded, so this is not yet a human-playable or source-closed result.
>
> **Platform scope:** modern Android release 7 is the canonical target, so this
> closes the searched family on the target route graph. Remaining source/model
> gaps are tracked in [`ANDROID-SOURCE-STATUS.md`](ANDROID-SOURCE-STATUS.md).

## What was searched

`tools/gatesearch.mjs` searches a compact policy family rather than a black-box
agent:

- keep the monitor down across movement checks where possible;
- wind reactively when the visible box gauge crosses low/high thresholds;
- split recovery into two short cams-up bursts with a down/flash reset between;
- mask BB, blackouts and the two timer-armed Withereds;
- optionally flash a fixed camera set: none, CAM 06 (Minus Right), CAM 07,
  CAM 03 (Minus Two), or CAM 06+07;
- enumerate all 125 three-phase schedules over those sets, switching at 2 AM
  and 4 AM. These use only the clock, never hidden route state.

The split recovery was the best form found: a single long trip stayed under the
office-entry streak but gave Foxy's D enough uninterrupted time to lock on.

## The source correction

The first gate-aware engine pass contained a real bug: a fresh successful movement
roll advanced immediately, while monitor/light/mutex gates were checked only on a
later pending retry. The event groups put every successful roll into the same
state-2 retry transition, so `src/engine.js` now calls `canAdvance` on the initial
roll too.

Fixing that bug initially made pure monitor denial look extraordinary: 150/150
clean, 150/150 with 100 ms jitter, 30% minimum box. That result is **retracted**.
The next event-sheet audit found that the engine also gave every marker-122 occupant
the Toys' shared `value25` rule:

- Toy Freddy, Toy Bonnie, Toy Chica and Withered Freddy use `value25 >= 20-2N`;
  on night 7, six continuous seconds of cams up advances 122→123. Cams down resets
  `value25` (groups 542–545 and 785–786).
- Withered Bonnie enters 122 only with cams down, receives a
  `1000-100N`-frame per-unit cooldown (300 frames on night 7), then advances on a
  later cams-up state when that timer reaches zero (groups 428 and 546).
- Withered Chica has a separate counter at 122, incremented by the one-second
  scheduler, and advances while cams are up after it exceeds five (groups 903–905).
- Mangle's 122→123 transition is tied to the right-vent light object becoming
  visible and then invisible (groups 402–403). Treating an entirely unchecked
  Mangle as parkable remains an inference, but it cannot rescue the search because
  the two Withereds already bind the box economy.

The engine now represents those endgames separately. The Withered Chica model uses
a conservative five-second arming edge because six global scheduler ticks can span
only just over five wall-clock seconds.

### 2026-08-20 correction: continuous mask polling

The previous pass still encoded the timely-mask rule incorrectly. Source groups
538–555 are ordinary event conditions, not a one-shot “mask was just pressed”
handler: while the mask state is valid, an unarmed marker-122 occupant is returned
to its route. Therefore an occupant that reaches 122 during an existing mask hold
must be repelled on arrival. `engine.js` now applies the same predicate both when
the mask goes on and when a unit enters the threshold; `simtest.mjs` covers both.

This removes the repeated five-second-mask cost that supported the closure below.
At the fixed `0.90/1.00` box thresholds, a focused 150-seed probe currently gives:

| Policy | Clean | Pinned | Minimum box (clean) |
|---|---:|---:|---:|
| Monitor denial | 150/150 | 150/150 | 31% |
| CAM 06 | 150/150 | 150/150 | 0% |
| CAM 07 | 150/150 | 150/150 | 24% |
| CAM 03 | 150/150 | 150/150 | 24% |
| CAM 06+07 | 150/150 | 150/150 | 0% |

Monitor denial is the important row: it preserves box slack without depending on
a camera-cover claim. But the controller performs roughly 16–26 hidden-state threat
reactions per night, including masks timed one frame before an unseen Withered arms.
Until those reactions are replaced by Android-observable cues or a conservative
fixed rhythm—and the 122/123 office state machine is fully decoded—the numbers are
an optimistic existence hint only.

## Superseded 2026-08-19 sweep

Each fixed row below uses 150 clean seeds after a threshold search. `Pinned` is the
engine's diagnostic mode that pins hostile rolls; it is **not** a mathematical
worst-case bound because synchronized attackers can be easier than independent RNG.

| Policy | Clean | Pinned | 100 ms jitter | 200 ms jitter | Minimum box | Main death |
|---|---:|---:|---:|---:|---:|---|
| Monitor denial | 10% | 100% | 10% | 7% | **0%** | Puppet |
| Minus Right / CAM 06 | 0% | 0% | 0% | 0% | 0% | Puppet |
| CAM 07 only | **12%** | 0% | 16% | 11% | 0% | Puppet |
| Minus Two / CAM 03 | 7% | 0% | 15% | 5% | 0% | Puppet |
| CAM 06+07 hybrid | 0% | 0% | 0% | 0% | 0% | Puppet |
| Best clock-phased set: `07 → 07 → 07` | **12%** | 0% | 16% | 11% | 0% | Puppet |

This table is retained as provenance, not as the current result. Its resource
contradiction depended on missing the continuous-mask-on-arrival rule.

## What this closes—and what it does not

- **Six-Seven stays refuted on Android as a two-camera cover.** Reopening monitor
  denial does not create a two-camera cover and does not rehabilitate that theory.
- **Monitor denial is open again.** The current 150/150 result is a privileged-model
  upper bound; the next question is whether an observable or fixed Android policy
  can replace its hidden timer reads.
- **The 2026-08-19 fixed/phase percentages are superseded.** They must be rerun only
  after the Android office endgame is decoded; doing a wider sweep now would spend
  compute on the dominant uncertainty instead of resolving it.
- **This is not a proof over every possible policy.** The Android office-light
  latch is now partially modeled, but the exact Android Toy Bonnie and office
  endgames are not. Those P0 source gaps must be decoded before widening the
  search or adapting RVC; a PC win rate is not a calibration target.

Reproduce the current model with `node tools/gatesearch.mjs`; use `--quick` for a
smoke sweep. The focused 150-seed rows above use `runPolicy` at thresholds
`0.90/1.00`. The Minus 7 control is `node tools/bbtest.mjs 200`.
