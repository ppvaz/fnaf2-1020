# Shooter25 practice mod: forensic comparison

*Research note, 2026-08-20. The executable was obtained from the author's
official [GameJolt page](https://gamejolt.com/games/Shooter25Mods/826595),
inspected as data, and never executed. No binary, assets, or decompiled event
dump are stored in this repository.*

## Result

Shooter25's `FNaF 2 Practice Mod` is a modified Windows Clickteam game, not an
external mouse/keyboard bot. Its bot is an in-frame state machine with direct
access to game objects. That makes it the closest existing precedent for an
instrumented FNaF build, but not a replacement for this project: the mod is a
PC practice laboratory for brayden's reactive timer strategy, while this repo
is an Android-sourced Minus 7 curriculum, simulator, strategy-search workbench,
and stock-device validation harness.

The most useful lesson is architectural. A fixed Minus 7 run does not need
live classification; its controller can remain an absolute-time schedule and
computer vision can grade the recording afterward. A branch-heavy strategy
like brayden's needs either live visual/audio classification when controlling
the stock game externally, or direct game state when implemented inside an
instrumented build. Shooter25 chose the latter.

## What was established

The official package API supplied release 1.1.0's
`fnaf-2-practice-mod.exe` (265,010,301 bytes; SHA-256
`528110634edb1f70b7735d1341d7462a762af6af54138c397bfee442ea200e27`). It is
a 32-bit PE Clickteam executable. A patched CTFAK 2.0 run parsed it as Fusion
build 295, game title `FNaF 2 Practice Mod`, with 27 frames. The main gameplay
frame contains 885 event groups. CTFAK's full `Export as MFA` plugin then
translated all 27 frames and wrote a 223,021,441-byte MFA. Therefore the answer
to “can the Clickteam EXE be decompiled like the APK?” is concretely **yes**.
The resulting MFA has not been opened in Fusion or proven rebuildable.

This used the project's previously discovered **Debian/Linux CTFAK port**, not
a macOS port. The original patch was made for Debian and is documented in
`UPSTREAM-LEDGER.md`; on this Mac, a clean CTFAK checkout was reconstructed and
built inside a Debian .NET 6 container. The Windows executable was parsed
there. Native macOS execution remains untested and may require different
patches. CTFAK officially describes support for both EXE and APK/CCN inputs,
so the extraction is the same broad technique used on the Android game, but
the container and file-format paths are different.

The extracted object and event metadata proves that the mod includes:

- selectable worst-case Foxy, forced-blackout, timing-feedback, frozen-Puppet,
  maximal-Toy-Bonnie, hostile-BB, unchanged-AI, and bot-play modes;
- on-screen mask, camera, winding, Foxy, location, and kill-timer diagnostics;
- persistent/displayed AI wins, deaths, and winstreak counters;
- one `#AI` controller object with eight alterable values, flags, and a current
  action string;
- explicit bot states including `Wind`, `Stalling`, `Checking`, `Blackout`,
  `Toy Bonnie`, and `Vent Character`;
- branches that read the real music-button fill value, mask state, blackout
  values, office danger, Toy Bonnie/vent state, and internal timers, and that
  drive transitions through Clickteam fastloops.

That combination rules out computer vision and external input automation for
the bot itself. It is deterministic controller logic living beside the game
logic. A second expression-token pass reconstructed its output layer and major
transitions: three countdowns drive the left vent, hall, and right vent lights;
flags raise/drop the camera, select CAM 11 and wind, raise/lower the mask, and
pan the office. The complete derived transition ledger is in
[`SHOOTER25-BOT-STATE-MACHINE.md`](SHOOTER25-BOT-STATE-MACHINE.md). One complex
countdown expression was subsequently decoded from Clickteam's operator table;
the exact meaning of one accumulator and a few long OR groups remain unresolved.

Shooter25 and brayden's public guide describes the bot as playing the strategy
perfectly and reports 104 wins and one death, including its first 100 wins in
a row. That is a measurement of the PC strategy/mod combination, not an
Android win-rate claim.

## Is it only the mod, or also the PC game?

It is the full PC gameplay event sheet plus Shooter25's changes, not a detached
bot payload. The strongest proof is structural: `#AI` conditions are added as
alternate triggers inside the same later event groups that process normal
panel, mask, winding, panning, and light input. The extraction also contains
the underlying character routes, scheduler, office queue, Foxy, music box,
battery, animations, and sound events.

That means the artifact contains enough material to *locate* almost every item
in [`PC-DECOMP-CHECKLIST.md`](../android/PC-DECOMP-CHECKLIST.md). It cannot by itself make
those items stock-PC-confirmed: the base version has not been independently
established and any relevant event may have been modified. This project now
uses Android as its mechanics source of truth anyway, so the practical use of
the PC extraction is narrower and cleaner: recover Shooter25's policy and
practice-tool architecture, and record apparent parity only as supporting
evidence.

For this build, event handles map directly and semantically to the extracted
objects; the effective correction is XOR 0. The confirmed XOR-28 behavior is
from the Android runtime and must not be copied onto this PC dump.

## Comparison

| Dimension | This project | Shooter25 practice mod |
| --- | --- | --- |
| Canonical target | Modern Android release 7, Fusion build 296 | Modified PC game, Fusion build 295 |
| Player teaching | Ten-step curriculum, reduced-threat lessons, rhythm lane, millisecond input grades, calibration, full reports | In-game scenario toggles and timing/debug feedback |
| Mechanics work | Decompiled-source ledger, explicit sourced/calibrated/inferred labels, simulator tests | Direct reuse and modification of the PC game's own state |
| Strategy evaluation | Seed sweeps, worst-luck runs, timing-jitter curves, camera-cover and gate-aware search | Long-run wins/deaths/streak from a perfect embedded policy |
| Real-game automation | Stock Android via ADB; Minus 7 is open-loop and post-run graded | Embedded, reactive, state-aware controller |
| Observability | Screen recording plus offline classification; source dumps outside the game | Direct counters, flags, objects, and debug text inside the game |
| Reproducibility | Open source, no game assets, deterministic models and scripts | Distributed executable; policy is inspectable only by reverse engineering |
| Main strength | Pedagogy, transparency, Android research, strategy experimentation | Fidelity and responsiveness within its modified PC target |
| Main limitation | No stock-device full-night clear or live reactive controller yet | Not the stock game, not Android, and narrower as a general research/training system |

The projects overlap in timing feedback and automated policy evaluation, but
their centers of gravity differ. Shooter25 built a game-native laboratory. We
built a teaching product plus a mechanics and policy research stack, then
added a black-box device oracle.

## Should we modify the APK?

Yes, eventually—but as a separate instrumented research build, not as the next
step for Minus 7 and not by mutating the installed retail copy in place.

The useful progression is:

1. Keep stock-APK ADB runs as the ground-truth oracle. For Minus 7, use the
   absolute-time runner and post-run grading; adding live CV would only add
   latency to a policy that does not branch.
2. Build a separately signed/package-named instrumentation fork with read-only
   state overlays and an input timestamp/event log. This is the lowest-risk
   way to expose the facts that screenshots cannot.
3. Add scenario forcing and a game-native controller only when testing
   reactive strategies. Log every observed state, chosen branch, and action so
   a run is auditable.
4. Revalidate conclusions on the untouched stock app. Event ordering, missing
   extensions, re-signing, or rebuilding from a decompiled MFA can all change
   behavior, so a mod is an experimental instrument rather than ground truth.

The practical hurdle is not whether the event logic can express the tool—it
clearly can—but producing a faithful Android rebuild. The decompiled MFA uses
mobile-only extensions, and editing/re-exporting requires Clickteam Fusion plus
the Android exporter on Windows. Directly editing the packaged CCN would avoid
some editor dependencies but needs a trustworthy writer/repacker and still
changes the signature. Either route should remain personal-use-only and must
not place extracted assets or binaries in this repository.

## What to borrow

The highest-value ideas to reproduce are forced hostile scenarios, live timing
grades, a policy-state label, and persistent win/death/streak counters. The
browser trainer should retain its lesson ladder and rhythm coaching; the
instrumented build should stay a thin observability/scenario layer. For a
reactive bot, make the policy a small explicit state machine and use direct
state in the mod, with CV as the stock-game cross-check.

## Reproduction record

- Official demo/guide: [A Brand New FNaF 2 Strategy (Guide + FNaF 2 Bot)](https://www.youtube.com/watch?v=EYtIOKRuQqE)
- Official download page: [Shooter25 Mods — FNaF 2 Practice Mod](https://gamejolt.com/games/Shooter25Mods/826595)
- Decompiler: [CTFAK 2.0](https://github.com/CTFAK/CTFAK2.0)
- Temporary local artifacts only: downloaded EXE, patched CTFAK checkout,
  223 MB exported MFA, and an 8,182-line metadata/event dump under
  `/private/tmp`; none were committed.
