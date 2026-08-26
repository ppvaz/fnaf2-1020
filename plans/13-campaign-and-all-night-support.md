# Campaign recovery and all-night support

**Status: proposed 2026-08-26 after the target-device save was lost; package 1
closed the same day.** The exact simulator already models story Nights 1–6 and
Custom Night, but the
stock-device workflow assumes the Sixth Night title item is unlocked. The
current runner accepts `continue|6th`, then refuses everything except `6th`;
its recipe and human gate are always generated as Night 6. A fresh save makes
that shortcut unavailable and creates a one-time chance to validate the lower
nights instead of treating them as a menu obstacle.

## Goal

Make the project able to identify, launch, model, control, grade, and advance
every story night from a fresh save, then configure Custom Night explicitly.
Each night must be an evidence-bearing configuration, not an alias for a title
coordinate or an assumption about the save cursor.

This plan does not promise that one policy is optimal for every night. It first
proves which existing policy is safe, then permits night-specific simplification
only when exact simulation and device evidence support it.

## Current capability and gap

| Scope | Simulator | Device workflow | Gap |
|---|---|---|---|
| Night 1 | AI table, resources, fuses, and lifecycle duration modeled | `New Game` coordinate exists but no gated route may select it | New Game resets progress; no save-state/night-card verification (recipe construction fixed by package 1) |
| Nights 2–5 | Per-night/per-hour AI and resource tables modeled | `Continue` can be tapped, but the runner refuses it | ~~The title button does not say which night the save cursor owns~~ — **wrong, corrected 2026-08-26: it does.** A real title frame prints the cursor as a sub-label under Continue ("Night 1"). No clear/advance proof yet |
| Night 6 | Exact plan, human gate, runner, sensors, and graders exist | Current sole supported route through the `6th Night` title item | Still lacks a positive win classifier and manifested lifecycle record |
| Night 7 / Custom | Custom AI dials modeled; 10/20 is the canonical target | No unlocked-menu setup or dial verification | Must distinguish Custom Night configuration from story progression and verify all ten dials before input |

A local probe on 2026-08-26 found that the unchanged generated policy clears
Nights 2, 4, 5, and 6 at **300/300** exact replays and passes the current
`+/-60 ms` human-slack gate on each (77/100, 85/100, 78/100, and 46/100).
Nights 1 and 3 fail during *recipe construction*, not replay, because
`build()` requires its fixed seed to exhibit a Balloon Boy attack cycle. That
is a template-extraction bug: a low-threat night may legitimately have no such
cycle. These numbers are local design evidence, not device clears.
*(Package 1 closed that construction bug on 2026-08-26; Nights 1 and 3 now
build and gate. The paragraph stays as the evidence that opened the package.)*

## What the device actually held, 2026-08-26

Two corrections found by looking instead of reasoning, both of which this plan
had assumed the other way round.

**The target game was not installed at all.** `com.scottgames.fnaf2` was absent,
with no leftover data directory, and `com.scottgames.fivenightsatfreddys` —
Five Nights at Freddy's **1** — had been installed that morning instead. What
this plan opened by calling "the target-device save was lost" was the FNaF 2 app
being gone. The trap that makes this hard to see is that **both games report
`versionName=2.0.7`**, so a version check passes on the wrong game; only the
package name identifies it. `menu.sh`'s `menu_require_target_build` now refuses
before anything else, and says which Scott Games packages it found instead.
Without it the first symptom is "game is not focused", which reads as a
transient.

**The title screen says more than this plan credited it with.** A retained
2026-08-25 recording (`captures/gate-test-aborted.mp4`, 6.6 s) contains a real
6th-Night-unlocked title, and it shows:

- **five items, not four** — New Game, Continue, 6th Night on the left, and
  **Options** and **Unlocks** on the right. A classifier that knows only the
  four `MenuTarget` values will not be surprised by these, but a layout check
  that expects four will be;
- **Continue carries the save cursor as a sub-label** — "Night 1" printed
  directly beneath it. `SaveState.storyCursor` is therefore *directly
  observable*, not something to be inferred from progression bookkeeping, which
  is what the gap table above assumed. Note the state that frame captured: the
  cursor was Night 1 while 6th Night was already unlocked, so the two facts are
  independent and must stay separate records;
- **`v 2.0.7` printed bottom-left**, a build check readable from the frame;
- and the same recording's office frames print **`Night 6` and `12 AM` in the
  top-right HUD**, so night identity and the clock are readable during play and
  not only from an intro card. That is a better anchor for package 3 than the
  intro card alone.

Measured band values, from that recording through `title-observe.py --measure`
(bright fraction, `min(r,g,b) > 150`, 660×76 band on each measured tap point):

| Frame | newGame | continue | sixthNight |
|---|---:|---:|---:|
| title, 6th unlocked (3 frames) | 0.069–0.072 | 0.031–0.033 | 0.067–0.069 |
| office HUD (the control) | 0.0000 | 0.0000 | 0.0000 |

The control matters: an office frame reads exactly zero on all three bands, so
the predicate separates "a title item is here" from "this is not the title
screen" cleanly. It does **not** yet separate "6th Night is absent from a title
screen" from "6th Night is present" — that needs a fresh-save title, which a
reinstall produces. Two further caveats: these frames are 1280×576
`screenrecord` output upscaled to 2400×1080, which is a different sensor from a
`screencap`, and `continue` reads about half the others because its measured tap
point sits above its glyph centre. Neither is a reason to distrust the geometry;
both are reasons not to promote these numbers into a device model unchanged.

## Identity contract

Keep four facts separate throughout the code and corpus:

```text
GameConfig  { storyNight: 1..6 | customDials[10] }
MenuTarget  { newGame | continue | sixthNight | customNight }
SaveState   { unknown | storyCursor: 1..5 | sixthUnlocked | customUnlocked }
Policy      { id, simulatorNight, configHash, modelGateReport }
```

`Continue` is a menu action, not a night identity. `Custom Night` is a
configuration surface, not merely Night 7. No component may infer one record
from another without a positive observation edge.

## Safety invariants

- `New Game` is save-destructive and requires an explicit one-run opt-in. It is
  never a fallback when `Continue`, `6th Night`, or Custom Night is absent.
- A missing expected title item aborts before any gameplay tap.
- The requested night and observed intro/night identity must agree before the
  controller starts. `UNKNOWN` is not permission to assume the campaign cursor.
- Disappearance of the office HUD is not a win. A clear needs positive 6 AM or
  post-clear evidence; death, minigame, static, title, focus loss, and abort are
  different outcomes.
- The next campaign night is never selected until the prior clear and resulting
  save-state transition are both verified.
- A policy is gated against the requested game configuration. If a conservative
  higher-night proof is used, that fact is named in the manifest rather than
  silently substituting `night=6`.
- Raw story progression, title, intro, and Custom Night captures follow Plan
  09's local-only media and provenance rules.

## Work packages

### 1. Remove the Night-6 construction assumption — complete 2026-08-26

- Separate cycle-template extraction from the night being evaluated.
- Make a missing threat branch valid when that threat is impossible, while
  retaining a conservative fail-closed branch for observation/config mismatch.
- Pass the requested night through `recipe.mjs`, `human-gate.mjs`, replay, and
  emitted plan metadata instead of relying on default `6` values.
- Add exact and human-slack matrix tests for every story night. Record deaths,
  missed observations, resource use, and whether a branch was reachable.
- Keep the current Night 6 artifact byte/semantic behavior pinned while the
  refactor lands.

**Gate:** Nights 1–6 each build deterministically, replay from fixed seeds, and
receive a configuration-correct model-gate verdict. A night with no sampled BB
attack no longer crashes the builder, and a forced unexpected-BB fixture still
fails closed.

**Result: closed.** `build()` ended its template extraction with one message —
`no attack cycle in the sampled night` — that covered two opposite facts, which
is why Nights 1 and 3 failed identically for unrelated reasons. Only the source
AI table separates them, so `resolveAttack()` now asks it (`C.peakAi` /
`C.canAct`, read off the same `AI_BY_NIGHT` rows the engine applies):

- **impossible** (Night 1, peak BB AI 0): a missing attack cycle is correct.
  The branch is still emitted, cut from the pinned Night 6 seed 7 template, so
  an unexpected classifier read is handled rather than unhandled; the recipe
  reports it as `reachable: false`.
- **rare but possible** (Night 3, peak BB AI 2): seed 7 not rolling him is a
  sampling accident. The builder reseeds the same night until a sample supplies
  the branch (Night 3 finds one at seed 2) and refuses rather than borrowing.
- **mismatch** (a sample showing an attack on a night the table cannot arm him
  on): refused. The engine and the AI table disagreeing about which night is
  being played is exactly what this plan's identity contract forbids.

The night now travels through `recipe.mjs` (`recipe.night`, `branches.attack`,
`powerFramesHeadroom`), the emitted plan (a `#night N` header the runner's
parsers skip, because they only read rows once a matching `#cycle` has opened),
`replay()` (where `night` is required — the old default of `6` would have priced
a Night 3 plan against Night 6's table) and `human-gate.mjs` (which refuses a
plan that names no night rather than guessing one).

`tools/device/test-night-matrix.mjs` holds the matrix, and Night 6's emitted
plan is pinned byte-for-byte against `testdata/n6-device-plan.txt`:

| Night | Exact | Human slack ±60 ms | Light frames | Peak BB AI | Attack branch | BB reads |
|---:|---:|---:|---:|---:|---|---:|
| 1 | 100/100 | 1189/1200 (99.1%) | 2808/7000 | 0 | unreachable, template n6 s7 | 0 |
| 2 | 100/100 | 827/1200 (68.9%) | 2808/6000 | 3 | sampled n2 s7 | 183 |
| 3 | 100/100 | 946/1200 (78.8%) | 2808/5000 | 2 | sampled n3 s7 | 108 |
| 4 | 100/100 | 878/1200 (73.2%) | 2808/4000 | 3 | sampled n4 s7 | 197 |
| 5 | 100/100 | 767/1200 (63.9%) | 2808/3000 | 5 | sampled n5 s7 | 356 |
| 6 | 100/100 | 673/1200 (56.1%) | 2808/3000 | 9 | sampled n6 s7 | 558 |

**Corrected twice on 2026-08-26.** Both corrections are kept, because between
them they are the whole lesson.

*First:* this table read 99, 77, 89, 85, 78 and 46 of **100** seeds and reported
all six as passing. Those were seeds 1..100 — a favourable block on every night,
and 100 draws cannot measure a rate near the bar. `GATE_RUNS` moved to 1200 and
the honest figures were 99.1, 66.5, 77.1, 72.3, 62.5 and **37.4%**: Night 6 was
correctly **refused**.

*Second:* the refusal was then fixed at its cause rather than argued with. The
clear branch had lost its first Foxy reset — the old standalone hall slot landed
inside mask-off and did nothing at the measured read latency — so the route now
carries that contact on the existing post-read `maskraise` row
(`recipe.mjs:353-360`, `testdata/n6-device-plan.txt:12`). The mask→monitor seam
stays at its measured 180 ms and the read and sweep do not move. Measured on the
same 1200 seeds, all six nights now clear the unchanged 40% contract.

**What that margin cost, which is the part worth watching.** The restored
contact is lit, so light spend rose 2148 → 2808 frames on every night. Nights 1-4
absorb it. **Nights 5 and 6 do not have room to spare: headroom fell 852 → 192
frames**, about 3.2 s of flashlight against a 3000-frame budget. Night 6's gate
margin was bought with power, and the two nights that needed it most are now the
two with the least slack left. Any future observation that costs light — a held
sweep, a second vent read, a lit calibration frame — has roughly three seconds to
spend on Nights 5-6 before the route stops fitting its own budget.
`test-night-matrix.mjs` asserts `powerFramesHeadroom > 0` per night, so crossing
that line fails the suite rather than the phone; it does not warn on approach.

Night 1's zero reads across 100 replays is the control on its `reachable:
false`: the table and the engine are two independent statements, and the matrix
fails if they disagree. **These are simulator figures** — no night below 6 has
ever been attempted on the device, and nothing here is a device clear or a
claim that one policy is right for every night. That decision is package 4's.

### 2. Add a save-safe title/menu observer and selector — complete 2026-08-26

- Represent `MenuTarget` separately from `GameConfig`.
- Classify the title items actually visible on the target build: New Game,
  Continue, Sixth Night, and Custom Night.
- Put title coordinates behind one tested selector rather than duplicating
  them in runners and HID fixtures.
- Require a deliberate `allowSaveReset` capability for New Game and log that
  authorization without storing private device data.
- Refuse ambiguous, missing, stale, unfocused, or unexpected menus before
  sending input.

**Gate:** synthetic/menu-frame fixtures cover fresh save, story progress,
Sixth Night unlocked, Custom Night unlocked, unknown layouts, and stale/focus
loss. A test proves that no unapproved path can press New Game.

**Result: closed 2026-08-26.** The selector, the capability, the refusals, and
a measured classifier for the canonical build all exist.

What landed. `tools/device/menu.sh` is now the only place a title item is
pressed. Four scripts — `trial-minus7.sh`, `trial-maskcamp.sh`,
`watch-vent-cue.sh`, `collect-cue-audio.sh` — each carried their own
`NIGHT_TAP=$TAP_CONTINUE; [ "$NIGHT" = 6th ] && NIGHT_TAP=$TAP_6TH` and tapped
it without looking at the screen; they now call `menu_select`, which refuses
unless it has positively seen the item it is about to press. `MenuTarget` is a
separate record from the night: `NIGHT=continue` used to be a menu action, a
night identity, a claim about the save cursor and a policy selection at once.

New Game is behind a one-run `MENU_ALLOW_SAVE_RESET=1` capability and logs its
authorization without recording anything about the device. It is never a
fallback for a missing Continue, and `test-menu.sh` asserts both the behaviour
and the structure — no script outside the selector may name `TAP_NEWGAME`, and
no runner may keep a second title table. That coordinate had sat unguarded in
`coords.sh` since 2026-08-20 beside the two the runners did press.

`title-observe.py` refuses six ways: no model, an unreadable or unrecognised
screen, a measurement inside the model's undecided band, lost focus, a stale
observation, and an item that is on screen but has no measured coordinate —
which is Custom Night's actual state, so it is observed and still refused.

The measured model, `tools/device/models/title-moto-g56-v207.json`, was built
the same day from 26 real frames once the correct game was reinstalled. Its
numbers and its control:

| band | newGame | continue | sixthNight |
|---|---:|---:|---:|
| title, fresh save (23 native screencaps) | 0.0674–0.1318 | 0.0264–0.0547 | **0.0000 exactly** |
| title, 6th unlocked (3 recorded frames) | 0.0690–0.0720 | 0.0310–0.0330 | 0.0670–0.0690 |
| office HUD (control) | 0.0000 | 0.0000 | 0.0000 |

Absent is not "small", it is exactly zero on every frame measured, and the
narrowest present value is 0.0264 — so the thresholds sit at 0.008/0.020 and
the interval between them means *undecided*, never "probably absent". The two
sensors agree: `newGame` reads 0.067–0.072 on a native screencap and 0.069–0.072
on upscaled `screenrecord` output.

**The control changed the design.** The Options screen was measured as a
negative, and its "Perspective Effect" label lands inside the New Game band at
**0.0186** against a 0.020 present threshold — a margin of 0.0014, which is not
a classifier. Asking the item bands whether this is the title screen is the
wrong way round. So the model now carries a `title_gate`: the word "Five" of
the game logo, which reads 0.106–0.123 on every title frame measured and
0.007–0.012 on Options. The item bands are consulted only after the gate says
this is the title at all, and Options now refuses as `not-the-title-screen`
rather than as an ambiguous item. Without the negative control this would have
shipped with a 0.0014 margin and looked fine.

Verified end to end against the live phone, read-only: `items=continue,newGame`
on the fresh save, which is correct — no 6th Night yet.

Two things named rather than solved. `customNight` still has **no measured
coordinate**, because the item has never been on screen; it is observable in a
fixture and refused by `menu_coord`, and package 8 owns it. And the title
carries two more items than this plan listed — Options and Unlocks, on the
right — which the four `MenuTarget` values do not cover and the gate makes
harmless.

### 3. Identify night start, win, death, and save advancement — ADVANCED 2026-08-26, not closed

**What the cleared Night 1 unblocked.** This package could not start because no
6 AM frame existed anywhere; `lifecycle-observe.py`'s header said that screen
"needs a survived night". The clear produced one, and the fixtures are retained
at `captures/lifecycle/n1-sixam-20260826/`.

**Done.** `sixam` and `intro` are positive classifiers, measured with controls
(`ON-DEVICE-SCREEN-CHECKS`, `lifecycle-observe.py`): the win confetti reads
0.059–0.326% on every real 6 AM frame and **exactly zero** across sixteen intro
frames from two recordings, while `mean < 5` separates both from every other
class by a wide margin. A dark frame with no text now says `dark-frame-no-text`
instead of blaming the sensor. `run-timeline.py` segments a recording into
intro / camera / office / mask / dark / sixam and returns a machine-readable
terminal outcome with its evidence (`--json`), wired into `grade-run.sh`. Three
phases are positive anchors, not residuals — the selected camera's yellow map
button, the pink mask bar, and the dark-screen pair — after `is_night()` turned
out to be an ALIVE test rather than an OFFICE test (the flashlight meter stays
drawn over a raised tablet, so it reads `True` on 100% of a run's frames).

**Still open, and the gate does not close without them:**

- **No minigame fixture exists.** The gate names minigame as a class to
  distinguish and nothing here can. `UNKNOWN(no capture)`.
- **Which night an intro card names is not read.** Only Night 1's card has ever
  been captured, and separating "1st" from "2nd" is a different problem with
  different evidence. The identity contract needs that second fact, so a
  detected card must not stand in for a verified night — which is why
  `STORY_CURSOR_OBSERVED` is still an operator assertion.
- **Media PTS to runner-clock alignment is not established.** Every mapping in
  this session used a hand-derived `+7.5 s` offset read off `grade-night.py`.
  That is good enough to line mask responses up with driver events by eye and
  not good enough to be a contract.
- **Save advancement is not read by any classifier.** The Night 1 clear was
  proved by a human reading `Continue — Night 2` at full resolution.

**Two detectors worth building, both sourced, neither built.** The dump carries
`blackout` and `blackout timer` (the office lights going out with an animatronic
inside, during the masking response) and `signal out` (the camera feed loss when
one moves while the monitor is up) as *distinct* objects — three different
things this project nearly merged under one borrowed word. Either would give
positive ground truth about when a threat actually acted, which is exactly what
`elegance.py` currently has to approximate from the AI table. A first attempt at
signal-out detection on the Night 1 capture found one candidate frame, which is
uninformative: almost nothing moves on Night 1, so it is the wrong night to
calibrate on.

### 3 (original scope)

- Add positive classifiers for the `12:00 AM / Nth Night` intro cards and 6 AM
  transition, plus the resulting title/unlock state.
- Preserve `screenstate.py`'s HUD/game-over role but stop collapsing every other
  lifecycle screen into one actionable `other` value.
- Establish media PTS to runner-clock alignment for the intro and terminal
  evidence under Plan 09's event schema.
- Return a machine-readable terminal outcome with independent evidence and
  confidence/unknown reasons.

**Gate:** holdout fixtures distinguish each story-night intro, 6 AM, death,
minigame, static, title, and unknown. An aborted or short recording cannot be
graded as either a clear or a campaign advance.

**Fixture inventory, measured 2026-08-26.** This package is half-startable
without a phone, and the half that is missing is missing for a structural
reason rather than a filing one.

*Present.* `captures/lifecycle/n1-intro-cal-20260826.mp4` — 12.9 s, 697 frames
at 1280x576 — contains the **`12:00 AM / 1st Night` intro card and the
intro→night transition**. Sampled at 2 fps, `screenstate.py` reads `other`
through the card and `night` from about 8 s, so the boundary is labelled by the
authority itself. That is the positive intro classifier's training and holdout
material, available now. `n1-death/` holds 126 death frames, `night1/` 22 office
frames, `box-starve/` and `box-wind/` the music-box series.

*Absent.* **No 6 AM frame exists anywhere in the repository.** Package 3 can
therefore build and gate the intro classifier, but cannot close: the 6 AM
transition and the minigames still have nothing to fit or to hold out against,
which is exactly what `lifecycle-observe.py`'s header already says and reports
as `unknown` rather than guessing.

*Mislabelled, now corrected.* `captures/lifecycle/n1-clear/` contained a **death**
— `screenstate.py` reads its `final.png` as `gameover` — and has been renamed
`n1-clear-attempt-died/` with a README. Nothing referenced it, so it was a trap
rather than a live defect, but it was a trap aimed precisely at this package: a
session building 6 AM fixtures would have found a directory named `n1-clear` and
fitted the clear classifier to a Game Over.

**The intro card's signature, measured 2026-08-26** on the 26 frames sampled at
2 fps from that video. Recorded here because it cannot be re-measured on a
machine without these captures, and because it carries its own negative control.

Three fractional-box signals: `textbox` = bright fraction (min>150) over
x∈[0.36,0.64], y∈[0.36,0.60], where the `12:00 AM / Nth Night` glyphs sit;
`outer` = the same over the top quarter of the frame; `rough` = mean absolute
vertical-neighbour difference over the central 80%.

| frames | what | `textbox` | `outer` | `rough` |
|---|---|---:|---:|---:|
| i001–i006 | pre-intro cutscene | 0.0001–0.1096 | 0.0225–0.0259 | 2.63–4.58 |
| **i007–i011** | **the intro card** (2.5 s) | **0.0684** | **0.0000** | **0.32** |
| i012–i015 | fade to black | ≤0.0001 | 0.0000 | 0.00–0.19 |
| i016–i026 | office / night | 0.0007 | 0.0294–0.0324 | 1.01 |

**The control is the interesting row, and it refutes the obvious classifier.**
The pre-intro cutscene reaches `textbox` = **0.1096**, *higher* than the intro
card's 0.0684. A "bright text in the middle" test — the first thing anyone would
write — fires on the cutscene and would call it an intro card. What separates
them is not the text at all: it is that the intro card is **pure black
everywhere else** (`outer` exactly 0.0000, against 0.0225–0.0259) and almost
perfectly smooth (`rough` 0.32 against 2.63–4.58). So the card must be
recognised by a *conjunction* — text present AND nothing outside it AND low
roughness — and any single-signal version of this is wrong in a way that fires
on the screen immediately preceding the one it is looking for.

Two consequences for how it gets built:

- **It must use fractional boxes, not `lifecycle-observe.py`'s model.** That
  model is sensor-bound at `screencap-2400x1080` and correctly refuses these
  1280x576 screenrecord frames — the fixture that exists is exactly the sensor
  the refiner will not read. Follow `nightpredicate.py`'s precedent (fractions
  of the frame, so both callers agree) rather than adding a second calibrated
  model per sensor, which is the duplication Plan 15 exists to stop.
- **Card detection generalises; the night number does not.** Every story night's
  card has this structure, so the conjunction above should find all six. Reading
  *which* night it says is a separate problem with separate evidence, and the
  identity contract needs the second, not just the first. Do not let a detected
  card stand in for a verified night.

Gate it the way this repository already gates classifiers: fit the thresholds on
the real frames, then prove the **decision** with synthetic fixtures generated by
a committed script (`testdata/make-title-fixture.py` and `test-screenstate.py`
are the two precedents). That is what makes the gate runnable on a clone that
has no captures.

*And a caveat that outranks all of the above.* **`captures/` is gitignored.**
Every fixture named here exists on one laptop and in no clone. A cold session on
another machine has none of it, so "the intro fixture exists" is a statement
about this working copy, not about the repository. Package 3's holdout set needs
somewhere to live before it can be a gate anyone else can run.

**Sensor binding, measured the same day** (a fact × sensor pairing Plan 15 wants
inventoried, so recorded here where it was found):

- The **night/gameover predicate is sensor-independent by construction.**
  `nightpredicate.py` expresses its boxes as fractions of the frame precisely so
  a 2400x1080 and a 1280x576 caller agree, and `screenstate.py` resizes anything
  else to 2400x1080. So `grade-night.py` reading a 1280x576 screenrecord is
  calibrated, not assumed.
- The **`other`-refinement model is sensor-bound**, and correctly refuses:
  1280x576 frames come back `unknown=sensor-mismatch:1280x576; this model is
  calibrated for screencap-2400x1080`.
- The consequence is a reporting seam worth knowing before it confuses someone:
  `lifecycle-observe.py` consults the authority *first* and returns
  `state=night` without ever reaching its sensor check, so the same tool, on the
  same video, answers confidently for one frame and refuses the next. Both
  answers are correct. Nothing in the output says which path produced them.

### 4. Qualify policies and budgets per story night

- Replay the conservative generated route across every per-night/per-hour AI
  table, ordinary and worst-source RNG, with actuator/human fault injection.
- Audit night-specific flashlight, music-box, Foxy dormancy/exposure, mask fuse,
  Balloon Boy availability, Golden Freddy availability, and office-entry timing.
- Decide per night whether to use the conservative shared route or a named
  simplified route. Absence of a character may remove a read only after a
  source rule and negative injection test support it.
- Emit a compact qualification report keyed by game configuration and policy
  hash.

**Gate:** every promoted story-night pairing meets explicit survival, resource,
human-slack, and observation-fault thresholds. Unsupported pairings are refused
locally before ADB.

### 5. Build a resumable campaign runner

- Accept one requested story night at a time and an optional bounded campaign
  range; default to one night, not unattended progression.
- Run `PREFLIGHT -> MENU -> INTRO_VERIFY -> ACTIVE -> TERMINAL_VERIFY -> SAVE_VERIFY`.
- Reuse Plan 10's observation/belief/action records and current focus, cleanup,
  epoch, watchdog, HID, and grading safety gates.
- Persist a Plan 09 manifest before launch and finalize it on every terminal,
  signal, or abort so a failed attempt can be replayed.
- Resume only from a verified save cursor; never reconstruct progression from
  filenames or a prior command's exit code.

**Gate:** mocked end-to-end tests cover one clear, one death, one abort, wrong
intro, missing Continue, save not advanced, process interruption, and resume.
No case sends gameplay input after an unverified lifecycle transition.

### 6. Use the fresh save as a story-night evidence ladder

- Before changing the save, retain a manifested fresh-title observation and
  verify the New Game guard.
- Run selected, explicitly authorized Night 1 evidence attempts, then proceed
  one story night only after its terminal/save gate closes.
- For Nights 1–5, capture per-night intro/menu/lifecycle holdouts and selected
  policy observations without mixing calibration and validation sessions.
- Compare observed deaths, timing, resources, and character availability with
  the simulator's per-night predictions; record corrections rather than tuning
  against a validation run.

**Gate:** each of Nights 1–5 has at least one fully manifested lifecycle run,
its classifiers have session-separated holdouts, and any simulator mismatch is
resolved or explicitly blocks progression claims.

### 7. Re-earn and validate Sixth Night

- Verify the title transition that unlocks Sixth Night after the Night 5 clear.
- Re-run the existing Night 6 route through the new generic lifecycle and
  per-night interfaces without weakening its current gates.
- Compare emitted actions and grading against the pre-refactor runner so
  all-night support cannot silently regress the best-studied route.
- Treat a Night 6 clear and the resulting Custom Night unlock as separate
  evidenced transitions.

**Gate:** Night 6 passes the existing exact, human, actuator, interpreter,
focus, watchdog, cleanup, and grader suites through the generic runner, plus a
manifested device cohort defined by Plan 12.

### 8. Configure and verify Custom Night / 10/20

- Observe the Custom Night screen and map the ten dials and Start control on
  the canonical target build.
- Set a requested dial vector idempotently, read it back visually, and hash the
  ordered configuration. Never infer 10/20 from the fact that Custom Night was
  opened.
- Model-gate the exact dial vector and bind it to the policy, sensor models,
  actuator configuration, and session manifest.
- Promote stock-device actions only through Plan 12's separate 10/20 gate; a
  story-night clear does not waive it.

**Gate:** synthetic and holdout fixtures detect every one-dial mismatch, stale
screen, wrong order, and unknown value. A verified all-20 vector is required
before the controller can start the canonical target.

## Test matrix

| Layer | Required coverage |
|---|---|
| Pure configuration | Nights 1–6, representative custom vectors, invalid nights/dials, menu/config mismatch |
| Exact simulator | ordinary and worst-source RNG, reachability of each threat branch, resource floors, deterministic replay |
| Fault model | human slack, device actuator, dropped action, stale/missing observation, wrong save cursor |
| Lifecycle fixtures | fresh title, Continue states, Sixth/Custom unlocks, six intro cards, 6 AM, death, minigame, static, focus loss |
| Mocked device flow | destructive-action refusal, one-night default, bounded advance, abort cleanup, manifest finalization, safe resume |
| Real device | session-separated per-night holdouts and promoted attempts only after all offline gates pass |

## Dependencies and sequencing

- Plan 09 package 2 must freeze the manifest/event contract before new
  fresh-save evidence is collected as promotion data.
- Plan 10 supplies the generic lifecycle/controller records and act-then-verify
  interface; this plan supplies the campaign and game-configuration states.
- Plan 12 remains the authority for device promotion and claims. Lower story
  nights create evidence; they do not make 10/20 safe by proximity.
- Plan 08 audio is optional for story progression and must not block menu,
  intro, terminal, or save verification.

Package 1 is safe to implement locally before any new device capture. Packages
2–8 must not cause a device action merely because a fresh save exists; each
action remains an explicit, scoped invocation by the device owner.

## Done criteria

The project can truthfully claim all-night support when it can start from a
verified fresh save, run and grade each requested story night under a qualified
policy, prove or refuse each save transition, unlock Sixth and Custom Nights,
verify an arbitrary Custom Night dial vector, and produce replayable evidence
for every attempt. Simulator coverage or title-button tapping alone is not that
claim.
