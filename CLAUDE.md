# Repository operating contract

This is an evidence-bearing study of the modern Android FNaF 2 target. Keep
the five charter layers—Truth, Understanding, Decision, Embodiment, Proof—and
never silently promote a model or fixture result. Plan 12 owns promotion;
known negatives and retractions remain discoverable.

Ownership is directional: `@fnaf2-1020/core` owns mechanics and semantic
contracts; runtime schedules and supervises; adapters own capabilities,
calibration, and transport; trainer, research, and device are leaves.
`research/sandbox` may depend inward, never vice versa. Production never
imports tests, reports, mutable search knobs, DOM, shell, or device details
into core.

For a migration use characterize -> contract test -> change -> compare semantic
traces -> switch -> remove shim. Use explicit units/clocks and `UNKNOWN` for
missing or ambiguous measurements. A send is not game acceptance.

Device work is dry-run by default. Use a resolved, hashed profile, capability
preflight, exclusive lease, bounded commands/deadlines, retained telemetry, and
fail-safe release/abort. Never infer mode, geometry, coordinates, timing, ports,
or calibration from prose or conversation. No arbitrary shell is exposed to an
agent.

Start with `npm ci` and run affected gates plus `npm run device:dry-run`. Before
pushing run `npm run push-gate`, which runs the CI lanes against the pushed
commit in a throwaway worktree; the working tree is a different measurement
from CI's clean clone. `git config core.hooksPath .githooks` makes it automatic.
Finish by updating the structured progress/result record, citing its generated
evidence ID, and stating exactly what remains open; do not create a parallel
handwritten evidence log.

## Consequence lock (active, 2026-09-06)

A commit is **consequential** only if it advances a Plan 12 rung above
FIXTURE (real device evidence, a graded manifest, a promotion) or ships
trainer code. Everything else — docs, plans, gates, benchmarks, scaffolding,
refactors — is **bookkeeping**.

- The `commit-msg` hook refuses commits that touch only bookkeeping paths
  (`docs/`, `plans/`, `*.md`) unless the same commit stages device evidence
  under `artifacts/` or `docs/evidence/`, or the message carries
  `EVIDENCE:<path>` naming evidence from a prior commit.
- `PEDRO-OK` in a commit message is the human-only override. Agents never
  write it and never bypass hooks (`--no-verify`, `commit -n`).
- Start every session by naming the rung it will move and the physical
  artifact it aims to produce. If that artifact cannot be produced this
  session, say so and stop — no host-side substitute work.
- If device work is blocked because the phone is absent or locked, enqueue a
  Cue Helper job (`cue.queue.enqueue`) and end the device work there.
- When a route is refuted on device, the next commit is the next route's
  physical test or a decision request to Pedro — never further documentation
  of the refutation.
- End every session by reporting the consequential:bookkeeping commit ratio.
- A binding that wins on the phone, or that gets an `ANCHOR_AIMS` entry, is
  committed as `tools/device/campaign-night<N>-<name>-winner.json` in the same
  commit (`test-fact-register.mjs` refuses otherwise). `artifacts/` is
  gitignored: a winner that lives only there cannot be re-run on another
  machine, and on 2026-09-15 the k3 Night 7 bundle could not be rebuilt from
  the evidence records' knob deltas.

Standing directive (Pedro, 2026-09-06; target moved 2026-09-17): **laser-focus
on 6 AM successes on-device.** Night 6 is done (first 6 AM 2026-09-13) and so is
Night 7 (10/20, `golden-freddy`, 2026-09-14). The current execution target is
**Night 7 reliability and the promotion of what is already won**: the only
cohort is 3 wins in 10, and no result has a Plan 12 promotion edge. Nothing
outranks the next graded run bundle.

**Promotion is blocked on custody, not on merit (measured 2026-09-17).**
`npm run evidence -- list` sees 79 runs on this machine and **zero**
`DEVICE_MEASURED`: every winning bundle — Night 5's, Night 6 h's, Night 7 k2's —
is on the peer machine under gitignored `artifacts/`, so `evidence -- promote`
cannot be run against any of them here. Three winners are committed
(`campaign-night1-minimal`, `campaign-night6`, `campaign-night6-h`); the 10/20
winner is not. `UNTRACKED_WINNER_DEBT` stands at 13 of its ceiling of 13, so the
next untracked winner fails `test-fact-register.mjs`. Recovering those bundles is
the first step of any promotion, not a chore after it.

## Sensors and on-device code (Pedro, 2026-09-24/25 — start here, not with the old sensors)

- **A detector reads small regions of native frames.** The Cue Helper copies
  registered rectangles' raw pixels out of every MediaProjection frame
  (`REGION`, `NativeRegions.java`; host `openRegions()`, `native-regions.mjs`)
  and whole native frames on request (`SNAP`, `native-frame.mjs`) for title and
  menu screens. The rule that decides lives on the host, over those pixels.
- **Discontinued, never a starting point:** luma/mean-luma reducers, the 20x9
  point-sampled grid (`GRID`, `ScreenStats`, grid-fitted rules), and full-display
  `screencap`. Existing users are to be converted (FNaF 2's pipeline after
  recalibration), not extended.
- **Where they are still justified**, and only there: a luminance change IS the
  phenomenon (blackout, fade, a flash's timing) — computed over native region
  pixels, never the grid; per-pixel brightness thresholds for text glyphs; reading
  the 20x9 `grid_hex` already retained in old evidence; `screencap` only while the
  helper cannot run (before consent, after a crash) or as an independent witness.
- **A screenrecord costs the helper half its frames** (75 -> 37 distinct of 150
  REGION reads even at 1200x540, 2 Mbps; 2026-09-25). A closed-loop night that
  records itself must survive a starved capture; `420-c` did not at full size.
- **Everything that runs on the phone lives in the Companion**
  (`android/companion`). No separate APKs; a new on-device feature is a Companion
  feature. `tools/device/cue-helper-setup.sh` drives install and projection
  consent by named UI controls.

## Mistake register (2026-09-06 — check before acting; never repeat)

Each entry below cost a live attempt or a false diagnosis on 2026-09-06.

1. **Read a tool's own usage before the first invocation.** Sibling scripts
   differ in shape: `title-observe.py` reads the frame on **stdin** (a
   positional path argument is silently ignored and yields
   `unknown=unreadable-frame`), while `intro_card.py` takes a positional
   frame path. Never assume a uniform CLI across a directory.
2. **An observation-based rule must cite the measured row that backs it.**
   The title model's own table says the Continue band reads present
   (0.0264+) on *fresh* saves — Continue is always rendered on build 26.
   A "Continue visible means a save exists" refusal was wrong and blocked
   a live run. Before encoding any gate on an observation, re-read the
   calibration artifact that measured it.
3. **Operator statements are context, not premises.** "Fresh install" still
   required observing the save cursor before building the flow on it; the
   observed cursor was Night 1 with a rendered save. Observe the device
   state that a flow depends on; never encode an unobserved state.
4. **Re-derive every deadline when a port crosses executors.** A 15 s
   terminal wait was tuned for the machine lane (whose program blocks
   through the night) and starved the artifact lane (whose schedule returns
   while the game clock can trail by a minute). Port reuse is not timing
   reuse.
5. **Never report a test PASS you did not see print.** A wrong test path
   (`tools/test-bundle.mjs` vs `tools/device/test-bundle.mjs`) failed
   silently behind `> /dev/null 2>&1 && echo` twice before being caught.
   Confirm the file exists and the pass line is in the output before
   claiming green.
6. **Every aborted live attempt leaves the game mid-night.** After any
   abort or user kill, drive the device to a known state (game over ->
   menu) and verify it with the title observer before starting new work or
   ending the session.

## Mistake register (2026-09-11 — the floors, and the instruments)

Each entry below cost a wrong diagnosis or a wasted device run on 2026-09-11.

7. **A floor is anchored to a measurement plus a named margin, never to the
   route it protects.** `MONITOR_MASK_READY_MS` was defined as
   `MONITOR_ANIM_DOWN_MS + MIN_CONTACT_MS` = 400 with the comment "which is the
   +400 ms timing used by the Night 5 route" — and the route presses at exactly
   +400. `400 < 400` is false, so the one check that could have caught it passed
   in silence, and `test-artifact-animation-gates.mjs` pinned that boundary as
   correct. A constant defined as *what we already do* is a tautology that
   survives review because it looks derived. On the phone that zero cost about
   one cycle in eight. `test-seam-slack.mjs` now refuses a plan that clears any
   timing floor by less than 33 ms, and refuses a floor that does not stand that
   far above its own measurement.

8. **Ask the phone what it offers before proposing an instrument.** Run
   `npm run device:capabilities`. An agent proposed capturing Android input
   dispatch to explain a lost press, wired `atrace-input.sh` into the harness
   and spent a full night on it before learning this handset advertises
   `android.inputmethod` and no `android.input.inputevent` — so `inputtrace.py`
   had no app dispatch source and correctly reported NO APP DISPATCH SLICES.
   `plans/PROGRESS.md` had already recorded the same negative on 2026-08-30.

9. **A measurement in a comment is not a gate.** The native frame trace behind
   the mask timing (button absent through 322 ms, faint at ~337 ms, fully
   visible at ~382.5 ms) lived only in a comment while the constant carried the
   route. If a number decides behaviour, put it where a check reads it.

10. **A number measured in one direction does not transfer to the other.**
    `actuator.mjs`'s seam table ("at 180 ms or more, 0 of 17 lost") is a MONITOR
    press after a MASK press. The Night 5 defect is the reverse order. The same
    error was made twice in one session: a `maskTicks: 4` band label was read as
    "widen the mask window", and the model then scored a wider window identically
    at every phase, refuting it.

11. **Read a tool's own computed output before deriving the same quantity by
    hand.** `phase-reconstruct.mjs` already reports `model.lossBands`. An agent
    instead ran `minus-toys-margin.mjs`'s `edge()`, which stops at the first
    failure and is valid only for a contiguous basin, and published a "408 ms
    cliff" for a response that is banded and periodic — condemning a 1320 ms run
    the model actually scores 3000/3000.

12. **An absent observation is evidence only when the rule has read the positive
    state in the same run.** `monitorUp->true` graded MISSING on 4 of 5 cycles
    while the monitor rule read `true` twice in 266 samples: that is a blind
    detector, not a lost press. `run-report.mjs` now refuses to call a miss
    systematic below five positive reads of that target.

13. **A gate registered only in a lane CI does not run is not a gate.**
    `test-grade-run-coverage.mjs` sat in `tools/test.mjs`'s ENGINE group, which
    only `npm run test:legacy:engine` invokes and which CLAUDE.md itself
    describes as holding intentionally red controls. It had been failing on 11
    scripts, `phase-reconstruct.mjs` among them — which is exactly why two
    sessions ran that by hand. Structural gates belong in `npm run test:unit`.

Canonical routes: [charter](PROJECT-CHARTER.md),
[architecture](docs/architecture/README.md),
[contracts](docs/architecture/generated/contract-register.json),
[commands](docs/architecture/generated/command-registry.json),
[evidence policy](docs/evidence/README.md),
[device safety](docs/operations/DEVICE-SAFETY.md),
[device capabilities](tools/device/capabilities.mjs),
[progress](plans/PROGRESS.md). The full legacy campaign is explicit as
`npm run test:legacy:engine`; intentionally red scientific controls are not
part of the green edit lane. Historical incident notes remain in
[`docs/operations/CLAUDE-HISTORY.txt`](docs/operations/CLAUDE-HISTORY.txt).
