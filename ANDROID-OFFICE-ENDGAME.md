# Android office endgame audit

Target: modern Android release 7, Fusion build 296, August 2025 project
revision. Event numbers refer to `03-04-Office.txt` in the owned local
event-sheet extraction. This document records mechanics, not redistributed game
assets.

**Rewritten 2026-08-20 against the post-XOR true-name dump.** The original
audit (pre-XOR names, bijectively swapped identities) reached the correct
state-machine structure; this revision re-states it with the real object
names and the corrected character bindings, plus the backlog-sweep decodes.
Group numbers are unchanged from the original audit.

## UI-state anchors

Post-XOR, the anchors are simply the objects' real names:

| State | Meaning | Anchors |
| --- | --- | --- |
| `viewing = 0` | office / cameras down (also forced while masking, group 911) | group 13 hides camera UI and re-arms the vent lights; group 262 zeroes it on monitor drop — without moving the `your view` marker |
| `viewing > 0` | cameras up; value = selected display CAM 1-12 | group 14 shows camera UI; groups 144-235 assign values and snap the marker |
| `mask` value0 = 0/1/2/3 | Freddy mask off / going on / fully on / coming off | state 2 forces `viewing = 0` (group 911); the light input requires state 0 (groups 75-76), which is the whole "post-mask flash lockout" |
| `lit?` | camera/hall flashlight on | drains `battery life` 1/frame (group 284); force-cleared every frame while BB is inside (group 96) |
| `left light` / `right light` value0 | vent light held | re-cleared every 200 ms (group 299); no battery cost; right one blocks Toy Bonnie's vent hop (group 428) |

## Shared office sequence

`in danger` is the encounter/engagement latch. On its 0→1 edge:

1. Group 530 copies the by-night `time allowed` fuse (100/80/60/55/50/50/45
   frames) into `time left` and sets the defense state `got you stage = 1`.
2. Group 531 drains the fuse. Expiry sets `got you stage = 2` (armed/missed,
   group 532); a fully-on mask first sets it to 0 (defended, group 533).
3. The office sequence counter (`blackout` value0) runs to 300 frames, then
   group 537 raises the endpoint flag `check and move`.
4. Groups 538-555 resolve the marker-122 occupant at that endpoint: defense
   state 0 returns them to their route with a fresh approach cooldown
   (B = Random(500)/night); state 2 sends them to marker 123 (`got you
   box`). Withered Bonnie's repel target is CAM 07 and Withered Chica's is
   CAM 04 — mid-route, not their home rooms; Toy Bonnie's is CAM 03.

Groups 538-555 are **endpoint resolution**: they do not poll the live mask.
The defense decision is latched during the fuse; the visible sequence runs
~300 frames either way.

**Forcedown:** `drop everything` forces the monitor (group 262) and the mask
(group 274) down in the same tick it is set. It is set every 10 s while any
streak-four attacker waits at 122 with the cameras up (groups 718-721), on
any attack start (group 624), when the Puppet reaches 123 (group 574), and by
the player's own drop button; group 612 clears it.

## Per-character marker-122 behavior (true names)

| Character | Android endgame |
| --- | --- |
| W. Freddy, W. Bonnie, W. Chica, Toy Freddy (the `office occupied` mutex four) | Reach 122 only with cameras up. Cameras down at 122 starts the shared encounter; staying cameras-up trips the shared `value25 >= 20-2*night` streak branch to 123. |
| Toy Bonnie | Reaches 122 only with cameras DOWN and the right vent light off (group 428); his own B = 1000-100*night is the opening timer. While masked and unengaged he rolls Random(2)=1 every 500 ms to create his overlay `Active 19` (group 436), whose existence sets `in danger` (group 443); masked+engaged he has a 1-in-3/s repel to CAM 03 (group 437), and the overlay finishing its slide also repels him (group 441). B=0 plus a monitor raise sends him to 123 (group 546). |
| Toy Chica | Reaches 122 with no monitor condition (group 435). Her overlay object `chicalookatyou` is created by the still-unexplained mask-state-99 branch (group 438). Five continuous fully-masked ticks return her to CAM 07, with a 10%/s early roll; re-entering the mask state resets the counter. |
| Balloon Boy | Same shape as Toy Chica/Mangle at 122: a completed monitor raise advances him to 123 (groups 290-291); five continuous masked ticks or a masked 10%/s roll return him to CAM 10 (groups 292/294). |
| Mangle | A monitor raise seen at 122 flags her and the raise's completion sends her to 123 (groups 402-403); five continuous masked ticks return her to the route with a 10%/s early roll (groups 400-401). |
| W. Foxy | Skips 122 entirely: hall stage 1 → straight to 123 (group 390). |
| Puppet | Escapes CAM 11 in 3 rolled stages once the box is empty (blocked while flashing CAM 11, group 494), roams its route, and its arrival at 123 sets danger and forces the monitor down (group 574). |

## Marker-123 behavior (true names)

Marker 123 (`got you box`) is a real inside-office state, not the jumpscare:

- The mutex four roll a 50% `being attacked by` attack each fully-masked
  second (groups 556-559); a later 10%/s roll can return them to their route
  with B = 500 (groups 747-750) — the attack groups run first, so a
  same-tick return does not cancel a raised danger. Unmasking or lowering
  the monitor raises danger immediately (groups 560-567).
- Toy Bonnie raises danger when the monitor starts lowering (group 568) and
  every 10 cameras-up seconds (group 722).
- Mangle arms on a 5% cameras-up second (groups 729-730); cameras down then
  raises danger (group 731).
- W. Foxy: every 10 s in either monitor state, or instantly on a
  monitor-down hall flash (groups 571-573).
- Balloon Boy never attacks: he force-clears `lit?` every frame and blocks
  the light/camera touch inputs (groups 96, 75-88, 301-320); **no departure
  group from 123 exists — BB is permanent once inside.**
- `being attacked by` runs the shared 40-frame countdown to the jumpscare
  (groups 587-588).

The `office occupied` mutex covers only the four streak attackers (their
final edges require it at 0: groups 379, 384, 388, 423; groups 713-717
reassert it). Toy Bonnie, Toy Chica, Mangle and BB bypass it and can coexist
with a mutex holder. `in danger` serializes the shared visible encounter.

## Simulator boundary

The engine represents the by-night fuse, 300-frame encounter, mask-animation
completion requirement, the four-attacker mutex, Toy Bonnie's cue/cooldown,
Toy Chica's continuous mask counter, Mangle's next-raise branch, and the
marker-123 attack/leave branches. Not yet unified from the backlog decode:
Toy Bonnie's B-as-opening-timer, the mid-route repel destinations, BB's
light-disable at 123 (and his permanence), Foxy's masked D acceleration, and
exact same-frame ordering among non-mutex occupants.

The original audit's falsification of the "continuous marker-122 mask
polling" reading and its 150/150 monitor-denial result stands: with an
observable-only controller and the corrected endgame, every tested gate-aware
family is 0/150.
