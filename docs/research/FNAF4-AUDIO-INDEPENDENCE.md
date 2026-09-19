# Can FNaF 4 be played without audio?

*Research note: 2026-09-19. A public claim, checked against our own source
dump. Nothing here was run on this project's handset.*

## Why this question matters here

[Plan 26](../../plans/26-second-target-fnaf-1-3-4.md) ranks FNaF 4 **last**
among expansion targets for one reason: the game opens by telling the player it
relies on sound cues, it has no cameras, and audio is the weakest observation
channel in this stack. Nothing here has ever graded a night on audio.

If FNaF 4 can be played *without* hearing it, that ranking is wrong, and FNaF 4
becomes a good fit for the open-loop schedules that already win on this project's
hardware.

## The public claim

Chickeninja42, [*Is It POSSIBLE to Beat Five Nights at Freddy's 4 WITHOUT
Sound?*](https://www.youtube.com/watch?v=U95fP9AYnf8) (2023-05-28, 37 min,
~6.9M views), completes every night of FNaF 4 including Nightmare mode with
game audio fully muted and audio visualizers banned, over 100+ attempts. The
author credits Reddit threads and a video by "It's Taken" for the mechanics.

`[C]` The strategy has three parts:

1. **Early nights** — alternate rapidly between the two hallways, flashing the
   torch to push Bonnie and Chica back from the middle position before either
   can reach a door. No hearing needed.
2. **The door-close forcing trick** — walk to a door and close it twice in quick
   succession, then hold a third close. This exploits an anti-cheat: the game
   *teleports* Bonnie/Chica to the door when the player closes a door while they
   are elsewhere, which was added so players could not blind-close doors. The
   result is that their position becomes **known by construction** instead of
   inferred from breathing.
3. **Fixed rotation** — bed → closet → right door → left door → bed, ordered to
   minimise the window in which a door-camper can kill during a bed check.

## What our dump says

Verified against `~/fnaf-apks/fnaf4/events/03-04-level.txt`, dumped 2026-09-19
from the handset's own APK at `K=29` (see Plan 26 for how `K` was recovered).
Group numbers are that file's.

### The forcing trick is real, and the dump is more precise than the video

`SOURCE` **group 341** — closing the left door while Bonnie is not yet at the
door sets his position directly:

```
IF Bonnie AV5 = 1  AND  left door shut = 1  AND  in closet AV5 = 0
DO Bonnie -> SetPosition (-> left hall near)
```

`SOURCE` **group 342** — holding it then pushes him back:

```
IF Every 3000 ms  AND  Bonnie AV5 = 2  AND  left door shut = 1
   AND  Bonnie IsOverlapping left hall near
DO Bonnie -> SetPosition (-> living room left);  Bonnie AV1 = 0
```

So the mechanic is confirmed, and **the push-back fires on a 3000 ms timer**,
not the ~5 s hold the video recommends. The video's number is conservative by
about 2 s per door visit — material, because its Nightmare-mode rotation runs
2–3 s from death.

`SOURCE` **group 502** — the same close teleports Fredbear to the *opposite*
hallway (`living room right`), matching the claim.

### Listening is a movement freeze, not just an observation

The dump shows something the video treats only implicitly. Bonnie and Chica's
movement rolls are gated on `listening mode`:

`SOURCE` **groups 284–285**

```
Every 5000 ms: Random(20)+1 <= Bonnie AI, AND listening mode <> 1,
               AND in closet AV5 <> 2, AND left door shut = 0  -> Bonnie advances
Every 5000 ms: Random(20)+1 <= Chica AI, AND listening mode <> 2,
               AND in closet AV5 <> 2, AND right door shut = 0 -> Chica advances
```

`SOURCE` **groups 288–290** set the mover's flag to 0 outright while
`listening mode` is 1 (left) or 2 (right).

Two consequences for a machine player: **holding a door shut suspends that
side's movement entirely**, and **standing at a door listening also suspends
it**. Both are position-independent, so both are available to an open-loop
schedule that never hears anything.

### Freddy's meter is exactly specified

`SOURCE` **group 397** — every 4000 ms, while not viewing the bed, add
`Freddy AI` to `Freddy counter`. `SOURCE` **group 401** — while viewing the bed,
subtract 1 every 50 ms, i.e. **drains at 20 units/second**. `SOURCE` **group
399** clamps at 0. A challenge variant (group 398) adds 5 every 2000 ms.

The video says the bed flashlight drains the meter "pretty fast"; the dump gives
the rate, which is what a schedule actually needs.

### Movement cadences

`SOURCE` Bonnie and Chica roll every **5000 ms**; Fredbear every **3000 ms**
while `shadow = 0` and every **2000 ms** once `shadow >= 1` (groups 286–287).
"Nightmare" is not a separate actor — it is the same `Fredbear` object and the
same `Fredbear AI` counter on the faster timer.

### Fredbear's room entry is a timed coin flip

`SOURCE` **groups ~3865 / ~3877** — every **20000 ms**, on `Random(2) = 1`,
Fredbear decrements an alterable and teleports to either `in closet` or
`on bed`. This confirms the video's "he can teleport into your room, it's RNG"
and gives the cadence and the 50/50.

## What is *not* verified

- `UNKNOWN(not-located)` The wait-to-kill timers the video relies on — 20 s for
  Bonnie/Chica at a door, 15 s for Fredbear, 10 s for Nightmare. The 20000 ms
  timers found in the dump are Fredbear's room-entry coin flip, **not** a
  kill delay. These remain `[C]` and must be located before any route encodes
  them. Treat the video's numbers as unconfirmed.
- `UNKNOWN(not-mapped)` The `follow` alterable is the player-position state
  machine (`= 21` is left-door-shut, `= 43` is bed). The full map of its values
  has not been built, and a route needs it.
- `[C]` Foxy's four closet stages, and that a longer door hold pushes him back
  further, are not yet traced in the dump.
- `[C]` The claim that checking the bed while a door-camper waits is an instant
  kill, rather than merely losing the 20 s.

## Conclusion for this project

**FNaF 4's audio dependency is a design intent, not a hard constraint.** The
game ships an anti-cheat that converts an unobservable state into a forced,
known one, and two of its movement gates (door shut, listening) suspend movement
without any observation at all.

That is unusually well matched to what already wins on this project's hardware:
open-loop schedules anchored to the game's own roll grid, supervised by a belief
gate. A FNaF 4 route would not need to hear the game — it would need to hold a
cadence against a 5000 ms roll grid and a 4000 ms meter tick, which is the same
problem shape as Minus Toys.

**Recommended change to Plan 26:** FNaF 4 should no longer be sequenced last
*because of audio*. Its real costs are the unmapped `follow` state machine and
the unverified kill timers — both cheap to close from the dump we now hold. The
ordering should be decided on prior-art novelty and control-surface cost, not on
the audio objection, which this note retires.

## Provenance

The video's transcript was retrieved with `yt-dlp` auto-captions and read for
claims only; nothing from it is reproduced here. Every `SOURCE` line above was
read out of our own event dump, not taken from the video. Where the two differ
(the 3000 ms push-back vs. the recommended ~5 s hold), the dump is treated as
authoritative per [`dump-is-ground-truth`](README.md).
