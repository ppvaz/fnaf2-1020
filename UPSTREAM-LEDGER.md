# Contributions

Tracking ledger for giving back to the communities whose work this project builds
on. Every upstreamable patch, doc note, or finding produced along the way gets an
entry here so nothing useful dies in a scratchpad.

**House rules:** contributions contain only code patches and derived knowledge —
no game assets, no decompiled content, ever.

## Status legend

| Status | Meaning |
| --- | --- |
| candidate | Identified as worth contributing; artifact exists but nothing filed |
| prepared | Cleaned up into a submittable form (patch/PR branch/wiki draft) |
| submitted | PR, issue, or wiki edit is up and awaiting review |
| merged | Accepted upstream |

Each entry also carries a **Disposition**: how it should be published — upstream
PR, maintained fork, or a new tool repo of Pedro's own.

## Publication plan

The split, in one place:

- **Upstream PRs → CTFAK/CTFAK2.0:** the Linux port, the FTDecompile
  null-guards, and the headless usage docs note (entries 1–3). Small,
  defensible diffs. Caveat: upstream's last push was 2024-11; if the PR sits
  unreviewed, fall back to a maintained fork (e.g.
  `github.com/<pedro>/CTFAK2.0`, branch `linux-port`).
- **Pedro's own fork (no PR):** the Anaconda/mmfparser mobile-CCN patches
  (entry 4) — both existing forks are dormant/personal and the original
  matpow2 repo is gone; there is no live upstream to PR against.
- **Pedro's own new tool repo:** the CCN event dumper (entry 5), MIT-licensed,
  bundling the mmfparser fork, the dumper, the build recipe, and format docs.
- **Wiki edits / talk-page writeups (not a repo):** the mobile-build
  divergences and mechanics confirmations (entry 6).

## Entries

### 1. CTFAK Debian/Linux port — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0) (GitHub)
- **What it is:** Debian/Linux port of CTFAK 2.2 as an 8-file patch:
  - csproj retarget `net6.0-windows` → `net6.0`.
  - Platform-guarded `CTFAKCore.Init`: system libz via Joveler instead of
    `x64\zlibwapi.dll`; skip the `CTFAK-Native.dll` preload — its `TranslateTo*`
    P/Invokes have no callers and `decompressOld` is only for pre-Fusion-2.0 games.
  - `System.Drawing.Common` 7.0.0-preview → 6.0.0 plus the
    `System.Drawing.EnableUnixSupport` runtimeconfig option (7.x removed Unix
    support).
  - `Resources/Editbox.png` case-sensitivity fix.
  - `DrawArt2` divide-by-zero fix (`Console.WindowWidth`/`WindowHeight` are 0 on
    headless terminals; the `coeff` was unused).
  - `Console.Title` guards.
- **Artifact today:** `~/fnaf-apks/ctfak-linux-port.patch` is the source of
  truth on the original Debian workstation; it is not present on the current
  Mac. A clean reconstruction was successfully built in a Debian .NET 6
  container on 2026-08-20 and parsed Shooter25's Windows build-295 executable.
  That EXE path exposed one additional upstreamable guard: skip Windows-only
  PE icon extraction on non-Windows hosts. This is not a macOS port; native
  macOS execution remains untested and may need separate patches.
- **Disposition:** upstream PR to CTFAK/CTFAK2.0 — small, defensible diffs.
  Caveat: upstream's last push was 2024-11; if the PR sits unreviewed, fall
  back to a maintained fork (e.g. `github.com/<pedro>/CTFAK2.0`, branch
  `linux-port`).

### 2. CTFAK mobile-CCN robustness — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0)
- **What it is:** Null-guards in `FTDecompile.cs` for mobile CCNs: extension
  objects referenced by Android builds but absent from the Extensions chunk
  crashed Export as MFA with a `NullReferenceException`; they are now
  placeholder-named and logged.
- **Artifact today:** included in the same patch file,
  `~/fnaf-apks/ctfak-linux-port.patch`
- **Disposition:** upstream PR to CTFAK/CTFAK2.0, same PR as the Linux port;
  same fork fallback as entry 1 if it sits unreviewed.

### 3. CTFAK headless usage note — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0) docs
- **What it is:** The interactive menu's `Console.ReadLine` never receives piped
  stdin under Wine; the `-path` / `-tool "Export as MFA"` / `-closeonfinish`
  flags are the reliable non-interactive path.
- **Artifact today:** knowledge only; this entry is the record.
- **Disposition:** fold into the same upstream PR as entries 1–2, or a
  follow-up docs PR.

### 4. Anaconda/mmfparser mobile-CCN patches — **prepared**

- **Target:** Anaconda/mmfparser lineage
  ([fnmwolf/Anaconda](https://github.com/fnmwolf/Anaconda) and
  [gfktrin/AnacondaDecompiler](https://github.com/gfktrin/AnacondaDecompiler)
  forks)
- **What it is:** the patch set now works end-to-end — all 33 FNaF 2 frames
  dump. Full current set:
  - `build.py` Cython 0.29 fix (`Options.directive_defaults` →
    `get_directive_defaults()`).
  - `movement.py` guards for unknown movement types and undecodable movement
    records in Android builds.
  - `events.pyx` Android quirks: `ERes` has 4 extra bytes before size; `ERev`
    size field is 4 short plus an extra leading group-count int; a no-progress
    guard replacing a silent infinite loop; removal of a `code.interact()`
    debugging trap; unknown-parameter-code skip in `Parameter.read`.
  - `objects.pyx` `ObjectCommon` Android build>=290 layout — a byte-level
    reverse-engineered field map that is **original research**, not present in
    CTFAK either (slots: 4 movements, 6 values, 10 counter, 12 systemObject,
    14 extension, 16 flags, 18 createFlags, 20 qualifiers[8], 36 animations,
    40 strings, 42 newFlags, 44 preferences, 46 identifier, 50 backColour,
    54 fadeIn, 58 fadeOut).
  - `parameters/loaders.py` Group parameter: builds >= 293 scramble group
    names; substitute "Group N" the way CTFAK does instead of erroring.
- **Artifact today:** exported to `~/fnaf-apks/mmfparser-mobile-ccn.patch`
  (75 lines, 5 files); the patched, built, working clone lives durably in
  `~/fnaf-tools/anaconda` with its py27 build environment alongside.
- **Disposition:** Pedro's own fork, **not** a PR — both forks are
  dormant/personal and the original matpow2 repo is gone; there is no live
  upstream to PR against.

### 5. CCN datamining tool suite — **candidate**

- **Target:** Pedro's own new tool repo (suggested name: `ccn-mobile-datamine`
  or similar)
- **What it is:** a three-tool suite driving the patched mmfparser against
  Android Clickteam CCNs, proven on both FNaF 2 (33/33 frames, 25k event
  lines) and FNaF 1 (25/25 frames):
  - `dump_events.py` — per-frame readable event sheets plus the object list.
    Renders comparison operators, resolves object handles to names inside
    parameters, prints event-group and section flags, prefers the
    authoritative float slot over the garbage double slot in mobile
    expression literals, labels unknown mobile parameter codes instead
    of crashing, and applies the per-build handle-XOR (entry 8) so names
    land on the objects the runtime actually resolves.
  - `dump_animations.py` — per-object animation timings (frames, speeds,
    loop points) with derived durations from the Fusion tick model.
  - `group_tree.py` — Clickteam section-activation tree from a frame dump
    (nesting, inactive flags, ActivateGroup edges; `--find`/`--members`).
- **Artifact today:** all three in `~/fnaf-apks/`, plus the durable toolchain
  in `~/fnaf-tools/`.
- **Disposition:** new MIT-licensed tool repo bundling: the mmfparser fork as
  a git submodule or vendored subtree, the three tools, the build recipe
  (micromamba py27 + cython 0.29), and a README documenting the Android CCN
  format findings. Hard rule: the repo ships tooling and format documentation
  only — zero game assets or dumped game content.

### 6. Mobile-build divergences for the wiki — **candidate**

- **Target:** Technical-FNaF wiki / FNaF strategy community
- **What it is:** Once event-sheet constants are extracted and compared against
  the PC-1.033-derived wiki values: document mobile-build divergences (timer
  values, AI check cadence, Golden Freddy window, forcedown pacing) as derived
  constants and mechanics only — never extracted assets. Also worth publishing:
  the discovery that the shipped Android build derives from an August 2025
  "release 7" Clickteam project revision (embedded path
  `D:\Work\+Clickteam\+ProfessionalServices\...\release 7\FNaF2_mobile_20250825.mfa`,
  Fusion build 296), meaning PC-sourced strategy claims must be re-verified
  against mobile.
- **Extraction pass complete (2026-08-19); identity re-audit opened
  (2026-08-20).** The handle-scramble discovery (entry 8) revealed that the
  2026-08-19 dump carried bijectively swapped object names, including every
  Toy↔Withered pair. All numeric values below are safe (they come from event
  parameters); every *character-identity* claim (who owns which gate, route,
  or endgame branch) must be re-verified against the regenerated true-name
  dump before publication. Already re-verified post-fix: the camera-light
  stall is **live** — 400 frames (6.67 s) per flash from the never-rewritten
  `stun time` counter, with home-camera exclusions (8/9/11) and a
  `400 - 50*night` Paper Pals variant; the look-hold covers the Withereds
  (and monitor-up Mangle) and persists monitor-down because the
  selected-camera marker stays parked; Toys leave the Show Stage in
  Bonnie→Chica→Freddy order via co-occupancy gates. The community's 6.66 s
  stall figure is now decompile-confirmed on Android.
  Findings as originally extracted (identity claims pending re-audit):
  - Movement: every 5000 ms, `Random(20)+1 <= AI` per animatronic; AI
    counters hard-capped at 15; mid-night hourly escalation tables.
  - The full route graph for all movers, with three gate mechanics no
    community doc describes: nearly every final approach requires the
    monitor UP; Withered Bonnie's is inverted (monitor DOWN); the office
    light with cams down stalls most mid-route hops (Toy Chica exempt);
    a one-attacker-at-a-time mutex.
  - Office endgame: per-night mask-grace fuse of 100/80/60/55/50/50/45
    frames (the community's ~0.75 s figure is the night-7 value only);
    entry-to-inside triggers at `20 - 2*night` seconds of *continuous*
    cams-up time; mask-repel cooldown `Random(500)/night`; armed attacks
    ignore the mask; masked intruders leave at 1/10 per second.
  - Resources: flashlight battery is a per-night table — 7000/6000/5000/
    4000 frames on nights 1-4, 3000 (50 s of light) from night 5, warning
    blink at 500; the community's 50 s figure is the night-5+ value.
    Music box capacity 2000, wind +300/s, drain 40..120/s by night — and
    on night 1 the box does not drain until 2 AM.
  - Timing: clock advances via a global ticker at 1000 ms/tick, 70 ticks
    per hour; a global flag halves the tick to 500 ms — the mechanism
    behind the known iOS overclock. The music-box wind sound is a literal
    `Every 500ms` scheduler event, phase-locked to the movement-check
    clock — Markiplier's wind-tick metronome technique is exact, not
    approximate.
  - Port differences: the Puppet roams on mobile (rare-event tier); Mangle
    approaches through the opposite vent; the monitor's opening camera
    changes on night 7.
  - Verified against Markiplier's on-camera measurements where they
    overlap (mask grace, box drain at night 7).
- **Artifact today:** the rules above are established from the Office-frame event
  sheets, with implemented subsets tracked in `ANDROID-SOURCE-STATUS.md`. The
  camera-mechanism audit (including the retraction of the short-lived
  "disabled light-countdown" reading and the confirmed 400-frame stall) is
  recorded in `ANDROID-CAMERA-STALL.md`. The external writeup itself is not
  yet drafted; it should not go out before the identity re-audit closes.
- **Disposition:** wiki edits / talk-page writeups, not a repo.

### 7. Six-Seven post-mortem and Minus 7 re-derivation — **candidate**

- **Target:** the FNaF challenge-strategy community (the brayden/Shooter25
  lineage circles), distinct audience from the technical wiki.
- **What it is:** the first documented full cycle of simulator-derived
  strategy research: a search over a modeled route graph produced a
  two-camera candidate ("Six-Seven Strat"), the same day's decompile of the
  Android build refuted it (no two-camera cover exists under that extracted
  graph), and the search re-run over the Android graph independently
  re-derived Minus 7's 4-7-10 flash loop as a robust minimal cover. Android is
  now the canonical project target; PC comparison is explicitly deferred in
  `PC-DECOMP-CHECKLIST.md`.
  Methodological takeaway for the community: sim-derived candidates
  are hypotheses, and decompile-grade route graphs are the cheap first
  validation gate.
- **Artifact today:** `CAM-6-7-STRATEGY.md` (refutation header + preserved
  candidate doc) and the `STRATEGY-HISTORY.md` meta-thread entry.
- **Disposition:** community writeup (video-description-style doc or forum
  post) once the real-game validation of the rebuilt model lands.

### 8. Clickteam mobile handle-scramble discovery — **candidate**

- **Target:** three audiences — [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0)
  (issue + patch), the mmfparser/Anaconda fork (entry 4), and the technical
  FNaF/Clickteam datamining community (writeup).
- **What it is:** modern Clickteam Android runtimes XOR every FRAMEITEMS
  object handle with a **per-build constant** at load
  (`OI/COI.loadHeader`: `oiHandle = readAShort() ^ K`). Event bytecode,
  expression tokens, and frame instances address objects in the *post-XOR*
  space. No public decompiler applies this XOR, so every dump/MFA produced
  from an affected APK carries bijectively swapped object names — internally
  consistent, silently wrong. Known constants: FNaF 2 Android 2.0.7
  (Aug 2025) K=28; FNaF 1 Android (Aug 2025) K=0 (unaffected).
  - **Impact demonstrated:** the swap concealed FNaF 2's camera-light stall
    (`stun time` = 400 frames read as the zero-valued `time allowed`),
    inverted the Toy/Withered identities of every extracted rule, and
    survived two full audits — including raw-byte checks — because the
    stored bytes are genuinely at those handles; only the runtime remap was
    missing.
  - **Detection recipe for any APK:** decompile `OI/COI.loadHeader` from the
    bundled runtime and read K off the XOR; or heuristically, look for
    type-mismatched event targets (counter-typed events aimed at items the
    FrameItems table calls Actives) — a bijective scramble produces them, a
    correct map does not.
  - **Fix:** key the handle→name map by `storedHandle ^ K`
    (`dump_events.py` now takes K as an argument); CTFAK needs the same
    remap before FTDecompile name assignment.
- **Artifact today:** runtime proof chain + pair table in
  [`ANDROID-CAMERA-STALL.md`](docs/android/ANDROID-CAMERA-STALL.md); fixed dumper in
  `~/fnaf-apks/dump_events.py`; regenerated true-name dump
  (`~/fnaf-apks/fnaf2/events/`, pre-fix copy preserved alongside).
- **Disposition:** CTFAK upstream issue with patch (or fork branch per entry
  1's caveat), a section in the entry-5 tool repo README, and a short
  technical writeup for the datamining community — this affects **every**
  Clickteam Android title with a nonzero K, not just FNaF.

### 9. Shooter25 practice-mod architecture audit — **candidate**

- **Target:** this project's strategy/tooling documentation and, once cleaned,
  a technical note for the FNaF challenge-strategy community.
- **What it is:** a CTFAK inspection and successful 27-frame MFA export of the
  official build-295 `FNaF 2 Practice Mod` executable. It establishes that
  Shooter25's bot is an in-frame, direct-state Clickteam controller—not computer
  vision or external input automation—and inventories the practice modes,
  diagnostics, state labels, and long-run result counters without publishing
  game content.
  It also gives this project a clean architecture boundary: fixed Minus 7 uses
  an open-loop clock plus post-run classification; reactive stock-game policies
  use live CV; a personal instrumented build may instead read direct state.
- **Artifact today:** [`SHOOTER25-PRACTICE-MOD.md`](docs/in-engine/SHOOTER25-PRACTICE-MOD.md)
  and the derived controller/actuator ledger in
  [`SHOOTER25-BOT-STATE-MACHINE.md`](docs/in-engine/SHOOTER25-BOT-STATE-MACHINE.md).
  The downloaded executable, 223 MB MFA, and 8,182-line raw event dump remain
  temporary and uncommitted.
- **Disposition:** derived-knowledge writeup only. Do not publish the binary,
  extracted assets, or raw decompiled event sheet.

### 10. Chowdren CCN-recompile path for an in-engine pilot — **candidate**

- **Target:** the Anaconda/Chowdren lineage ([Xanfre/anaconda](https://github.com/Xanfre/anaconda),
  `FNAFSource/AnacondaDecompiler`) and this project's tooling docs.
- **What it is:** the recompile-based route to an in-engine, closed-loop pilot,
  scoped and de-risked 2026-08-20. Chowdren reads `application.ccn` directly and
  recompiles events → native C++ (no Fusion license, no PAIRIP), so the pilot can be
  injected as C++. Reusable findings:
  - Chowdren builds and runs on **arm64 in Docker** (`python:2.7-slim` +
    archive.debian.org apt + `Cython<3` / `Pillow<7`); the `build.py`
    `Options.directive_defaults` → `get_directive_defaults()` fix (same as entry 4's
    first item) applies to Chowdren's bundled mmfparser too.
  - **The mmfparser mobile-CCN patch (entry 4) is what unblocks the Chowdren
    converter, not a separate bridge.** Confirmed this session: stock Chowdren dies in
    exactly the image-bank / events / objects spots entry 4 patches. Because Chowdren
    sits on mmfparser, the CTFAK→JSON→adapter bridge originally scoped is redundant —
    once mmfparser parses, the converter consumes the game directly.
  - Confirmed CTFAK's event dump and mmfparser's model are the **same** Fusion-native
    ACE encoding `(objectType, num, objectInfo, typed-params)`, which is *why* the
    bridge is unnecessary.
- **Artifact today:** plan + phased build in
  [`IN-ENGINE-PILOT-RECOMPILE.md`](docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md); working arm64
  Chowdren build recipe + logs in the session scratchpad. The one-line Cython fix and
  the arm64/Docker recipe are the upstreamable bits.
- **Disposition:** fold the Cython fix + arm64 recipe into Pedro's mmfparser/Chowdren
  fork (entry 4's fork; no live upstream). The recompile *method* is a
  derived-knowledge note, not a repo.

### 11. Modern FNaF-mobile PAIRIP anti-tamper finding — **candidate**

- **Target:** the technical FNaF / Clickteam-mobile datamining community.
- **What it is:** the shipped `com.scottgames.fnaf2` v2.0.7 (release-7, Fusion build
  296) is wrapped in **Google Play PAIRIP** — `com.pairip.VMRunner`,
  `com.pairip.licensecheck.*` in the dex, `libpairipcore.so` in the arm64 split. It
  validates Play-install provenance + app signature and virtualizes protected
  methods, so **any repackage/re-sign of the retail APK crashes**. Consequence for
  datamining/modding modern Clickteam-on-Android titles: in-APK mods are not viable
  without anti-tamper circumvention; the tamper-free study path is **recompile from
  the extracted CCN** (entry 10), which never touches the signed binary. Derived
  knowledge only — no assets, no bypass tooling published.
- **Artifact today:** recorded in
  [`IN-ENGINE-PILOT-RECOMPILE.md`](docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md) (Route A).
- **Disposition:** short community/wiki note alongside entry 6's mobile-build
  divergences; affects every recent PAIRIP-wrapped Clickteam Android title, not just
  FNaF.
