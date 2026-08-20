# Android office endgame audit

Target: modern Android release 7, Fusion build 296, August 2025 project
revision. Event numbers below refer to `03-04-Office.txt` in the owned local
event-sheet extraction. This document records mechanics, not redistributed game
assets.

## UI-state anchors

The misleading exported names caused the false monitor-denial reopening. The
event behavior pins the actual identities:

| Exported state | Meaning | Anchors |
| --- | --- | --- |
| `Multiple Touch = 0` | office / cameras down | group 13 hides camera UI; groups 215-217 draw office occupants; groups 220-225 pan the office |
| `Multiple Touch > 0` | cameras up; value is selected camera | group 14 shows camera UI; groups 16-27 assign camera values; group 262 forces it to zero |
| `monitorFrame.Active value0 = 0/1/2/3` | Freddy mask off / going on / fully on / coming off | left-bottom `Active 14` starts state 1 in group 267; mask animation completion sets state 2 in group 9; state 2 forces cameras down in group 911 |
| `Active 18` visible / invisible | monitor-raise animation active / finished | right-bottom `lit?` creates it in group 254; group 1 hides it at 12 frames and enables the camera display |

`Active 14` occupies the left half of the bottom touch strip and `lit?` the
right half (groups 1055-1056), matching mask-left / monitor-right. The selected
camera counter and the objects hidden/shown by it independently confirm the
mapping; it is not based on the export names.

## Shared office sequence

`old chica` is the encounter/blackout latch. On its 0→1 edge:

1. Group 530 copies the night-specific `stun time` into `mute call` and sets
   `Golden Freddy AI = 1`. Night 7 sets `stun time = 45` frames (groups 523-529).
2. Group 531 decrements the fuse. If it expires, group 532 changes the defense
   state to 2 (armed/missed). If the mask reaches fully-on state 2 first, group
   533 changes it to 0 (defended).
3. Group 514 advances the office-sequence counter. At 300 frames group 537 raises
   `yellowbear`.
4. Groups 538-555 resolve the particular marker-122 occupant at that endpoint:
   defense state 0 returns it to its route; state 2 sends it to marker 123.

The important correction is that groups 538-555 are **endpoint resolution**.
They do not poll the live mask and do not instantly erase an attacker. The mask
decision is latched by group 533 during the 45-frame fuse; the visible sequence
continues for roughly 300 frames either way.

## Per-character marker-122 behavior

| Character | Android endgame |
| --- | --- |
| Toy Bonnie, Toy Chica, Toy Freddy | At marker 122, cameras down starts the shared encounter (groups 445-447). If cameras instead remain up, the shared `value25 >= 20-2*night` branch sends them to 123 (groups 542-544, 785-786). |
| Withered Freddy | Reaches 122 only with cameras up (group 423). Cameras down starts the shared encounter (group 490); the same `value25` branch covers the cameras-up failure (group 545). |
| Withered Bonnie | Reaches 122 only with cameras down and gets `1000-100*night = 300` frames on Night 7 (group 428). While the mask is fully on, every 500 ms he has a 50% overlay-creation roll (group 436); overlay existence starts the shared encounter (group 443). Raising cameras after his timer reaches zero sends him to 123 (group 546). |
| Withered Chica | Reaches 122 without a monitor-polarity gate (group 435). Her local scheduler counter arms the cameras-up failure after five-plus seconds (groups 903-905). While the mask is fully on she has a 10% leave roll per second and a forced return after five continuous mask ticks; entering the fully-on mask state resets the counter (groups 293, 439-440, 907). Group 438 also contains a literal mask-state comparison to 99 before creating `office occupied`; no event assigning 99 has been found, so that branch remains flagged rather than normalized away. |
| Mangle | Reaches 122 only with cameras up (group 398). A monitor raise then sets her local flag while `Active 18` is visible, and completion of that same raise sends her to marker 123 (groups 402-403). Alternatively, five continuous fully-on-mask scheduler ticks return her to the route, with a 10% early-leave roll each second (groups 293, 400-401). |

## Marker-123 behavior

Marker 123 is a real inside-office state, not the jumpscare itself:

- Toy Bonnie, Toy Chica, Toy Freddy and Withered Freddy roll a 50% `danger 2`
  attack each fully-masked second (groups 556-559). A later 10% roll can return
  them to their route (groups 747-750), but the attack event comes first, so a
  same-tick return does not cancel an already-raised danger flag. Removing the
  mask or lowering the monitor also raises danger immediately (groups 560-567).
- Withered Bonnie and Withered Chica raise danger when the monitor starts
  lowering (groups 568-569). Withered Bonnie additionally raises it after a
  ten-second cameras-up interval at marker 123 (group 722).
- Mangle rolls a 5% arm each cameras-up second (groups 729-730). Once armed,
  returning to cameras down raises danger (group 731).
- `danger 2` advances a shared counter and reaches the jumpscare frame after 40
  frames (groups 587-588).

The four Toy/W. Freddy entries share the `chicalookatyou` mutex: their final
route edges require it to be zero (groups 379, 384, 388, 423), and groups
713-717 reassert it while any of those four occupies marker 122. This proves
one-at-a-time admission for that subset. Withered Bonnie, Withered Chica and
Mangle do not use that mutex and can coexist with it. `old chica` serializes the
shared visible encounter; exact same-frame ordering among non-mutex occupants
is still unresolved.

## Simulator boundary

The engine now represents the shared 45-frame defense fuse, 300-frame encounter,
mask-animation completion requirement, the four-attacker mutex, W. Bonnie's
overlay/timer, W. Chica's continuous mask counter, Mangle's next-raise branch,
and the located marker-123 attack/leave branches separately. It does not claim
exact visual animation ordering, exact same-frame ordering among non-mutex
occupants, the unexplained W. Chica state-99 branch, or the identity of the
exported `in office` object with a similar 122/123 raise branch.

This audit falsifies the 2026-08-20 “continuous marker-122 mask polling” reading
and its 150/150 privileged monitor-denial result. With an observable-only
controller and the corrected endgame, every tested gate-aware family is 0/150.
