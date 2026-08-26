# Campaign recovery and all-night support

**Status: proposed 2026-08-26 after the target-device save was lost.** The
exact simulator already models story Nights 1–6 and Custom Night, but the
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
| Night 1 | AI table, resources, fuses, and lifecycle duration modeled | `New Game` coordinate exists but no gated route may select it | New Game resets progress; no save-state/night-card verification; recipe construction assumes a BB attack sample that cannot occur here |
| Nights 2–5 | Per-night/per-hour AI and resource tables modeled | `Continue` can be tapped, but the runner refuses it | The title button does not say which night the save cursor owns; no positive identity or clear/advance proof |
| Night 6 | Exact plan, human gate, runner, sensors, and graders exist | Current sole supported route through the `6th Night` title item | Still lacks a positive win classifier and manifested lifecycle record |
| Night 7 / Custom | Custom AI dials modeled; 10/20 is the canonical target | No unlocked-menu setup or dial verification | Must distinguish Custom Night configuration from story progression and verify all ten dials before input |

A local probe on 2026-08-26 found that the unchanged generated policy clears
Nights 2, 4, 5, and 6 at **300/300** exact replays and passes the current
`+/-60 ms` human-slack gate on each (77/100, 85/100, 78/100, and 46/100).
Nights 1 and 3 fail during *recipe construction*, not replay, because
`build()` requires its fixed seed to exhibit a Balloon Boy attack cycle. That
is a template-extraction bug: a low-threat night may legitimately have no such
cycle. These numbers are local design evidence, not device clears.

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

### 1. Remove the Night-6 construction assumption

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
