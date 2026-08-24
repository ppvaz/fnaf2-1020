# Android release-7 source status

This is the canonical accuracy ledger for the project. The target is Pedro's
modern Android FNaF 2 release-7 build: Fusion build 296, project revision dated
August 2025. Community PC mechanics and strategies are useful leads, but a rule
enters the Android simulator only when the Android event sheet, an Android
experiment, or an explicitly labeled approximation supports it.

## The ledger is enforced by `tools/sourcetest.mjs` (2026-08-20)

A rule entering this ledger used to be an assertion about the engine that
nothing checked. The engine's other checks are population statistics —
`simtest` sweeps seeds, `bbtest` says the Minus 7 bot survives 200/200 — and
they pass or fail on aggregate survival, so a corrupted mechanism hides behind
a healthy outcome.

That gap is measured, not assumed. Ten sourced values were corrupted one at a
time and both suites run against each:

| | mutations caught |
| --- | ---: |
| `sourcetest` | **10 / 10** |
| `simtest` + `bbtest 200 --assert` | 2 / 10 |

The eight the old suite missed include `FOXY_AI` 17→15, `VENT_MASK_TICKS` 5→4,
`GF_HALL_KILL_FRAMES` 100→200, the night-7 mask fuse 45→90, Balloon Boy's route
losing a hop, and both input gates being deleted outright. Each of those is a
load-bearing sourced rule, and every one of them passed the whole engine suite.

`sourcetest` asserts the mechanisms directly against a hand-driven `Sim`, one
case per group citation, and runs first in `node tools/test.mjs --engine`. A
failure names the group rather than the symptom. **When a row in this ledger
changes, add or update its case there** — otherwise the row is documentation,
not a constraint.

## 2026-08-20: handle-scramble correction pass

The APK's runtime XORs every object handle with 28 at load
(`COI.loadHeader`); events address objects post-XOR. Every dump before
2026-08-20 therefore carried bijectively swapped object names — including
every Toy↔Withered pair — while all numeric constants (they live in event
parameters, not the item table) were unaffected. The dump has been
regenerated with true names; see `ANDROID-CAMERA-STALL.md` for the proof
chain.

Consequences for this ledger:

- **Corrected and re-verified:** the camera-light stall (400 frames from
  `stun time`, groups 450-457) is live; the look-hold (groups 344-348, 357)
  covers the Withereds and monitor-up Mangle, persists monitor-down via the
  parked marker, and Toys are ordered by Show Stage co-occupancy instead.
- **Name glosses now resolved:** `Multiple Touch`→`viewing`,
  `white button`→`lit?`, `old freddy` marker→`your view`,
  `chicalookatyou`→`office occupied`, `danger 2`→`being attacked by`,
  `monitorFrame`→`mask` (confirming the earlier inference), markers
  120/121/122/123→`hall stage 1`/`hall stage 2`/`in office`/`got you box`,
  `new bonnie` light latch→`viewing hall light`, `old chica` office
  latch→`in danger`, battery counter `cam 9`→`battery life`,
  fuse chain `stun time`→`mute call` is really `time allowed`→`time left`.
- **Re-derived and re-verified same day (2026-08-20, second pass):** the full
  route graph was re-extracted from the true-name dump (regenerated
  `route-graph.txt`) and the `STALLED` table rebuilt from it. Every start
  room, vent assignment, and the 4-7-10 flash cut-set match the real game
  and the corrected source: Withereds + W. Foxy start CAM 08 Parts/Service,
  Toys CAM 09 Show Stage, Mangle CAM 12, BB CAM 10, Puppet CAM 11; internal
  camera ids equal display CAM labels 1:1 (the old fitted 8↔9/4↔7/2↔1
  bijection is retired). Confirmed swaps now in the engine: the inverted
  monitor-DOWN final (plus the `right light` gate) is **Toy Bonnie's**; the
  1000-100*night opening cooldown and 500 ms office-cue roll are **Toy
  Bonnie's**; the six-tick opening arm is **Toy Chica's**; the `office
  occupied` mutex / cams-up streak four are **W. Freddy, W. Bonnie,
  W. Chica, Toy Freddy**; the hall-light-gated edges belong to WF/WB/TF/TC/
  Mangle/W.Foxy while **W. Chica and Toy Bonnie are exempt**. Independent
  validation: the Technical-FNaF wiki's "Minus 2 stalls Toy Bonnie and
  Withered Freddy at CAM 03" matches the corrected routes (TB's first hop
  and WF's second hop are CAM 03); the old table had neither. All engine
  suites pass on the rebuilt model (bbtest 200/200, androidstalltest sourced
  200/200 + 100/100, simtest scenarios re-bound and green).
- **Subsystem re-reads completed in the 2026-08-20 backlog sweep:** Foxy,
  BB, Puppet/music box, Paper Pals, forcedown queue, vent lights, and most
  of Golden Freddy — findings recorded in the extraction backlog below.
  The `ANDROID-OFFICE-ENDGAME.md` prose rewrite is done (item 19); still
  open: the hall-GF kill-threshold group, same-frame input ordering (item 7)
  and the display-map artwork closure (item 23).
- **The dump is reproducible on this machine (2026-08-20).** The extracted
  `application.ccn` plus a CTFAK build carrying our own `EventTextDumper`
  regenerate the true-name event sheet locally in about six seconds; see
  [`SOURCE-DUMP-GUIDE.md`](SOURCE-DUMP-GUIDE.md) and `tools/dump/`. Group
  numbering matches the citations already in this ledger. Item 7 (same-frame
  ordering) is therefore answerable here; item 23 still needs image export,
  which this logic-only dumper does not do.

## 2026-08-20: coverage, measured

Every pass before this one was a targeted lookup: it answered its own question
and said nothing about what had not been read. `tools/dump/coverage.py` now
classifies all 1332 office-frame groups by what they can change and diffs that
against every group number cited in the repo. Current state: **72% of the
state-writing groups and 86% of the input groups are cited**, with 87 unread
groups that could in principle move something, clustered into 19 blocks. The
full map is [`ANDROID-GROUP-MAP.md`](ANDROID-GROUP-MAP.md); regenerate it after
each sourcing pass.

Running down the two largest blocks immediately paid for the exercise:

- **`g875-881` — `hall movement`.** Any hall-routed character overlapping it
  sets it to 300 frames and g881 drains it. g779 requires it at zero, so for
  five seconds after anyone transits the hallway Golden Freddy cannot
  accumulate exposure there at all. Flagged as unmodelled during the Golden
  Freddy pass; now implemented.
- **`g458-477` — inert.** A per-character drain of the `C` counter. Nothing
  anywhere gates on `C` except the Puppet's branch selector (g406/407), so it
  is bookkeeping, not a mechanic.

That is the honest shape of the risk: not zero, bounded, and now enumerated.

## 2026-08-20: same-frame input order, and the forcedown the engine never had

Group order *is* the input order. Every group that reads a touch and writes
player state, in sequence:

| Groups | What |
| --- | --- |
| 16-27 | camera selection (`viewing`) |
| 75-89 | the flashlight (`lit?`) — hall needs `mask` = 0, `in danger` = 0 and no BB at 123 |
| 254-258 | the monitor button (`flip panel button` → `mmonitorUp`) |
| **262** | **forcedown executes on the monitor**: lowers it and zeroes `viewing` |
| 267-270 | the mask (`mask` → `mmaskOn`) |
| **274** | **forcedown executes on the mask**: takes it off |
| 301-320 | the vent lights |
| 612 | the forcedown flag is cleared |
| 614-619 / 624 / 718-721 | …and re-set, so it is always spent one frame later |

The ordering has a real consequence: a monitor press and a mask press made in
the same frame as a forcedown are both undone — the monitor before the mask
press is even read, the mask immediately after.

**`drop everything` was decoded in the earlier sweep but never implemented.**
It is set every 10 s while W. Freddy, W. Bonnie, W. Chica or Toy Freddy waits
at marker 122 **with the cameras up** (g718-721), on any attack start (g624),
and by the Puppet reaching 123 (g574). So the game slams the monitor down and
rips the mask off while one of the four is queued at the threshold. Minus 7
never sees it — the four are stun-locked and never reach 122 — which is why
its absence went unnoticed, but it is a live mechanic for every other line of
play and for recovery after a lapse.

## 2026-08-20: the office encounter, end to end

The shared encounter is five counters and one strict priority list.

| Group | Rule |
| --- | --- |
| 528/529 | `time allowed` = 50 frames on night 6, 45 on night 7+ |
| 530 | `in danger` goes above zero → `time left` = `time allowed`, `got you stage` = 1 |
| 531 | `time left` counts down per frame |
| 533 | mask reaches fully-on while stage is 1 → **stage 0, defended** |
| 532 | `time left` hits zero while stage is 1 → **stage 2, failed** |
| 534-536 | the `blackout` object plays the ~300-frame visible sequence either way |
| 537 | that sequence ending raises `check and move` |
| 538-555 | the resolution table: first match wins and zeroes `check and move` |

**One occupant resolves per encounter.** That is the queue pacing the ledger
was missing: with three of the four stacked at marker 122, defending clears
exactly one of them and the rest stay queued for the next encounter. Which one
is decided by group index, not by who triggered the encounter:

- defended (stage 0): **W. Freddy → W. Bonnie → W. Chica → Toy Freddy → Toy Bonnie → Toy Chica**
- failed (stage 2): **W. Freddy → W. Bonnie → W. Chica → Toy Bonnie → Toy Chica → Toy Freddy**

Toy Freddy swaps ends between the two halves — he is resolved before the two
toys on a success and after them on a failure. Defended occupants go to the
rooms the engine already used (WF CAM 08, WB CAM 07, WC CAM 04, TF CAM 09,
TB CAM 03, TC CAM 07) with `B = Random(500)/night`.

Mangle is **not in the table at all**, which answers the other half of the
question: she never joins the shared queue, because her 122 edge is the
private raise pair g402/403.

The engine resolved whichever unit started the encounter. It now applies the
sourced priority, so a queue drains in the real order.

## 2026-08-20: Golden Freddy, both of him

The office figure (`yellowbear`) and the hallway one (`golden`) are separate
objects with separate rules, and both are now fully in the ledger:

| Group | Rule |
| --- | --- |
| 336 | office spawn: 5 s interval, `viewing > 0` **and the raise finished**, `Random(20) < Golden Freddy AI`, none already present |
| 830 / 804 | that AI is capped at **10** (the others cap at 15), and is zero below night 6 — so 10/20 is exactly a coin flip |
| 776 | mask fully on → he dims and stops counting |
| 777 / 778 | starting a monitor raise, or the hall light latch, with him present → `got you box` |
| 781 | hallway: every one-second event **with the hall light off**, `golden` v1 = `Random(10)`; v1 = 1 is the frame that draws him (g203/204) |
| 779 | exposure +1 per frame while the light is on him and no one is at `hall stage 1`/`hall stage 2` |
| 780 / 865 | above 100 → kill; not present → counter zeroed |

Two corrections fall out. The hallway roll is **1 in 10**, not 1 in 11, and it
is **re-rolled every second rather than latched** — holding the hall light
freezes whatever is there, which is why he seems to "stay" while you look.
And the `[CALIBRATED]` "unfair raise" window is gone: g336 requires the raise
to have *finished*, so there is no 0.3 s bug to model. g779's empty-hall test
names exactly the characters routed through markers 120/121, which the engine
already calls `blindA`/`blindB`, so that condition is now exact rather than an
approximation over CAM 07.

## 2026-08-20: no mask storage — the counter resets on every re-mask

`v12` is incremented once per one-second event while `mask` = 2 (g907) for Toy
Chica, Mangle **and** Balloon Boy, and g294 forces BB back to CAM 10 at
`v12 >= 5`. The reset is g293, whose second condition is the system "only one
action when event loops" — so entering the fully-on mask state zeroes the
counter once, every time.

Two consequences:

- **No storage.** The community "mask storage" cycle (chudbud / Regi 2025,
  `MINUS-7-STRATEGY.md` §8) banks unused mask time across separate flicks. For
  the three vent occupants this build does not: the five ticks have to happen
  inside one continuous hold. The engine's cumulative `MASK_LEAVE_FRAMES` path
  for BB was the last surviving piece of that abstraction and is now replaced
  by the same per-tick counter Toy Chica and Mangle already used.
- **The hold is shorter than five seconds.** Five ticks span four boundaries,
  so a hold that goes fully on just before a whole second clears him in a
  little over **4.0 s**; the worst phase is just under 5.0 s. Any defence
  budget built on "five seconds of mask" is up to a second pessimistic.

## 2026-08-20: the mask kills every office light

`lit?` is set by g75 (hall, `viewing = 0`) and g84 (its touch twin), and both
require `mask` = 0; the vent-light clicks (g302/304) carry the same condition.
The camera light (g76/77/85/86) has no mask condition because the mask and a
raised monitor are mutually exclusive anyway. So on this build **a masked
player can do nothing but take the mask off** — there is no holding the light
through a mask.

That contradicts the PC Phase B technique quoted in `MINUS-7-STRATEGY.md` §6
("keep CTRL held: the flashlight costs no power while the mask is on"). The
engine had modelled the *power* half of that claim and not the effect; it now
gates `hallLightOn`, `lightLogical` and `anyOfficeLightHeld` on the mask being
off. Consequence for any Balloon Boy defence: the five-second mask window is a
five-second hole in Foxy cover, which is exactly why Markiplier's variant
evicts Foxy before letting BB arrive (§9.3).

## 2026-08-24: `mask = 0` means the animation, not the press

The section above gated the lights on "the mask being off". The dump is
stricter than that, and the difference retimes the cycle.

`mask` is a four-state animation counter, not a flag: **0** off, **1** raising
(g267/g270 on the press), **2** fully on (g9, at mmaskOn frame 12), **3**
lowering (g274). It returns to 0 only at g11, behind g10's "mmaskOff frame
>= 14" — so *the post-mask flash lockout is the mask-off animation itself*
(`MASK_ANIM_OFF`, 15 frames). Taking the mask off does not restore the light;
finishing the animation does. This is `VENT-CAMP-STRATEGY.md` §4 gap 6, and its
own parenthetical called the consequence correctly: it "matters for the
mask-off -> Foxy-flash beat the cycle depends on."

It does, because Foxy's reset runs through the same flag: **g489** (`viewing`
= 0, `battery life` > 0, `lit?` = 1 -> `viewing hall light` = 1) feeds
**g745** (Foxy at marker 120 + that latch -> D = 0, exposure += 1) and **g855**
(the B = 50 hall pin). A hall flash inside the lockout resets nothing at all.

Three more conditions on the same groups, all previously unmodelled:

- **`in danger` = 0** gates every light — g75 (hall), g76/g77 (camera) — and
  g83/g88 mean the flashlight hitbox does not even register the touch. The
  latch is raised by g443-447/g490 (an office encounter starting) and cleared
  by the endpoint resolutions g538-555, so it is exactly the engine's blackout.
- **The vent lights are re-tested every frame.** g299 clears both on a 200 ms
  timer and only g301/g303/g320 re-assert them, each requiring `mask` = 0 and
  `viewing` = 0. A vent light already held therefore goes out the moment the
  mask starts going on — so Toy Bonnie's g428 stall reads the light, not the
  finger.
- **The mask press needs `being attacked by` = 0** (g267/g270): once a
  marker-123 occupant has started its 40-frame attack, the mask no longer goes
  on. g560-562 set that counter per unit.

**Measured consequence.** Only the first of the four costs anything: with the
lockout implemented, the shipped Minus 7 cycle's hall flash (3 frames after the
mask-off tap) never lights, and `bbtest` falls 200/200 -> 0/200, every loss to
Foxy with D at 14. The other three gates are free — the reference bot is
unchanged by them.

The cycle is recoverable, but only by respecting the rule in two places:

1. the cycle's `hallDelay` must be >= `MASK_ANIM_OFF` (it was 3), and
2. `bbtest`'s `recover()` must wait out the mask-off animation before raising.
   It holds the light continuously through the attack, so those frames are the
   pass's Foxy reset; raising early spends them with the monitor already up,
   where the same held light is the *camera* light and D is never zeroed.

With both, `bbtest` is 200/200 again. The retimed cycle is materially tighter
than the old one (min box ~1%, min power 1528 vs 2976), so the published
per-step windows in `MINUS-7-STRATEGY.md` and the trainer's `CYCLE_SCRIPT` are
re-derived from a `cyclesearch` pass rather than by moving one knob.

`sourcetest` covers all four gates (g10/g11, g489/g745, g75/g76/g77, g299/g303/
g320, g267/g270): 118 -> 130 cases.

## 2026-08-20: Balloon Boy approach pipeline, re-sourced

Prompted by a strategy claim that keeping the cameras down across the 5 s
boundary *prevents* BB's last move. The event sheet says it defers it:

| Group | Rule |
| --- | --- |
| 342 | Every 5000 ms, `Random(20) < Balloon Boy AI` → `A = 1`. **No monitor, camera or light condition** — the roll is never blocked |
| 359 | `A = 1` and `B = 0` → `A = 2`, `C = 10` (look-hold row already in `ANDROID-CAMERA-STALL.md`: BB has no camera exclusion) |
| 413-416, 418 | `A = 2` + current marker → hop, `A = 0`. Route is **CAM 10 → 07 → 03 → 01 → 05**, no monitor gate anywhere |
| 417 | `A = 2` + on `cam 5` + `viewing > 0` + monitor-up complete → `in office` (122) |
| 290/291 | at 122, raise seen → `v6 = 1`; raise completes → `got you box` (123) |
| 292/294 | at 122 + mask fully on: 10%/s roll, or `v12 >= 5` consecutive ticks → back to `cam 10` |
| 907/293 | `v12` counts fully-masked seconds for Toy Chica, Mangle and BB; re-entering the mask state resets it |

**He is five moves away, not four, and the first one is silent.** Only
g414-416 write his vocal selector (`cam 01` v6 = `Random(3)+1`, played and
re-rolled by g608-611 from samples 21/24/23); g413 (CAM 10 → 07) writes
nothing, and g417 plays only sample 17, the movement thud *every* character's
hop shares (g691-694). So the community's "three laughs then he is in the vent
camera" counts his 2nd, 3rd and 4th moves, and his 5th is the one that needs
your cameras up. The engine previously modelled four moves, making him arrive
sooner than the real game. The vocal is picked at random per move — it does not
depend on which camera he is on. His in-office taunt is a **different** sample
(16), played on every input he blocks while at 123: flashlight key (g78),
flashlight hitbox (g88), the vent-light clicks (g302/304), and g311.

`A = 2` is a **latch, not a moment**: only group 417 gates on the monitor, and
nothing clears the latch while the cameras are down, so a cameras-down 5 s
boundary postpones the hop into the vent opening until the next completed
monitor raise — which the music box forces you to perform. This confirms the
engine's `bb.pending` model (`src/engine.js`) rather than the "cams down = no
move" reading in the community write-ups; see `MINUS-7-STRATEGY.md` §6.

## 2026-08-24: every sound in the Office frame, and who can claim it

Gate 0 of the [on-device audio-cue controller plan](../../plans/08-audio-cue-controller.md)
asks one question: does any cue uniquely announce a state edge? Frame 3 has 40
distinct sample handles across 161 play actions. `readdump.py sounds 3` indexes
them; the answer for the edges the controller cares about is mostly *no*, and
that removes a planned action from scope.

### Sounds are played through a register bank, not directly

Almost no group calls "play sample" itself. They write a value into an
alterable on the `cam 01` object, and a small bank of dispatch groups turns
that value into a sound:

| Register | Dispatch | Samples | Written by |
| --- | --- | --- | --- |
| `cam 01` v6 | g608-611 | 21, 24, 23 (v6=4 re-rolls) | BB hops 2-4 (g414-416) |
| `cam 01` v21 | g691-694 | 17, on any value 1-4 | 18 groups, see below |
| `cam 01` v5 | g704-708 | 25-29 | 8 characters at marker 149 `hear footsteps` (g695-702) |
| `cam 01` v12 | g709-711 | 30-32 | Toy Foxy only (g703, g741) |

Reading only the play actions hides this indirection completely, and it is the
reason a naive pass concludes that BB's departure is silent. It is not.

### Sample 17 is the movement thud, and 18 transitions fire it

`writes 3 "cam 01" 21` lists every writer. Excluding the four dispatch groups
that reset the register:

| Group | Edge |
| --- | --- |
| 292 | **BB mask-clear, 10%/s roll at marker 122** |
| 294 | **BB mask-clear, forced on the 5th masked tick** |
| 387 | W. Chica hop to CAM 2 |
| 400 / 401 | Toy Foxy mask-clear, roll and forced |
| 416 | BB hop 4, CAM 01 → CAM 05 |
| 417 | BB hop 5, CAM 05 → office, the monitor-gated edge |
| 439 / 440 | Toy Chica mask-clear, roll and forced |
| 685-690 | W. Chica, W. Bonnie, Toy Bonnie, W. Chica, Toy Foxy, Puppet arriving at CAM 5/6 |
| 739 | Toy Foxy at 123, 5%/s |
| 748 / 749 | W. Bonnie and W. Chica at 123 while masked, 10%/s |

Seven characters share one sample. Worse for the plan's highest-payoff idea:
g292/294 (BB leaving) fire under the *same* `mask fully on` condition as
g400/401, g439/440, g748/749. While you sit masked waiting for BB to go, four
other characters can produce a byte-identical sound.

### The Balloon Boy pipeline, sound by sound

| Group | Hop | Sound |
| --- | --- | --- |
| 413 | CAM 10 → 07 | **silent** |
| 414 | CAM 07 → 03 | vocal 21/24/23, channel 14 volume 25 |
| 415 | CAM 03 → 01 | vocal 21/24/23, channel 14 volume 25 |
| 416 | CAM 01 → 05 | vocal 21/24/23 **and** thud 17 |
| 417 | CAM 05 → office (122) | thud 17 |
| 607 | on arrival at 122, once | sample 21 |
| 292 / 294 | leaves 122 | thud 17 |

Two corrections to the 2026-08-20 entry above. g416 writes *both* registers, so
the third counted laugh arrives with a thud under it, and arrival at the
opening is a **pair** — thud 17 from g417 plus sample 21 from g607 — not a
single sound.

### Loudness is state, and it is why the vocals are hard to hear

Every vocal hop sets channel 14 to volume 25, so amplitude cannot separate hop 2
from hop 3 from hop 4. It does something more useful. The channel's start-of-
frame default is **50** (g60), the hops drop it to **25**, and one group raises
it to **60**:

| Group | Condition | Channel 14 volume |
| --- | --- | ---: |
| 60 | start of frame | 50 |
| 414-416 | BB hops 2-4 along the route | **25** |
| 906 | BB at marker 126 `your view`, monitor up, every 5 s, `Random(20)=1` | **60** |

g906 is worth its own line: when Balloon Boy is on **the camera you are
currently watching**, he has a 5%-per-second chance of vocalising, and the game
plays it at more than twice the volume of an approach hop. So the same three
samples carry two different meanings, and level is what separates them —
quiet means "he moved somewhere on his route", loud means "he is on the feed in
front of you".

That has a direct cost. Approach vocals — the ones a controller actually needs
— are played at **half the channel default**, which is why a 285-second
device recording over several pilot runs produced no vocal detection above
threshold while the shared thud (played by every character's hop) reached 0.606.
Best scores over that recording: sample 17 **0.606**, sample 21 0.486, sample 23
0.437, sample 24 0.347, against per-sample p99 background of 0.476/0.367/0.335/
0.249. The cue is quiet by design, not missing by accident.

It also indicts the detector's own design. `tools/cue/features.py` removes each
frame's mean precisely to be level-invariant, which is right for robustness to
capture gain — and which throws away exactly the quantity that separates
`your view` from a route hop. A detector that wants both must carry a separately
calibrated level feature beside the shape score.

### Uniqueness verdict

| Sample | Groups | Unique to one edge? |
| --- | --- | --- |
| 23 | 610 | **Yes** — the only sole-trigger BB vocal |
| 21 | 607, 608 | No, but both triggers are BB |
| 24 | 609, 743, 814 | No — also Toy Foxy at 123 and BB at 123 |
| 17 | 691-694 | No — 18 edges, 7 characters |
| 25-29 | 704-708 | No — `Random(5)+1` shared by 8 characters incl. BB |
| 30-32 | 709-711 | Toy Foxy only |

BB's own footstep sound at marker 149 is `Random(5)+1` from the same bank the
other seven draw from (g702 is identical to g695-701), so there is no unique
BB vent cue either. Toy Foxy is the only character with a private bank.

### What this costs the plan — and what it does not

The sample is shared. Whether that makes it *ambiguous* is a question about the
run, not about the game, and the answer differs.

**In the general case, early unmasking is out.** An unmask rule keyed on sample
17 would fire on Toy Chica's or Mangle's departure while BB is still at 122,
which is the exact error plan 08 calls unacceptable.

**Under Minus 7 it is not ambiguous at all.** Cross the thud's sources against
the strategy's roster and the overlap vanishes:

| Thud source | Groups | Minus 7 |
| --- | --- | --- |
| Balloon Boy | 292, 294, 416, 417 | **not stalled — the whole difficulty of the strategy** |
| W. Chica | 387, 688, 749 | stun-locked all night |
| Toy Chica | 439, 440, 685 | stun-locked all night |
| Mangle | 400, 401, 689, 739 | stun-locked all night |
| W. Bonnie | 686, 748 | stun-locked all night |
| Toy Bonnie | 687 | stun-locked all night |
| The Puppet | 690 | only leaves CAM 11 if the music box empties |

[`MINUS-7-STRATEGY.md`](../strategy/MINUS-7-STRATEGY.md) keeps **seven of the
ten permanently stun-locked**, leaving W. Foxy, Golden Freddy and Balloon Boy —
and neither W. Foxy nor Golden Freddy writes the thud register at all. Every
other writer is either one of those seven or the Puppet, whom a wound box keeps
in place.

So while the stalls are current and the box is wound, **a vent bang is Balloon
Boy**, and it is the *loud* cue: the thud plays on channel 15 at volume 50,
where his vocals play on channel 14 at 25. This is exactly the case plan 08's
controller semantics anticipated — "use a shared thud only as corroboration of a
transition that controller state already makes possible" — and the controller is
the thing maintaining the stalls, so it can assert that state rather than assume
it. A lapsed stall breaks the uniqueness, which is precisely why it has to be
asserted per-decision and not once per night.

The approach cues survive, with a condition. Samples 21/24/23 are jointly
diagnostic of a BB hop **given controller state**, because every non-BB
trigger for 21 and 24 requires someone to be at 122/123 — states the
controller already tracks. That is corroboration, not identification, and it
is what the surviving "vocal arms a lit CAM-05 visual check" architecture
already assumed.

### The simulator has been reading a field the phone cannot hear

`src/engine.js` emits `vent-bang` with a `who`, and two controllers consume it:
`tools/minus6test.mjs` counts threats with `e.data?.who !== 'bb'`, and
`tools/hidpilottest.mjs --vocal-cam5` resets its vocal count on
`who === 'bb' && leaving`. The source says every one of those events is sample
17. No audio detector can recover `who`, so both controllers are using a sensor
that does not exist.

This does not rescue or sink the §4 rejection of the counted-vocal controller —
that policy was already rejected — but it means the 3,000/3,000 perfect-vocal
upper bound is unattainable for a second, independent reason, and any future
policy must derive identity from controller state rather than from the cue.
The events now carry a `sample` field so a controller can be held to what the
phone can actually hear.

## Labels

- **Implemented** — Android source rule is represented and regression-tested.
- **Confirmed / pending implementation** — event rule is located, but the engine
  does not reproduce its full state machine yet.
- **Partially decoded** — relevant events are located but object identity, ordering,
  or counter meaning is incomplete.
- **Model-only** — useful approximation; not source evidence.

## Implemented Android mechanics

| Mechanic | Evidence / implementation status |
| --- | --- |
| Night clock and movement cadence | Global 1000 ms ticker, 70 ticks/hour, movement opportunity every 5000 ms |
| Movement RNG and the AI table | `Random(20)+1 <= AI`, with the Puppet's bare `<=` variant (g494-497). The per-night/per-hour levels are implemented 2026-08-23 from g673-684 (table), g787 (Custom Night dials), g804 (Golden Freddy below night 6), g815-821 (Puppet) and the caps g829/g830/g856-863. Rebuild the table from the dump with `tools/dump/aimap.py` |
| Main route graph | Re-extracted 2026-08-20 from the true-name dump, including the off-camera `hall stage 1`/`hall stage 2` transit markers (120/121) |
| Per-edge monitor gates | Final approaches use cams-up conditions; Toy Bonnie's polarity is inverted (monitor DOWN + `right light`); Toy Chica's final hop is unconditioned |
| Office-light movement latch | Physical light state is immediate; the `viewing hall light` latch persists to the next one-second event and guards only specific route edges (W. Chica and Toy Bonnie exempt) |
| Shared office-light battery behavior | Only `lit?` drains `battery life` (g284, backlog item 16) — vent lights are free; night 5+ capacity is 3000 frames. (An earlier version of this row had vent lights sharing the drain; corrected 2026-08-20 second pass.) The vent lights still share the engine's movement-latch model [MODEL] |
| Camera and hall light separation | A short physical tap no longer produces a fake one-second Foxy/GF exposure |
| UI state identity | The camera selection/up counter is literally named `viewing`, and the four-state Freddy-mask object is literally named `mask` — the pre-XOR inferences were correct and are now nominal |
| Shared office defense sequence | Marker-122 encounter starts a 45-frame Night-7 fuse and resolves after 300 frames; only a fully-on mask before fuse expiry defends it |
| Character-specific threshold branches | The streak four (Withereds + Toy Freddy), Toy Bonnie, and Toy Chica use separate sourced marker-122 rules instead of a generic instant mask repel |
| Mangle office endgame | Marker 122 clears after five continuous fully-masked scheduler ticks, while completing the next monitor raise sends her to marker 123 |
| Marker-123 attacks | Per-family Android attack triggers and the shared 40-frame `danger 2` transition are represented |
| Toy Bonnie endgame + repel destinations | Implemented 2026-08-20 (second pass): his B is the unified opening timer / flash stun / repel cooldown; endpoint resolution repels land on the sourced rooms (WB CAM 07, WC CAM 04, TB CAM 03, TC CAM 07) with B = Random(500)/night, and marker-123 leaves write B = 500 |
| Foxy subsystem | Implemented 2026-08-20 (second pass) from backlog item 12: `<=` roll vs AI 17, D +1/s (+1/s more masked), zeroed all night 1 and until 2AM night 2, per-frame exposure vs 100*night, B=50 hall pin gating eviction and the lock-on roll, 500+Random(500) return, GOT-YOU 10 s / instant monitor-down hall flash |
| Threshold mutex | `office occupied` (ex-`chicalookatyou`) serializes final entry for the four shared-streak attackers: W. Freddy, W. Bonnie, W. Chica, Toy Freddy |
| Monitor and mask animation durations | Derived from the Android animation bank and represented as asymmetric frame counts |

## Confirmed or located, but not fully implemented

| Priority | Mechanic | What remains |
| --- | --- | --- |
| P0 | ~~Office threshold/inside state machine~~ **Sourced 2026-08-20** | Marker-122/123 behaviour, the encounter fuse (g528-537), the resolution priority (g538-555) and the input/forcedown ordering are all cited. The `drop everything` forcedown is now implemented rather than only decoded |
| P0 | ~~Office queue pacing~~ **Sourced 2026-08-20** | g537 raises `check and move` when the 300-frame office sequence ends; g538-555 then run in group order and the first match zeroes it, so **exactly one occupant of 122 resolves per encounter**, chosen by group index rather than by who triggered it. Defended order (`got you stage` 0): WF, WB, WC, TF, TB, TC. Failed order (stage 2): WF, WB, WC, TB, TC, TF. Mangle never appears in the table — her 122 edge is g402/403 |
| P0 | ~~Toy Bonnie Android endgame~~ **Implemented 2026-08-20** | B-as-opening-timer unified with the flash-stun/cooldown field; repels land on CAM 03 with the sourced B cooldowns (see Implemented table) |
| P0 | ~~Foxy~~ **Implemented 2026-08-20** | All backlog-item-12 nuances are in the engine: night-1 / pre-2AM-night-2 dormancy, per-frame exposure vs 100*night, and the B=50 hall pin gating both eviction and his lock-on roll (see Implemented table) |
| P0 | ~~Golden Freddy~~ **Sourced 2026-08-20** | Office: g336 spawn (5 s interval, monitor fully up, `Random(20) < Golden Freddy AI`, none present), g830 caps that AI at 10 so 10/20 is exactly 1/2, g804 zeroes it below night 6, g776 mask clear, g777 kill on a raise, g778 kill on a hall flash. Hallway: g781 re-rolls `golden` v1 = Random(10) every second **while the hall light is off**, g779 accumulates exposure per frame with the hall otherwise empty, g780 kills above 100, g865 resets. The `[CALIBRATED]` unfair-raise window is deleted — no group backs it |
| P0 | ~~Mask counter semantics~~ **Sourced 2026-08-20** | Consecutive-tick counters for TC/Mangle/BB (g907 counts, g294 forces the leave at 5, g292 is the 10%/s early roll). The BB storage abstraction is **gone**: g293's condition is Fusion's "only one action when event loops", so the counter is zeroed on every entry into the fully-on mask state. There is no mask storage on this build |
| P0 | ~~Selected-camera movement gate~~ **Implemented 2026-08-20** | Post-XOR: the `your view` marker holds pending rolls for the three Withereds (344-348, no monitor condition — persists monitor-down via the parked marker) and monitor-up Mangle (357). Toys have Show Stage leave-order gates instead (350-356). Engine default `selectedCameraGate: true`. |
| P0 | ~~Dormant camera-light countdown~~ **Resolved 2026-08-20: live** | Groups 450-457 feed B from `stun time` = 400 (never written); the pre-XOR audit was reading the wrong counter. `STUN_FRAMES = 400` is Android-sourced, with per-group camera exclusions (8/9/11) and the Paper-Pals `- night*50` variant. See [`ANDROID-CAMERA-STALL.md`](ANDROID-CAMERA-STALL.md). |
| P1 | Display-camera mapping | Replace the two route-fitted low-confidence room mappings with direct Android UI/object anchors. `mapLocation.Active` / `mapPortrait.Active` (g1167-1169) look like the anchor pair; the logic-only dumper cannot close the artwork half |
| P1 | ~~In-office auxiliary mover~~ **Resolved 2026-08-20** | The pre-XOR "`in office` object" is Balloon Boy himself (dump oi 102 = `balloon boy`); his 122/123 monitor-raise branch is BB's office behavior, not an extra mover |
| P1 | ~~Puppet~~ **Sourced 2026-08-20** | Post-box route is g404-411: CAM 11 → 10 → 07, then his own `decide path` value picks 1 → 03 → 01 or 2 → 04 → 02, both arriving at marker 122 (g574 turns that into the encounter). Five hops on the ordinary movement roll replace the old flat 5-20 s timer, so a dry box is slower to kill than the engine assumed. (The supposed CAM 11 flash-stall event, group 457, actually targets Paper Pals with `stun time - night*50`; the Puppet has no flash group.) |
| P1 | ~~Balloon Boy inside-office behavior~~ **Sourced 2026-08-20** | Roll g342, look-hold g359, hops g413-418 (g417 is the only monitor-gated edge), office entry g290-291, mask clears g292/294. Inside: g96 forces `lit?` to zero every frame, g301/303 stop the vent lights answering, g75/g85 exclude him while g77/g86 do not — so CAM 10 keeps its light — and **no group moves him out of 123**. He never attacks; the engine no longer kills on entry, it takes the lights away and lets Foxy finish |
| P2 | ~~Input event ordering~~ **Sourced 2026-08-20** | Group order is the answer: camera select (g16-27) → flashlight (g75-89) → monitor button (g254-258) → **forcedown on the monitor (g262)** → mask (g267-270) → **forcedown on the mask (g274)** → vent lights (g301-320). The forcedown flag is cleared at g612 and re-set at g624/g718-721, so it is always spent one frame after it is raised |
| P2 | ~~Sound cue frames~~ **Resolved 2026-08-24** | Every Office-frame sample mapped to its state edge through the `cam 01` register bank; see the section above. Gate 0 of the [on-device audio-cue controller plan](../../plans/08-audio-cue-controller.md) is closed, and its early-unmask action is removed from scope because sample 17 is shared by 18 edges across 7 characters |
| P2 | Auxiliary counters | The office encounter latch is literally named `in danger`; `Active 21` is really `decide path` (route-branch selector, used by W. Freddy g376-377, Mangle g396-397, and the Puppet's own v2 in g406/407). `Sockpuppet AI` is the Puppet's movement AI, read by the route above; `time of the night` gates the mid-night AI bumps (g676 night 2 at 1 AM, g684 night 6 at 2 AM) and **is implemented as of 2026-08-23** (see the Implemented table). Remaining: the leftover display/animation counters |

## Decompile extraction backlog — what unblocks each plan

The exhaustive list of sourced facts needed by the plan documents. Most were
extracted from the corrected (post-XOR) dump in the 2026-08-20 backlog sweep;
each resolved item records the finding. Remaining open items are marked OPEN.

**Cross-cutting (plans 02, 03, 06):**

1. ~~Camera look-hold semantics~~ — done (groups 344-360).
2. ~~Flash-stun duration, source counter, per-group camera immunities~~ —
   done (groups 450-457).
3. ~~True-identity route graph and per-edge gates~~ — done (route-graph.txt,
   `STALLED` rebuilt).
4. ~~Toy Bonnie marker-120→122→123 state machine~~ — decoded: final hop g428
   (monitor DOWN + right vent light off) parks him at 122 with his own
   B = 1000-100*night as the opening timer (drained ~1/frame by g367);
   g546: B=0 + monitor UP → marker 123. Overlay: g436 (masked, unengaged,
   every 500 ms, Random(2)=1) creates `Active 19`, whose existence sets the
   `in danger` encounter latch (g443); g437 masked+engaged 1-in-3/s repel to
   CAM 03; overlay animation completing also repels him (g441). At 123:
   danger on monitor-lowering (g568) or every 10 s cams-up (g722).
   Return immunity = the B cooldown written on every repel
   (Random(500)/night at 122 endpoints, 500 on a 123 leave).
   *Engine: fully implemented 2026-08-20 (second pass) — B is one unified
   counter (opening timer / flash stun / repel cooldown) and repels land on
   the sourced mid-route rooms.*
5. ~~Mask-leave semantics~~ — decoded: at 123 the streak four leave on a
   masked 10%/s roll (g747-750, engine matches). At 122 the five-continuous-
   masked-tick guaranteed leave belongs to Toy Chica, Mangle AND Balloon Boy
   (g294: BB v12>=5), each with a 10%/s early roll (g292). "Cumulative vs
   consecutive": source is consecutive (counters reset when the mask state is
   re-entered). BB storage abstraction remains engine-only [MODEL].
6. ~~Office queue / forcedown ordering~~ — decoded: `drop everything` is the
   forcedown flag; set every 10 s while a streak-four attacker waits at 122
   with cams up (g718-721), on any attack start (g624), by the Puppet's
   arrival at 123 (g574), and by the player's drop button; g262/g274 execute
   it on monitor and mask in the same tick, and g612 clears it. Exact
   same-frame order = group order (262 < 274 < 612 < 614-624 < 718-721).
7. OPEN — same-frame input/event ordering for monitor, mask, hall light and
   vent lights beyond the group-order anchors above (P2; only matters for
   frame-perfect coaching claims).

**Minus 3 / Minus Toys (plan 02, `MINUS-3-STRATEGY.md` §5):**

8. ~~Double-camera glitch~~ — no such state exists in the Android data model:
   one `viewing` counter, one marker, set atomically per touch (group 40);
   mask/monitor transitions zero `viewing` without moving the marker but the
   light is input-blocked while masked (g75/76 require mask v0=0). The PC
   glitch is an input-layer artifact that does not transfer to this build's
   event data; glitch-dependent Minus Toys steps need on-device confirmation
   before being assumed possible on Android.
9. ~~Night-7 variants of the flash immunities~~ — none: groups 450-457 carry
   no night conditions; the 8/9/11 exclusions are unconditional.
10. ~~CAM 03 stalling Toy Bonnie + Withered Freddy~~ — resolved: both routes
    pass CAM 03 in the corrected graph, matching the wiki's Minus 2 claim.
11. Golden Freddy — partially decoded: office GF (`yellowbear`) spawns on the
    5 s clock while cams are up (Random(20) < `Golden Freddy AI`, no existing
    GF, monitor-raise finished, g336); GF AI is seeded fractionally by night
    (1/1000 nights 2-3, 1/100 nights 4-5, 1/10 then 3-at-2AM night 6,
    custom-night value night 7); mask fully on flags him away with an alpha
    fade (g776, g1040-41: +3.761/frame to 255); raising the monitor OR
    holding the office hall light with him present is lethal (g777/g778).
    Hall GF: exposure golden.v0 += 1/frame only while the hall light is held
    on an EMPTY hall (g779). OPEN: the exact kill threshold group for
    golden.v0 and the calibrated 18-frame raise window replacement.

**Right Vent Camp (plan 03, `VENT-CAMP-STRATEGY.md` §4):**

12. ~~Foxy subsystem~~ — decoded with true names: roll (g337, every 5 s)
    `(21 + Random(5)) - D <= old Foxy AI` (operator `<=`), where D (v3) is
    his aggression accumulator: +1/s while unengaged (g824) **plus** +1/s
    more while masked with the vent/office threshold clear (g825); D is
    zeroed all of night 1 (g872) and until 2AM night 2 (g873-874); his AI
    caps at **17** (g829, unlike the shared 15). Route: CAM 08 → hall
    stage 1 (hall light off) → straight to marker 123 (g389-390). At hall
    stage 1 with the hall light held: D=0, exposure v9 += 1/frame (g745) and
    B is pinned to 50 (g855); v9 > 100*night with both lights off and B=0 →
    retreat to CAM 08 with B = 500+Random(500) and `hall movement` = 300
    (g846). In Parts/Service, each 500 ms of hall light drains D by 1
    (g864). GOT-YOU: at 123, every 10 s regardless of monitor state
    (g571-572) or instantly on a monitor-down hall flash (g573), gated on no
    other engagement. Exposure is per-frame proportional — no 1 s
    quantisation (also closes plan 04's residual).
13. ~~Puppet flash-stall~~ — real, and it gates the RISE: with the box empty
    the escape-stage roll (every 1 s, Random(20) <= `Sockpuppet AI`,
    stage < 3) is blocked while viewing CAM 11 with the light ON (g494); off
    CAM 11 it rolls freely (g495). Puppet AI by night: 1/5/8/9/10/15/15
    (g815-821). Reaching 123 sets danger and forces the monitor down
    (g574).
14. ~~Post-mask flash lockout~~ — the light input requires mask state 0
    (fully off), so the lockout equals the mask-off animation length; no
    separate 16-frame counter exists.
15. ~~Foxy exposure quantisation~~ — per-frame proportional (see 12).
16. ~~`right light` semantics~~ — the right VENT light state (v0), held by
    touch (g303/g320), force-cleared every 200 ms (g299) and on monitor
    transitions (g13/14); Toy Bonnie's CAM 06 → 122 hop requires it to be 0,
    so holding the right vent light stalls his vent entry. Vent lights do
    NOT drain the battery — only `lit?` does (g284).

**Search reopeners (plans 05/06):**

17. ~~Auxiliary counters~~ — `in danger` = encounter latch (set by overlay
    existence g443 / arrivals, cleared at endpoint resolution g538-555);
    `office occupied` = the streak-four mutex; `Sockpuppet AI` = the
    Puppet's own AI level (writes g815-821); `decide path` = 1-or-2 route
    fork selector (W. Freddy g376-377, Mangle g396-397); `chicalookatyou`
    (a REAL second object) = Toy Chica's office overlay, created by the
    still-unexplained mask-state-99 branch (g438); `DEMO?` (pre-XOR "cam 6")
    = demo-build flag — the night-3 faster box drain is demo-only;
    `mute call` v0 arms 29 s into the night (g758) — the phone-call mute
    button, closing the 29000 ms timer thread.
18. ~~Roaming rare event~~ — it is Paper Pals, not the Puppet: `Paperpals AI`
    is seeded at 1 with P=1/100 per night (g822), rolls on the shared 5 s
    clock, and has a single office hop (g412) plus the `- night*50` flash
    variant. The 1/1000-style fractional seeds belong to Golden Freddy's AI.
19. ~~`ANDROID-OFFICE-ENDGAME.md` prose rewrite against true names~~ — done
    (the 2026-08-20 rewrite landed with the handle-scramble commit; verified
    free of pre-XOR names, ledger closed 2026-08-20 second pass).

**Minor threads:**

20. ~~BOX_WIND discrepancy~~ — resolved: winding below 300 snaps to 300
    (g639/645), then +5 per frame (+300/s, g638/643); 2000 from empty is
    (2000-300)/300 ≈ 5.67 s — the trainer's Markiplier-calibrated 5.66 s was
    right, and the earlier 6.67 s figure forgot the snap-up floor.
21. ~~BB inside-office~~ — at 123 BB force-clears `lit?` every frame (g96)
    and blocks light/camera touch inputs (g75-88, g301-320, clicks play his
    laugh); no departure group from 123 exists — BB is permanent once
    inside. At 122 he behaves like Toy Chica/Mangle: monitor-raise
    completion advances him (g290-291), five continuous masked ticks or a
    masked 10%/s roll return him to CAM 10 (g292/294).
22. ~~`cam 6` counter / 29000 ms timer~~ — see 17 (`DEMO?` and `mute call`).
23. OPEN — belt-and-braces display-map closure via UI button artwork (five
    identity anchors already fix it).

## Research rules

1. Android event data outranks PC/community descriptions for this project.
2. A community strategy may seed an Android policy test, but its published PC win
   rate is never an Android calibration target.
3. Simulator sweeps search policies; they do not establish mechanics. Any policy
   that depends on a model-only rule stays a hypothesis.
4. Every source interpretation gets a focused deterministic regression before it
   changes search conclusions.
5. A negative result closes only the modeled policy family and the decoded Android
   mechanics it actually exercises.
6. An unresolved source detail stays on this ledger rather than entering the
   engine unless it can change survival, player timing, or a policy under test.

## Current strategic verdict

- Minus 7 remains the only human-executable policy with a fully surviving
  regression control, and that control is Android-sourced again as of
  2026-08-20: the 400-frame camera-light stall is live in the owned binary
  (`stun time`, groups 450-457) and the corrected model — flash stun plus the
  Withered/Mangle marker hold — scores 200/200 normal seeds and 100/100
  pinned worst-luck seeds. The stall-free and hold-only controls still score
  0/200, confirming the flash stall is the strategy's load-bearing mechanism.
  See [`ANDROID-CAMERA-STALL.md`](ANDROID-CAMERA-STALL.md).
- Six-Seven has no two-camera cover on the extracted Android route graph and stays
  refuted for the target platform.
- The Minus 3 family (plan 02) is not zero-RNG on Android: Minus Toys cannot
  transfer (no double-camera state, CAM 09 flash-excluded) and the adapted
  glitchless Minus Two probe scores 16/200 normal seeds with a structural
  Toy Chica failure (`tools/minus2test.mjs`, `MINUS-3-STRATEGY.md` §7). The
  consecutive-tick mask-clear semantics are the highest-value on-device
  validation target — they are what breaks the whole imported family. The
  adb harness and first results live in
  [`ON-DEVICE-VALIDATION.md`](../device/ON-DEVICE-VALIDATION.md).
- The apparent 150/150 monitor-denial reopening is **retracted**. It came from
  reading groups 538-555 as continuous mask polling; they actually resolve the
  latched defense state at the end of the 300-frame office sequence. The corrected
  observable controller scores 0/150 across every tested gate-aware family.
- The office audit is documented in
  [`ANDROID-OFFICE-ENDGAME.md`](ANDROID-OFFICE-ENDGAME.md). W. Chica's state-99
  branch, auxiliary movers, and exact non-mutex ordering remain ledgered gaps;
  they do not justify more engine complexity without a reachable policy or
  observable Android test that depends on them.
