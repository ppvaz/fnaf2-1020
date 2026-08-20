# In-engine pilot via CCN recompile — findings and plan

*Investigation 2026-08-20. Extends [`TRAINER-IN-GAME.md`](TRAINER-IN-GAME.md).
Sibling to the on-device adb work in [`ON-DEVICE-VALIDATION.md`](ON-DEVICE-VALIDATION.md).*

## The question

Can the practice-bot "pilot" be moved **inside** the game — reading `viewing` /
`mask` / Foxy `D` / `battery life` directly and driving input in-engine, frame-
accurate and closed-loop — instead of the open-loop adb touch injector that keeps
dying to Foxy? Two candidate routes were examined: **inject into the APK**, and
**recompile the CCN to native C++**.

## Why "pilot the phone" (adb) is not enough

The adb injector (`tools/device/trial-minus7.sh`) fires scripted `input swipe`
presses at wall-clock times, gated by a coarse visual watchdog. It is **blind and
wall-clock-timed**: it cannot read game state, so a dropped or mis-aimed press is
invisible until the jumpscare. The recurring 6th-Night Foxy death was diagnosed as
a **miscalibrated office hall-light coordinate** (shared with the camera-feed light,
valid only on the camera feed) — the office hall never actually flashed. Codex split
it (hall `(1400,330)`, left-vent `(350,615)`) and was mid-revalidation. That fixes
*this* death, but the structural blindness remains, which is what motivates an
in-engine pilot for reactive strategies. **Minus 7 itself stays external** (open-loop,
no state classification needed during a run — see `TRAINER-IN-GAME.md`).

## Route A — inject into the APK: BLOCKED

- Owned copy: `com.scottgames.fnaf2` v2.0.7 (versionCode 26 = the release-7 target).
  Game logic is `res/raw/application.ccn` (89 MB, Fusion CCN, magic `PAMU`, handles
  XOR-28 scrambled).
- **PAIRIP anti-tamper is present**: `com.pairip.VMRunner`,
  `com.pairip.licensecheck.LicenseClient/LicenseActivity/InitContextProvider` in the
  dex, `libpairipcore.so` in the arm64 split. PAIRIP validates Play-install
  provenance + app signature and virtualizes protected methods, so **any repackage /
  re-sign → integrity failure → crash**. Defeating it is anti-tamper circumvention
  (rooted LSPosed `pairipfix`, stripping license components, "APK-repair" tools) — the
  wrong arms race for a personal study bot.
- **No free CCN recompiler back to an APK exists.** CTFAK / CTFAK-UnEx / Anaconda are
  decompilers/dumpers + Export-as-MFA. The only supported CCN→APK round-trip is
  Clickteam Fusion 2.5 + the Android Exporter DLC (paid, Windows) — and its output
  would still be PAIRIP-blocked on re-sign.

**Conclusion:** in-APK injection is not viable without cracking anti-tamper. Do not
pursue it. This use case is *homebrew study of an owned copy*, not distribution; the
recompile route below reaches the same place without touching the retail binary.

## Route B — recompile the CCN to native C++ (chosen)

Feed the extracted `application.ccn` to an open-source Fusion **recompiler** we build
ourselves — no Fusion license, no PAIRIP, because it produces *our own* binary. The
pilot is injected as C++ in the generated source. Cost: it validates a
**reimplemented runtime**, not the shipped Android binary (same fidelity caveat as a
PC rebuild) — but it runs the *actual decoded event logic*, which the JS simulator
cannot.

### Tool choice: Chowdren (not NuclearRT)

- **NuclearRT** is a Fusion *exporter* (`nuclearrt.bld` installs into Fusion's Runtime
  dir) — needs a Fusion license, reintroducing the blocker. Self-described as not
  production-ready. Rejected.
- **Chowdren** (Anaconda lineage; `Xanfre/anaconda`, `FNAFSource/AnacondaDecompiler`)
  reads a `.ccn` **directly** and recompiles events → C++. Clickteam used Chowdren for
  the **official FNaF console ports**, so FNaF-on-Fusion → native is production-proven.
  Chowdren sits **on top of mmfparser** (the same parser lineage the project already
  forward-ported — see below).

### What was proven this session (2026-08-20, on the Mac, arm64)

- Chowdren builds and runs on arm64 in Docker: `python:2.7-slim` + archive.debian.org
  apt + `Cython<3` / `Pillow<7`; one patch (`Options.directive_defaults` →
  `Options.get_directive_defaults()` in `build.py`). mmfparser compiled (17 Cython
  `.so`); `chowdren.run` executes. Repro artifacts in the scratchpad:
  `anaconda/` (Xanfre clone, patched build.py) + `Dockerfile.chowdren` +
  `chowdren_ingest*.log`.
- **Stock Chowdren cannot parse the modern CCN**: it dies in the image bank
  (`zlib: incorrect header check`; `struct.error: EOF` with `loadImages=False`), plus
  5 unknown top-level chunk types. Root cause: the 2012-era mmfparser predates Fusion
  build 296. **This is exactly where CONTRIBUTIONS entry 4 already patches.**
- **The bridge we scoped is unnecessary.** CTFAK's event dump and mmfparser's model
  are the *same* Fusion-native encoding — condition/action `(objectType, num,
  objectInfo, typed-params)` with the same loader types (`AlterableValue`,
  `ExpressionParameter`, `KeyParameter`, comparison). So a CTFAK→JSON→adapter bridge
  is redundant: once mmfparser parses the CCN, Chowdren consumes it directly.

### The actual path: forward-port mmfparser, then let Chowdren consume it

The Codex session **already forward-ported mmfparser to the build-296 mobile CCN**
(CONTRIBUTIONS.md **entry 4**, `~/fnaf-apks/mmfparser-mobile-ccn.patch`, 75 lines /
5 files; working clone `~/fnaf-tools/anaconda`; 33/33 FNaF 2 frames dump). Those
artifacts live on the **other Debian machine**, not this Mac. The patch set:
- `build.py` Cython 0.29 fix (already reproduced here).
- `movement.py` guards for unknown/undecodable movement records.
- `events.pyx` Android quirks: `ERes` +4 bytes before size; `ERev` size field 4-short
  + extra leading group-count int; no-progress guard; remove `code.interact()` trap;
  unknown-parameter-code skip in `Parameter.read`.
- `objects.pyx` `ObjectCommon` Android build≥290 byte-map (original research; slots:
  4 movements, 6 values, 10 counter, 12 systemObject, 14 extension, 16 flags, 18
  createFlags, 20 qualifiers[8], 36 animations, 40 strings, 42 newFlags, 44
  preferences, 46 identifier, 50 backColour, 54 fadeIn, 58 fadeOut).
- `parameters/loaders.py` Group parameter build≥293 name-scramble → "Group N".

Chowdren bundles **its own copy** of mmfparser; entry 4 patched a sibling clone. The
patches are same-lineage and should port onto Chowdren's `mmfparser/` tree.

## Phased plan (0–5)

- **Phase 0 — de-risk probe.** Smallest end-to-end slice: one ACE (e.g. `set Active
  alterable-value 0 = 1` under `Every 5000 ms`) through the converter to compilable
  C++, proving the converter contract. *(Interface mapped this session: converter
  reads `game.frames[].events` with `.conditions`/`.actions`/`.qualifier_list`,
  `game.frameItems.itemDict`, `game.header`, etc.)*
- **Phase 1 — apply the mmfparser mobile-CCN patch to Chowdren's `mmfparser/`** (from
  entry 4), rebuild the Cython `.so`, and get `chowdren.run application.ccn gamesrc`
  to parse to GameData without dying in the image bank / events / objects.
- **Phase 2 — generate C++.** Drive the converter over the parsed game; fix the
  first wave of `expression not implemented` / missing system-ACE writers as they
  surface (per-ACE, discoverable at generation).
- **Phase 3 — extension + asset stubs.** OT 35 Steamworks → Chowdren already has it;
  **Multiple Touch → replace with the pilot input hook**; KYSO / In-App / iOS → no-op
  stubs; blank image/sound assets so the C++ builds. System objects (counters,
  Actives, Ini, strings, timers, keyboard) are already covered.
- **Phase 4 — desktop build + boot to a night.** First fidelity checkpoint: does the
  recompiled game reproduce the shipped schedule? Cross-check against the JS sim and
  `ANDROID-SOURCE-STATUS.md`.
- **Phase 5 — inject the pilot** as C++ reading `viewing`/`mask`/`D`/`battery life`
  and driving input in-engine. Payoff: frame-accurate, full-state, closed-loop.

## Continue-here checklist (for the machine with `~/fnaf-tools` / `~/fnaf-apks`)

1. Bring `mmfparser-mobile-ccn.patch` to the Chowdren clone; apply to `mmfparser/`,
   rebuild (`python build.py build_ext --inplace`, Cython<3, Py2.7).
2. `python -m chowdren.run application.ccn gamesrc` — expect it to now clear the
   image bank / events / objects (Phase 1 done when it parses).
3. Generate + desktop-build (Linux/Mac path: CMake + SDL2/OpenAL); log every
   unimplemented ACE/extension (Phases 2–3).
4. Boot to a night, compare schedule to the sim (Phase 4), then inject the pilot
   (Phase 5).

## Risks (honest)

- Chowdren system-ACE coverage gaps → fill per-ACE writers as they surface at
  generation.
- mmfparser object-model invariants the converter assumes (handle resolution,
  ordering) — the patched parser must satisfy them.
- Residual CTFAK/mmfparser build-296 decode gaps (the project already hit the XOR-28
  scramble — entry 8).
- Fidelity: Chowdren's runtime ≠ the shipped Android runtime; this runs the real
  decoded event logic on a reimplemented engine — its one advantage over the JS sim,
  but still a reimplementation.
- Python 2.7 (parser/converter) toolchain is legacy but working.

**Hard rule (unchanged):** personal study of an owned copy only. No game assets, no
decompiled content, no distribution of a modified binary — ever.
