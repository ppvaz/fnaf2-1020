# FNaF 2 10/20 — Gate-aware hybrid search

### Simulator research report, 2026-08-19; final Android correction 2026-08-20

> **Current verdict: closed for the searched observable policy family.** The
> apparent 150/150 monitor-denial reopening was a model error. The Android UI
> audit proves that `monitorFrame` is the mask state, not the camera state, and
> groups 538-555 resolve a defense decision latched earlier in a 45-frame fuse;
> they are not continuous instant-mask repel events. With the 300-frame office
> sequence represented, every tested gate-aware family scores 0/150.
>
> **Platform scope:** modern Android release 7 is the canonical target. Exact
> source evidence is in
> [`ANDROID-OFFICE-ENDGAME.md`](ANDROID-OFFICE-ENDGAME.md); remaining gaps are in
> [`ANDROID-SOURCE-STATUS.md`](ANDROID-SOURCE-STATUS.md).

## What was searched

`tools/gatesearch.mjs` searches a compact policy family rather than a black-box
agent:

- keep the monitor down across movement checks where possible;
- wind reactively when the visible box gauge crosses low/high thresholds;
- split recovery into two short cams-up bursts with a down/flash reset between;
- react only to represented visible blackouts/office threats;
- optionally flash a fixed camera set: none, CAM 06 (Minus Right), CAM 07,
  CAM 03 (Minus Two), or CAM 06+07;
- enumerate all 125 three-phase schedules over those sets, switching at 2 AM
  and 4 AM. These use only the clock, never hidden route state.

The split recovery was the best form found: a single long trip stayed under the
office-entry streak but gave Foxy's D enough uninterrupted time to lock on.

## Correction history

The first gate-aware pass let a fresh successful movement roll ignore the monitor,
light and mutex gates. Fixing that made pure monitor denial look extraordinary:
150/150 clean with box slack. That result was retracted when the source showed
separate marker-122 rules:

- Toy Freddy, Toy Bonnie, Toy Chica and Withered Freddy use the shared
  `value25 >= 20-2N` cameras-up streak. Night 7 therefore gives six seconds.
- Withered Bonnie enters 122 only with cameras down, gets a
  `1000-100N`-frame timer (300 on Night 7), and fails on a later cameras-up state
  after it expires.
- Withered Chica has a separate scheduler counter and cameras-up failure after
  five-plus seconds.
- Mangle reaches 122 cameras-up; five continuous fully-masked scheduler ticks
  clear her, while completing the next monitor raise sends her to marker 123.

A second apparent correction then reopened monitor denial at 150/150. It was also
wrong. Misleading export names had led us to treat `monitorFrame = 2` as cameras
up. The surrounding UI events establish the opposite:

- `Multiple Touch = 0` is office/cameras down and `> 0` is a selected camera.
- `monitorFrame = 2` is the Freddy mask fully on.
- `old chica` starts the office encounter, a 45-frame defense fuse is latched,
  and groups 538-555 use that latched result at the 300-frame endpoint.

Therefore those groups do **not** instantly return every unarmed marker-122
attacker whenever the mask happens to be on. The false implementation removed the
actual office cost and let a privileged controller erase attackers on hidden timer
edges. The engine now models the shared encounter, the four-attacker threshold
mutex, W. Bonnie's overlay/timer, W. Chica and Mangle's continuous mask counters,
Mangle's monitor-raise transition, and the located marker-123 attack branches.

## Corrected sweep

Each row uses 150 seeds. `Pinned` pins hostile RNG choices for diagnostics; it is
not a formal worst-case proof. Jitter columns delay controller inputs by up to the
shown amount.

| Policy | Clean | Pinned | 100 ms jitter | 200 ms jitter | Main death |
| --- | ---: | ---: | ---: | ---: | --- |
| Monitor denial | 0/150 | 0/150 | 0/150 | 0/150 | inside-office |
| Minus Right / CAM 06 | 0/150 | 0/150 | 0/150 | 0/150 | inside-office |
| CAM 07 only | 0/150 | 0/150 | 0/150 | 0/150 | inside-office |
| Minus Two / CAM 03 | 0/150 | 0/150 | 0/150 | 0/150 | inside-office |
| CAM 06+07 hybrid | 0/150 | 0/150 | 0/150 | 0/150 | inside-office |
| Best clock-phased set (`none → none → none`) | 0/150 | 0/150 | 0/150 | 0/150 | inside-office |

The earlier 10-12% fixed-policy table and both 150/150 tables are retained in Git
history as provenance, but are superseded because each depended on a known model
error.

## What this closes—and what it does not

- **Six-Seven stays refuted on Android as a two-camera cover.** The extracted
  route graph has no such cover.
- **Observable monitor denial is closed in this searched family.** Its resource
  advantage disappears once the source-shaped office cost and character-specific
  endgames are restored.
- **This is not a proof over every possible policy.** Exact same-frame ordering
  among non-mutex office occupants, W. Chica's unexplained state-99 branch, and
  auxiliary office objects remain open mechanics. A future source correction
  could justify a focused rerun, but blind enlargement of the policy grid is not
  warranted now.
- **Minus 7 remains the control.** It still survives 200/200 normal seeds and
  100/100 pinned worst-luck seeds with zero stun lapses in the current Android
  model.

Reproduce with `node tools/gatesearch.mjs`; use `--quick` for a smoke sweep. The
Minus 7 control is `node tools/bbtest.mjs 200`.
