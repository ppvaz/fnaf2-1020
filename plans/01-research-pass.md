# Research pass: the 10/20 strategy landscape

**Status:** done — `MINUS-3-STRATEGY.md` and `VENT-CAMP-STRATEGY.md` (both
2026-08-19) cover the two lineages to their state of the art (Minus Toys / Minus Two
2025; brayden's timer strategy 2024), and `STRATEGY-HISTORY.md` consolidates the
whole timeline including Markiplier's July 2026 independent Minus 7 rediscovery
(timer-less, Foxy retired via the exposure meter). Remaining research is
per-mechanic verification, tracked in each doc's engine-gap list.
**Depends on:** nothing — this is the prerequisite for every other plan in this directory.

## Goal

A sourced write-up of the current FNaF 2 10/20 strategy meta, at the same standard as
`MINUS-7-STRATEGY.md`: what each strategy is, its exact input routine, which mechanics it
depends on, whether it has losable RNG, and its most recent community revisions.

Minimum coverage:

- **Minus 3** (Niko Frost lineage) — exact camera set, cadence, and latest revision.
- **Right vent camp** — the routine, its decision points, and its known RNG losses.
- Anything newer that has superseded either since late 2023.

## Why it comes first

- Plans 02 and 03 (new trainer modes) need the routines pinned down before any code.
- Plan 05 (deriving a new strategy) needs the meta to judge whether a result is novel
  or a rediscovery.
- This repo holds itself to `[SOURCED]` discipline in `src/config.js`; nothing gets
  taught by the trainer on my (Claude's) background knowledge alone.

## Work

1. Web research: community AI breakdowns, decompilation write-ups, strategy authors'
   own posts/videos (Niko Frost et al.), speedrun/challenge community docs.
2. For each strategy, map its mechanical dependencies against what `engine.js` models,
   and flag every dependency that is currently `[CALIBRATED]` or approximated
   (post-chokepoint routing is the known big one).
3. Write one doc per strategy (`MINUS-3-STRATEGY.md`, `VENT-CAMP-STRATEGY.md`, …) in
   the style of `MINUS-7-STRATEGY.md`, with sources inline.

## Primary sources: the decompilation itself

There is no public repository of decompiled FNaF 2 — it would contain the whole
game's assets, so distributing it is straight copyright infringement. The community
pipeline is: own a legal copy, run **CTFAK 2.0** (<https://github.com/CTFAK/CTFAK2.0>,
the Clickteam Fusion Army Knife) on it, and read the dumped MFA event sheets —
Clickteam events are close to readable pseudocode. Doing this against Pedro's own
copy would give us decompile-grade ground truth for every `[CALIBRATED]` constant
and every engine-gap question, instead of relying on second-hand write-ups.

Pedro's copy is the **Android** version (Google Play). That works: CTFAK 2.0 accepts
`apk` (and `ccn`) inputs directly, per its README. Pull the APK off the phone with
adb (`adb shell pm path com.scottgames.fnaf2`, then `adb pull`; watch for split
APKs/OBB expansion files carrying the assets) and feed it to CTFAK. Personal
research on an owned copy; nothing extracted gets committed or distributed.
Two version notes: (a) the mobile remaster is a 2019 Clickteam rebuild, while the
community strategies were developed against PC 1.033 — mechanics may differ (the
iOS timer overclock and the Android-only Golden Freddy bug in `src/config.js` are
known examples), so PC-sourced claims should not be assumed to transfer; (b) that
cuts both ways — the Android decompile is ground truth for the version Pedro
actually plays, which for this trainer is the truth that matters. If a PC-vs-mobile
discrepancy ever matters, the PC version is a cheap second reference.

Best second-hand source: the Technical-FNaF wiki (decompile-derived per-animatronic
pages). Fandom blocks plain fetches but its MediaWiki API works:
`curl "https://technicalfnaf.fandom.com/api.php?action=parse&page=<Title>&format=json&prop=wikitext"`.

## What the decompile buys the trainer itself (checklist for that session)

Beyond strategy research — things that would change what the trainer teaches or how
it grades:

1. **Exact animation lengths.** `MONITOR_ANIM` / `MASK_ANIM` are `[CALIBRATED]`
   guesses (15 frames), yet every `CYCLE_SCRIPT` offset and every millisecond grade
   is built on them. If the real animations are 13 or 17 frames, the whole lane is
   teaching offsets ~33–66 ms off. Highest-value single lookup.
2. **Android-port timing.** The trainer is a phone trainer and Pedro plays the
   Android build — the decompile of *that APK* gives its real tick rate and interval
   timing (the iOS port is overclocked; Android differences are unverified) plus the
   exact window of the Android-only Golden Freddy bug (`GF_UNFAIR_WINDOW`, currently
   a calibrated 18 frames). Could justify per-platform timing profiles.
3. **Grading-relevant mechanics now approximated:** `BLACKOUT_MASK_GRACE` (45),
   the mask consecutive-vs-cumulative question (drives lessons 7–8), forcedown
   pacing, Toy Bonnie's wait rolls, the D-offset quirk's exact form, and Withered
   Freddy's route (known wrong — Minus Two stalls him on CAM 03).
4. **Audio cue truth.** The duel lesson's ~0.7 s reaction window and every
   synthesised cue (BB's leaving bang, vent bangs, Mangle static) could be tied to
   the exact frame the game triggers its sounds.
5. **Exact RNG call structure** — makes worst-luck mode exactly adversarial and
   lets the published claims ("no unwinnable RNG", jitter tolerances) rest on the
   real distributions rather than modelled ones.
6. **Exact glitch/bug windows** (the double camera glitch's same-frame input, the
   1-frame blackout flash) — determines whether Minus Toys is even drillable on a
   touch screen and what tolerance to teach if so.

## Done when

Each strategy doc is complete enough that plan 02/03 could be implemented from the doc
alone, and each engine gap needed by a strategy is explicitly listed in that doc.
