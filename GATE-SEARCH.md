# FNaF 2 10/20 — Gate-aware hybrid search

### Simulator research report, 2026-08-19

> **Verdict: no new strategy survived the sourced endgame audit.** Monitor denial
> produced a tempting 150/150 result under an over-broad office-entry rule. The
> event sheets then falsified that result: Withered Bonnie and Withered Chica have
> their own opening timers and cannot be parked behind the Toys' six-second
> continuous-cams-up rule. With those rules separated, every searched fixed and
> clock-phased policy drains the music box to zero. Minus 7 remains 200/200.
>
> **Platform scope:** this closes the searched family on the modern Android
> route graph. PC 1.033 parity is explicitly pending in
> [`PC-DECOMP-CHECKLIST.md`](PC-DECOMP-CHECKLIST.md); absence of that decompile
> does not count as evidence for a PC candidate.

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

## Final sweep

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

The timer-aware controller is an optimistic upper bound: it reads the exact hidden
frame at which each Withered arms and masks one frame before it. A human would need
vent observations or a more conservative cutoff. Even this privileged policy cannot
fund the repeated five-second masks and the music box at the same time.

## What this closes—and what it does not

- **Six-Seven stays refuted on Android.** No two-camera cover exists in the
  extracted Android graph; the PC graph is not yet source-confirmed.
  CAM 06+07 as a gate-aware hybrid also loses every clean validation seed.
- **Naive and reactive monitor denial are closed under the current model.** Their
  apparent clean result depended entirely on applying the wrong endgame to the
  Withereds.
- **The fixed documented candidates were worth revisiting.** CAM 07 and CAM 03 buy
  small tails, but none approaches Minus 7 and every one hits an empty box.
- **Clock-phased camera combinations were searched.** The best of 125 schedules
  degenerates to CAM 07 in all three phases and survives only 12%; switching sets
  never improves on the best fixed member of the family.
- **This is not a proof over every possible policy.** The Android office-light
  latch is now partially modeled, but brayden's PC-specific Toy Bonnie sequence
  and reactive RVC policy are not. That branch must clear the P0 items in the PC
  confirmation ledger rather than tune the Android model to a PC win rate.

Reproduce with `node tools/gatesearch.mjs`; use `--quick` for the smaller smoke
sweep. The Minus 7 control is `node tools/bbtest.mjs 200`.
