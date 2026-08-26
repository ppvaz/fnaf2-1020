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
| 1 | 100/100 | 99/100 | 2148/7000 | 0 | unreachable, template n6 s7 | 0 |
| 2 | 100/100 | 77/100 | 2148/6000 | 3 | sampled n2 s7 | 167 |
| 3 | 100/100 | 89/100 | 2148/5000 | 2 | reseeded n3 s2 | 103 |
| 4 | 100/100 | 85/100 | 2148/4000 | 3 | sampled n4 s7 | 202 |
| 5 | 100/100 | 78/100 | 2148/3000 | 5 | sampled n5 s7 | 362 |
| 6 | 100/100 | 46/100 | 2148/3000 | 9 | sampled n6 s7 | 558 |

Night 1's zero reads across 100 replays is the control on its `reachable:
false`: the table and the engine are two independent statements, and the matrix
fails if they disagree. **These are simulator figures** — no night below 6 has
ever been attempted on the device, and nothing here is a device clear or a
claim that one policy is right for every night. That decision is package 4's.

### 2. Add a save-safe title/menu observer and selector

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

**Result (partial — no completion credit), 2026-08-26.** The selector, the
capability and the refusals exist; the classifier for the real build does not,
and cannot until a title frame is captured.

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

What did not land, and why the package stays open. **There is no title model
for the target build.** The bullet "classify the title items actually visible
on the target build" needs labelled title frames, the local capture root holds
none, and the save that would have produced them was lost before anything
captured it. So the observer answers `no-title-model` on a real device and the
selector refuses — correct behaviour, not a placeholder, but it means **no
route can currently select a night on the phone.** That is a deliberate
consequence of this plan's own invariant ("a missing expected title item aborts
before any gameplay tap"): the previous behaviour was a blind tap at a
coordinate for an item that a fresh save no longer shows.

The fixtures are synthetic and prove the plumbing only. They say nothing about
where the real items are or how bright they are; `title-observe.py --measure`
over captured frames is how the first real model gets built, and the refusal
message says so. Unblocking this is one capture session, not code.

### 3. Identify night start, win, death, and save advancement

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
