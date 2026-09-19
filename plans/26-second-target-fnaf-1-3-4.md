# Expansion: FNaF 1, 3 and 4 as second targets

**Status: proposed 2026-09-19, Pedro's directive.** Plan 25's horizon 5 ("the
method, not the game") named a second Clickteam title and sequenced it last,
behind the self-running lab. This plan supersedes that ordering, because the
expensive half of a second target — ground truth — was measured on 2026-09-19
and is already in hand for all three remaining night games.

Nothing here is a claim or a Plan 12 rung. Every number below was measured this
session and says how; every gap says `UNKNOWN` and what would close it.

## Gate: this does not start yet

The standing directive (Pedro, 2026-09-06, retargeted 2026-09-17) is Night 7
reliability and the promotion of what is already won, and promotion is blocked
on custody: `npm run evidence -- list` sees 79 runs here and zero
`DEVICE_MEASURED`, because every winning bundle lives under gitignored
`artifacts/` on the peer machine. `UNTRACKED_WINNER_DEBT` stands at 13 of 13.

**No work in this plan begins before that debt is cleared or Pedro explicitly
re-targets.** A second game with the first game's evidence uncustodied would
multiply the custody problem, not the result.

## What was measured on 2026-09-19

### All four games are the same runtime

| Game | Package | Installed version | CCN | Runtime | Build | Frames |
|---|---|---|---|---|---|---|
| FNaF 1 | `com.scottgames.fivenightsatfreddys` | 2.0.7+40 | PAMU | 770.0 | 296 | 25 |
| FNaF 2 | `com.scottgames.fnaf2` | 2.0.7+26 | PAMU | 770.0 | 296 | 33 |
| FNaF 3 | `com.scottgames.fnaf3` | 2.0.4+18 | PAMU | 770.0 | 296 | 31 |
| FNaF 4 | `com.scottgames.fnaf4` | 2.0.4+11 | PAMU | 770.0 | 296 | 23 |

All four are installed on the campaign handset (moto g56 5G, `ZF525F5BH5`).
The differing `versionName` (2.0.7 vs 2.0.4) does **not** imply a different
Clickteam runtime: the CCN headers are identical at runtime 770.0, product
build 296. `menu.sh`'s existing warning stands and widens — all four report
plausible-looking versions, so **the package name is the only thing that
identifies the game**, and now there are four of them on one phone.

### The RNG model transfers to all four

`packages/core/src/mechanics/rng.js` grounds the entire seed apparatus on one
per-game fact: no frame carries the seed chunk (13124), so `m_wRandomSeed`
stays −1 and each frame load takes 16 bits of wall clock.

A direct walk of the chunk tree — top-level and frame-level, not parser
warnings — finds **chunk 13124 absent in all four games**, with identical
structure (27 top-level chunk ids, 13 frame-level chunk ids each). Combined
with the identical runtime build, the LCG (`state = state*31415+1 mod 2^16`),
the wall-clock seeding, and the 65,536 possible streams are **properties of
build 296, not of FNaF 2**.

Everything built on that is therefore game-independent: the seed census, the
3000-seed rule, `seed-recovery.js`, twins, and `tools/device/seedpin`.

> This also retires the caveat raised earlier in the session, when the same
> question was asked with the vanilla mmfparser and could only be answered by
> comparing "unknown chunk" warnings.

### The handle-scramble constant, for two builds that had none

`dump_events.py` warns that the per-build object-handle XOR `K` must be found by
decompiling `OI/COI.loadHeader`, because a wrong `K` "mislabels every object
reference with the name of an unrelated object (the map is a bijection, so the
result still looks internally consistent!)". That is the defect that produced
the Toy↔Withered swap across every pre-2026-08-20 FNaF 2 dump. Known values were
FNaF 1 `K=0` and FNaF 2 `K=28`; FNaF 3 and 4 had none, and no jadx is installed
on this machine.

`K` was instead determined empirically, by **object-type agreement**: every ACE
carries an `objectType`, and the correct `K` is the one under which every
referenced handle resolves to an item of the matching type. Handle *coverage*
alone is degenerate (many `K` score 1.0, including the true ones); type
agreement is sharp.

| Game | Known `K` | Estimator's `K` | Agreement | Next best |
|---|---|---|---|---|
| FNaF 1 | 0 | **0** ✓ | 1.0000 (n=4056) | 0.5978 |
| FNaF 2 | 28 | **28** ✓ | 1.0000 (n=7708) | 0.6091 |
| FNaF 3 | — | **29** | 1.0000 (n=8187) | 0.6115 |
| FNaF 4 | — | **29** | 1.0000 (n=6122) | 0.5693 |

The estimator reproduces both known answers exactly, with a ~0.39 margin over
its runner-up in every case.

`UNKNOWN(not-decompiled)`: `K=29` is an empirical determination validated
against two ground truths, **not** the authoritative read of `COI.loadHeader`.
Install jadx and confirm before any identity-derived rule is encoded on these
names. Type agreement cannot distinguish a `K` that permutes objects *within* a
type class, which is exactly how the FNaF 2 Toy↔Withered swap survived review.

### Dumps produced

- `~/fnaf-apks/fnaf3/events/` — 31 frames, 0 failed, 636 objects, `K=29`
- `~/fnaf-apks/fnaf4/events/` — 23 frames, 0 failed, 485 objects, `K=29`

APKs and the `res/raw/application.ccn` were pulled from the handset. Derived
data only; nothing leaves this machine, per Plan 17's boundary.

### Capability preflight

`node tools/device/capabilities.mjs` ran green on 2026-09-19 and is entirely
handset-level — geometry, HID, screenrecord, and 26 Perfetto data sources.
**Exactly one field is game-bound** (`targetInstalled`, `capabilities.mjs:56`).
Horizon 5's first milestone item is therefore already satisfied for every game
on this phone.

## Per-game reading, from the dumps

### FNaF 1 — the simplest mechanics, the most contested prior art

Movement is one rule per animatronic, on its own timer
(`05-06-Main_Room.txt:1913–1934`):

```
Every 4970 ms:  Random(20)+1 <= bonnie activity  -> move who? = 1
Every 4980 ms:  Random(20)+1 <= chica  activity  -> move who? = 2
Every 3020 ms:  Random(20)+1 <= freddy activity  AND viewing = 0
Every 5010 ms:  Random(20)+1 <= fox    activity  AND viewing <> 99
                                                 AND fox progress < 3
```

Power is `power left = 999` draining `usage meter` per second, where
`usage = 1 + Σ(control room follow 0..4)` (groups 313–315). The 4/20 dials are
`freddy AI`, `bonie AI` *(sic)*, `chica AI`, `foxy AI`, compared against 0 and
20 in `14-15-customize.txt:288–299`.

These timers match the community's published values (4.97 / 4.98 / 3.02 /
5.01 s) exactly — independent corroboration that `K=0` and the decode are sound.

**A discrepancy worth a test, not a claim.** Community guides say Foxy is held
by checking *any* camera. The dump gates his progress on `viewing <> 99`
(a specific view), and group 60 shows `viewing = 3` at `fox progress = 3`
*advancing* him to 4. Group 455 shows the left door repelling him at stage 5,
resetting to `Random(2)`. Whether `viewing = 99` is Pirate Cove, a blackout
state, or something else is `UNKNOWN(unmapped-view-ids)` — the view-id map has
not been built for FNaF 1. This is precisely the class of question this project
exists to settle, and it is the natural first model-vs-phone disagreement.

**The door light is not load-bearing (2026-09-19).** See
[`docs/research/FNAF-SENSOR-ABLATION-RUNS.md`](../docs/research/FNAF-SENSOR-ABLATION-RUNS.md).
A public clear exists with the door lights never used: the light observation is
replaced by continuous camera tracking, paid for in power. That removes a
detector we would otherwise have to calibrate, and moves FNaF 1's difficulty
from *sensing* to *power budgeting* — a scheduling problem, and therefore this
project's strongest ground. The power model is confirmed arithmetically:
`usage` 2/3/4 over an ~89 s in-game hour spends 17.8/26.7/35.6% of the 999-unit
reserve, matching the community's 18/27/36-per-hour figures exactly.

### FNaF 3 — one antagonist, one formula, thin prior art

Springtrap's movement is a single line (`03-04-Office.txt:1585`):

```
move counter > ((10 - AI - aggresive?) + Random(15) - total turns)
```

with `move counter` incrementing every 1000 ms. The community's published
Springtrap formula is "move counter above (10 − AI level) + r − total turns"
with `r` unspecified; **the dump gives `r = Random(15)` and an explicit
`aggresive?` term**, which is a real refinement of the public record.

The failure economy is systems, not power:
`ventilation text` errors when `> 1000 − (AI × 100)` (`:3059`), audio drain
subtracts `AI` per use (`:2093`, `:2136`), and the object table carries
`seal vent button`, `vent 11`–`vent 15`, `what vent is closed`,
`audio error`, `camera error`, `ventilation error`, `ventproof on?`.

This is the most tractable target in the series: one adversary, a closed-form
move rule, no power budget, and a control surface (seal vent, audio lure,
camera, reboot) that maps cleanly onto the existing artifact/plan vocabulary.

**Two corrections and one simplification (2026-09-19).** See
[`docs/research/FNAF-SENSOR-ABLATION-RUNS.md`](../docs/research/FNAF-SENSOR-ABLATION-RUNS.md).

- **`aggresive?` decays.** Group 220 resets it to 0 `Every 15000 ms`. The public
  description treats it as a latch; it is a flag that must be continuously
  re-triggered. A route can therefore *wait out* aggression rather than only
  avoid provoking it.
- **The phantom path is AI-gated.** A phantom jumpscare only raises aggression
  when `Random(5) < AI` (group 662), so on low-AI nights phantoms are often
  free. `Random(15)` is also 0–14, not the 1–15 the public description assumes.
- **One error model, three systems.** Audio, camera and ventilation each decay a
  `* text` AV0 and raise their error at the same `<= -10` threshold, so a single
  scalar-threshold detector covers all three instead of three bespoke rules.

Public clears exist with the cameras dropped *and* with the maintenance panel
never opened, so neither is load-bearing — the minimum control surface is
smaller than the UI implies.

**The movement graph is now extracted (2026-09-19), including the vent map.**
Springtrap's movement is 73 edges, each shaped as "if he is at X and
`action selected` is N, move to Y" — so `action selected` is the branch selector
that the move formula's `total turns` term feeds. Locations 1–10 are cameras and
11–15 are the vents. Each vent has exactly one entrance, always on branch 4:

| Vent | Entered from | Returns to | Or advances to | Steps from death |
|---|---|---|---|---|
| 13 | cam 05 | cam 05 | attack stage 1 | 4 |
| 11 | cam 09 | cam 09 | attack stage 3 | 2 |
| 12 | cam 07 | cam 07 | attack stage 3 | 2 |
| **14** | cam 10 | cam 10 | **GOT YOU 2** | **0** |
| **15** | cam 02 | cam 02 | **GOT YOU 2** | **0** |

The attack chain is stage 1 → 2 → 3 → 4 → GOT YOU, so **vents 14 and 15 bypass
it and kill outright**. That gives a sealing priority the public strategies do
not state: **14 and 15 first, then 11 and 12, then 13.** It also means the two
lethal vents are entered from cam 10 and cam 02 — the two cameras worth watching
hardest, and a cheap belief-gate signal.

**The remaining 19 edges are traced too (2026-09-19), and they are four
mechanisms, not the single audio-lure family an earlier draft guessed:**

- **Spawn.** At frame start Springtrap draws `Random(5)+1` and lands on cam 10,
  09, 08, 07 or 06. Uniform over five cameras, and it is the **first RNG draw of
  the night** — so with the RNG model transferring and only 65,536 streams, his
  starting camera is *predictable per seed* by the same machinery `seedpin`
  already uses. That is the cheapest possible foothold for a seeded FNaF 3 route.
- **Audio lure.** The lure is consumed when he is adjacent to it, the target
  camera is stored on him, a per-lure delay is drawn as `Random(100)`, and on
  relocation his **`move counter` resets to 0**. A lure therefore buys a full
  movement-timer reset, not just a reposition — which is why the public
  "let him roam, lures are expensive" advice understates what a well-timed lure
  is worth.
- **Scripted forced move** on a `force move` / `force to` pair, to three fixed
  cameras.
- **Attack escalation** to attack stage 2 while a screen is being viewed.

With this the FNaF 3 movement model is closed: spawn, per-step rule, branch
selector, full location graph, vent topology and danger ordering, lure effect,
and the aggression term with its six triggers and 15 s decay.

### FNaF 4 — no cameras, audio-dominant, and the mobile port helps

FNaF 4 has no camera system. Its control surface is named explicitly in the
mobile build's object table, which is unusually friendly:
`HUDDoorLeftHitzone`, `HUDDoorRightHitzone`, `HUDDoorClosetHitzone`,
`HUDFlashlight`, `HUDCloseDoor` and their hitzones, plus state objects
`left door shut`, `right door shut`, `bed view`, `viewing closet`, `in closet`,
`on bed`, `closetcreak`.

**Named touch targets in the dump** mean the control map can be derived rather
than probed pixel-by-pixel — a genuine saving over FNaF 2's calibration history.

The apparent cost is sensing: FNaF 4 is decided by *listening*, and audio is
this stack's weakest observation channel. It is not absent — `bt-audio-link.sh`,
`collect-cue-audio.sh` and the BT audio capture chain exist and are wired into
`night-run.sh --bt-audio` — but nothing has ever graded a night on audio alone.

**That objection is retired (2026-09-19).** See
[`docs/research/FNAF4-AUDIO-INDEPENDENCE.md`](../docs/research/FNAF4-AUDIO-INDEPENDENCE.md).
A public no-audio clear exists, and its central trick checks out in our own
dump: **group 341** shows that closing a door while Bonnie is elsewhere
*teleports* him to `left hall near` — an anti-cheat that converts an
unobservable state into a forced, known one. **Group 342** pushes him back on a
**3000 ms** hold (the public strategy recommends ~5 s, so it over-holds by ~2 s
per visit). Movement is further gated on `left door shut = 0` and
`listening mode <> 1` (**groups 284–285, 288–290**), so *both* holding a door
and listening at one suspend that side's movement outright, with no observation
required. Freddy's meter is exact: `+Freddy AI` every 4000 ms, draining 1 per
50 ms while the bed is viewed (**groups 397, 401**).

FNaF 4 is therefore a good fit for exactly what already wins here — an open-loop
schedule against a 5000 ms roll grid and a 4000 ms meter tick. Its real costs
are the unmapped `follow` player-state machine and the still-unverified
wait-to-kill timers, both cheap to close from the dump we now hold.

### Input lockouts: check the emitter before trusting any model score

**Raised by the peer session 2026-09-19, then traced in our dumps.** On FNaF 2
the engine drops input during the mask-ON animation (`MASK_ANIM_ON`, 200 ms) and
nothing in `artifact-commands.mjs` gated it — only the mask-*off* window was
enforced. A `minus7` plan authored a mask-off 133 ms after its own mask-on press
and **the phone dropped it on 48 of 55 cycles**. This is mistake register #10
exactly: a window measured in one direction does not transfer to the other.

Each expansion target has its own version of this, and they are not the same
mechanism:

- **FNaF 1 — a confirmed ~167 ms door lockout.** `click cooldown` is set to
  **10** by *every* door toggle (groups 168, 178, 179), decremented once per
  frame by the delta scale (`Max(0, click cooldown - 1 * GlobalValue[10])`,
  group 166), and **every** door toggle carries `click cooldown = 0` as a
  condition. A press inside that window fails its condition silently — no
  feedback, no animation, nothing to observe. At 60 fps that is ~167 ms on
  FNaF 1's *primary* control. The community 4/20 loop
  (`Left Door Light -> Camera -> Right Door Light -> Camera`) hammers exactly
  this control, so an emitter that ignores the lockout will drop presses the
  same way `minus7` did.
- **FNaF 4 — no time cooldown; a state guard instead.** Input arrives through
  `Multiple Touch` hitzone conditions carrying **mutual-exclusion** clauses
  (e.g. flashlight-hitzone touched AND NOT close-door-hitzone touched), and what
  is actionable at all depends on the `follow` player-position value. The risk
  is not a timer but acting while `follow` is in transition or while a second
  hitzone is live. This is another reason the `follow` map is a blocker.
- **FNaF 3 — traced 2026-09-19: no time-based input lockout on the night
  controls.** The `cooldown` object that prompted the question is used only in
  the Extras frame, never in the Office frame, so it has nothing to do with a
  route. `scare cooldown` *is* in the Office frame and is set to 10, but group
  797 decrements it once per **1000 ms** and the states it guards are phantom
  events (Phantom Freddy's walk, the Balloon Boy peek that spawns a scare) — it
  is a **10-second rate limiter on phantom scares, not on player input**. Since
  a phantom scare is one of the six ways to raise `aggresive?` (and only when
  `Random(5) < AI`), this also bounds how often phantoms can drive aggression.

  FNaF 3's controls are gated by **state, not time**, which is the FNaF 4 shape
  rather than the FNaF 1 one: the audio lure needs `play counter = 7` with the
  vent-map toggle off, and the seal button requires `viewing >= 2`, the toggle
  on, and `going to seal = 0`. Two counters that look like timers are not:
  `going to seal` has no decrement anywhere — it holds 11-15, is copied into
  `what vent is closed` on commit and reset, so it is a **vent selector
  register**; and `you in` / `mon in` hold 1-15 and are compared to each other,
  so they are **location registers** over the ten cameras plus five vents.

  Consequence for the emitter: there is no hidden drop window to respect here,
  but a press is silently ignored when its *state* precondition is unmet, which
  needs the same care for a different reason.

**Rule for Plan 26: no model score for a new game is trustworthy until the
emitter is shown to respect that game's lockout in both directions.** The FNaF 2
defect survived because only one direction was gated and the gate looked
complete.

## Community strategies, by game

Named so that a machine-found route can be compared against what people
actually do. These are `CLAIMED` (community guides), not measured here.

**FNaF 1, 4/20.** The canonical loop is
`Left Door Light → Camera → Right Door Light → Camera → repeat`. The run is
dominated by the **right door**, because Freddy at AI 20 parks at CAM 4B nearly
permanently. Foxy is held by camera attention (community: *any* camera, East
Hall Corner recommended; and "never check Pirate Cove with the right door
open"). Power discipline is the binding constraint. See
[the 4/20 guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3087295888)
and [the 20/20/20/20 guide](https://steamcommunity.com/sharedfiles/filedetails/?id=322029011).

**FNaF 2, 10/20.** This repository's own families: **Minus 7**, **Minus Toys**
(the route that actually wins on hardware), **Minus 3**, **right vent camp**.
Community equivalents are the mask-flash-wind cycle with Music Box priority.

**FNaF 3, Nightmare / Aggressive.** The dominant published line is
**"let Springtrap roam" rather than lure**, because every audio lure costs
reboots. Seal the vent adjacent to the room he just entered; if he reaches
CAM 05, lure back toward CAM 06 (or 08); keep flipping the monitor to stagger
error onset; reboot ventilation **preemptively** when safe. Tru3P1ay3r's
strategy is the named reference —
[guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2553506510).

**FNaF 4, 20/20/20/20.** Rotation is `Left Door → check Freddles → Right Door`,
driven by an audio rule: **breathing → hold the door until footsteps, then
flash; no breathing → flash immediately**. The night has a phase change when
Nightmare Foxy enters the closet (signalled by the creak), after which the
closet is held ~6 s per visit and the rotation adds a Foxy check. The strongest
published line ignores Bonnie and Chica and plays **Foxy plus the bed**. See
[the Night 8 strategy](https://steamcommunity.com/sharedfiles/filedetails/?id=493684444).

## Prior art, updated 2026-09-19

The standing survey is [`docs/research/FNAF-BOT-CENSUS.md`](../docs/research/FNAF-BOT-CENSUS.md)
(snapshot 2026-08-26); this is a delta, not a replacement.

- **FNaF 1 is the crowded target.** Many external scripted 4/20 bots
  (`The2AndOnly/fnaf-python-bot`, `kevvit/fnafbot`, `Sebastian1320`, `Screw13`,
  `GROTTAKE/FNAFBot` in C++/OpenCV) plus `LucMazarJR/no-more-jumpscares`, a PPO
  agent trained against the real executable. A clear here is a *method*
  validation, not a novel result.
- **FNaF 3 remains thin.** Re-checked: `Maraba23/Fnaf-playbot`'s FNaF 3 branch
  resolves templates once at import (stale detections), `ChristianLW/fnaf3bot`
  is a Twitch voting controller, REKA is video-only. No source-available
  autonomous stock-game player.
- **FNaF 4 is thinnest.** `Doonguin/fnaf4-sim` was re-fetched today: it
  documents Bonnie, Chica, Foxy, Freddy, Fredbear and Nightmare mechanics but
  **still has no trained agent, policy, or training loop** — a simulator
  scaffold, as the census recorded. REKA is video-only.
- **Still nobody publishes measured closed-loop latency for a reactive bot on a
  physical handset** (this project's own Android survey).

**The strategic reading:** FNaF 1 is where the method is cheapest to *validate*
and the result least novel. **FNaF 3 and FNaF 4 are where a graded,
source-derived, physical-handset clear would have no public precedent at all.**

## What it costs in this repository

Measured 2026-09-19.

**Decoupling — small and localized.**

- `CONTROL_VOCABULARY` (`packages/core/src/control/vocabulary.js`) is a frozen
  FNaF 2 enum bound to `CONTRACT:semantic-control-v1`: **113 reference sites
  across 11 files**. FNaF 1/3/4 share only `monitor`. This is the one real job.
- Game rules that leaked out of core and must come back in:
  `apps/device/src/service.js:32-33` hardcodes which controls need the monitor
  up vs down; `apps/device/src/artifact-executor.js:107-121` pins `camdrop` and
  `observe-left` to specific FNaF 2 controls.
- Already parameterized, needing no structural change: `menu.sh:39,46` reads
  `MENU_PACKAGE`/`MENU_TARGET_VERSION` from the environment;
  `device-profile-v1` already carries `targetBuild` and a named `controlMap`,
  so a per-game profile is **data**; `capabilities.mjs:56` is a one-line fix.
- The semantic contract layer is already method: **61 contracts, 2 game-bound**.

**Rebranding — wide, shallow, and deliberately deferred.**

- **463 of 1026 tracked files (45%)** mention FNaF 2; 1951 occurrences.
- The `@fnaf2-1020/*` scope: **718 imports across 204 files**, plus the repo
  directory, root package name, and the `fnaf2-cue-helper` MCP server. The
  Android companion (`com.ppvaz.fnafcompanion`) is already game-neutral.

**Do not rebrand first.** It is 45% of the tree for zero evidence value, it is
pure bookkeeping under the consequence lock, and a tree-wide rename will collide
with peer sessions that stage broadly. Rename once a second game has earned it,
in one mechanical commit, to a neutral scope.

## Recommended order

1. **FNaF 1 as a one-session method calibration.** Cheapest mechanics, and a
   community baseline to check the port against. Explicitly a method test, not
   a novelty claim. Its deliverable is the change log horizon 5 asks for: which
   modules moved, tagged general or game-specific *before* starting.
2. **FNaF 3 as the first novel target.** One adversary, a closed-form move rule
   already extracted, no power economy, and no public precedent.
3. **FNaF 4 third — but no longer for the original reason.** It was sequenced
   last because it looked audio-bound; that objection was retired on 2026-09-19
   and the ordering now rests only on prior-art novelty and control-surface
   cost. Its open blockers are the `follow` state map and the wait-to-kill
   timers, both readable from the dump without touching the phone. If either
   FNaF 1 or FNaF 3 stalls on hardware, FNaF 4 is a legitimate substitute
   rather than a fallback.

## First milestones and what would refute them

| Step | First physical milestone | Refuted by |
|---|---|---|
| Confirm `K` | jadx reads `COI.loadHeader` for FNaF 3/4 and prints 29 | any other constant; every name-derived rule is then void |
| FNaF 1 port | a title observation and one **graded death** on the handset | the title observer cannot resolve a state the flow depends on |
| FNaF 1 model | 3000-seed census agrees with 10 phone runs on death cause | the Foxy/`viewing` discrepancy above turns out to be a model error |
| FNaF 3 port | one graded death, with vent/audio/camera controls actuated | the control map cannot be derived and needs full pixel calibration |
| FNaF 4 mechanics | `follow` state map and the wait-to-kill timers read out of the dump | the timers are not in the event sheet and need a device measurement |
| FNaF 4 port | one graded death under an **open-loop** schedule, no audio sensing | the forced-door trick does not reproduce on the mobile build |

## Success

A first graded 6 AM on a second game, `DEVICE_MEASURED` under a resolved hashed
profile, with a change log showing which layers moved and which did not — and,
if the target is FNaF 3 or 4, a result with no public precedent.

## Dependencies

Blocked on the custody gate above. Independent of Plan 25 horizons 1–4; horizon
3 (the self-running lab) would make steps 2 and 3 much cheaper but is not a
prerequisite, because the measurements in this plan removed the reason horizon 5
was sequenced last.
