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
| Withered Chica | Reaches 122 without a monitor-polarity gate (group 435). Her local scheduler counter arms the cameras-up failure after five-plus seconds (groups 903-905). While the mask is fully on she has a 10% leave roll per second and a forced return after five accumulated mask ticks (groups 439-440, 907). Group 438 also contains a literal mask-state comparison to 99 before creating `office occupied`; no event assigning 99 has been found, so that branch remains flagged rather than normalized away. |
| Mangle | Marker 122 is a parked vent state in the current model. The located 122→123 edge depends on a right-vent-light visibility transition (groups 402-403); its complete office behavior remains a source gap. |

## Simulator boundary

The engine now represents the shared 45-frame defense fuse, 300-frame encounter,
mask-animation completion requirement, Toy/W. Freddy encounter start, W. Bonnie
overlay roll, and W. Chica mask ticks separately. It does not claim exact visual
animation ordering, multi-occupant arbitration, the unexplained W. Chica state-99
branch, or Mangle's complete endgame.

This audit falsifies the 2026-08-20 “continuous marker-122 mask polling” reading
and its 150/150 privileged monitor-denial result. With an observable-only
controller and the corrected endgame, every tested gate-aware family is 0/150.

