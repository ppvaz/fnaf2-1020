# In-engine pilot via CCN recompile — findings and plan

*Investigation 2026-08-20. Extends [`TRAINER-IN-GAME.md`](TRAINER-IN-GAME.md).
Sibling to the on-device adb work in [`ON-DEVICE-VALIDATION.md`](../device/ON-DEVICE-VALIDATION.md).*

## The question

Can the practice-bot "pilot" be moved **inside** the game — reading `viewing` /
`mask` / Foxy `D` / `battery life` directly and driving input in-engine, frame-
accurate and closed-loop — instead of the open-loop adb touch injector that keeps
dying to Foxy? Two candidate routes were examined: **inject into the APK**, and
**recompile the CCN to native C++**.

## Why "pilot the phone" (adb) is not enough

The adb injector (`tools/device/trial.sh`) fires scripted `input swipe`
presses at wall-clock times, gated by a coarse visual watchdog. It is **blind and
wall-clock-timed**: it cannot read game state, so a dropped or mis-aimed press is
invisible until the jumpscare. The recurring 6th-Night Foxy death was diagnosed as
a **miscalibrated office hall-light coordinate** (shared with the camera-feed light,
valid only on the camera feed) — the office hall never actually flashed. Codex split
it (hall `(1400,330)`, left-vent `(350,615)`) and was mid-revalidation. That fixes
*this* death, but the structural blindness remains, which is what motivates an
in-engine pilot for reactive strategies. **Minus 7 itself stays external** (open-loop,
no state classification needed during a run — see `TRAINER-IN-GAME.md`).

## Route A — inject into the APK: REOPENED AS A FOCUSED CAMPAIGN

- Owned copy: `com.scottgames.fnaf2` v2.0.7 (versionCode 26 = the release-7 target).
  Game logic is `res/raw/application.ccn` (89 MB, Fusion CCN, magic `PAMU`, handles
  XOR-28 scrambled).
- **PAIRIP anti-tamper is present**: `com.pairip.VMRunner`,
  `com.pairip.licensecheck.LicenseClient/LicenseActivity/InitContextProvider` in the
  dex, `libpairipcore.so` in the arm64 split. The owned target's tested
  repackage/re-sign path fails integrity and crashes; Google describes the protection
  class as runtime installer and anti-tamper checks designed to detect modification,
  not as a mathematical guarantee that every same-process attachment is impossible.
  Rooted runtime attachment, scoped LSPosed/Zygisk modules and static repair are now
  separate Plan 17 hypotheses rather than one undifferentiated bypass bucket.
- **No free CCN recompiler back to an APK exists.** CTFAK / CTFAK-UnEx / Anaconda are
  decompilers/dumpers + Export-as-MFA. The only supported CCN→APK round-trip is
  Clickteam Fusion 2.5 + the Android Exporter DLC (paid, Windows) — and its output
  would still be PAIRIP-blocked on re-sign.

**2026-08-20 conclusion, now narrowed:** ordinary modify/repackage/re-sign is not
viable against this PAIRIP-wrapped build. That is a recorded negative for one route,
not proof that every same-process route is closed. Pedro reopened the goal on
2026-08-28 for focused exploration, including read-only runtime attachment,
Java/native hooks, loader/shim approaches, CCN mutation/rebuild and the recompile
route below. The campaign and its falsifiable gates live in
[`plans/17-in-apk-bot.md`](../../plans/17-in-apk-bot.md). Personal study of an owned
copy and no distribution remain hard boundaries.

## Route B — recompile the CCN to native C++ (active fallback)

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

### Public toolchain recheck (2026-08-28, Mac arm64)

The parser toolchain itself was revalidated from a clean shallow checkout of
`fnmwolf/Anaconda` at `9b00bb4227cc3ddd6f7baefe06120368bd7226e9`. This is only a
toolchain check; no owned CCN was present or read.

- The stock `python:2.7-slim` image initially failed before dependency install because
  its Buster `deb.debian.org` / security mirrors no longer carry Release files. A
  recipe that does not switch those entries to `archive.debian.org`, remove the dead
  `buster-updates` line, and set `Acquire::Check-Valid-Until=false` is no longer
  reproducible.
- With that archive adjustment, `build-essential`, `g++`, `libjpeg-dev` and
  `zlib1g-dev`, plus `Cython<3` and `Pillow<7`, the one-line
  `Options.directive_defaults` → `Options.get_directive_defaults()` compatibility
  change built all **17** mmfparser extension modules. A fresh container imported
  `Events` and `ObjectCommon` successfully.
- Cython emits generated `.cpp` files beside the source, so run this in a disposable
  external clone (or clean it afterwards); those files are tool build output, not
  a mobile-parser patch. This check did **not** apply the recovered 75-line mobile
  patch, parse `application.ccn`, generate game C++, or establish any runtime
  fidelity.

The verified build command shape, with `<anaconda>` outside this repository, is:

```sh
docker run --rm -v <anaconda>:/work -w /work python:2.7-slim bash -lc '
  sed -i -e "s|deb.debian.org/debian|archive.debian.org/debian|g" \
         -e "s|security.debian.org/debian-security|archive.debian.org/debian-security|g" \
         -e "/buster-updates/d" /etc/apt/sources.list
  apt-get -o Acquire::Check-Valid-Until=false update
  apt-get install -y --no-install-recommends build-essential g++ libjpeg-dev zlib1g-dev
  pip install "Cython<3" "Pillow<7"
  python build.py build_ext --inplace
'
```

Apply the mobile patch only after this stock-toolchain gate succeeds, then repeat
the build before attempting the owned input. The separate recompile probe contract
below records the next evidence boundary.

### The actual path: forward-port mmfparser, then let Chowdren consume it

The Codex session **already forward-ported mmfparser to the build-296 mobile CCN**
(UPSTREAM-LEDGER.md **entry 4**, `~/fnaf-apks/mmfparser-mobile-ccn.patch`, 75 lines /
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

## Recompile probe contract and evidence boundary

This is the repeatable, no-content-in-Git contract for the faithful-recompile
fallback. It exists because an apparently encouraging parser message is not a
recompiled game, and a recompiled game is not the untouched Android runtime.
The companion Plan 17 route ledger records which route was tried and where it
stopped; this section records the recompile route's phase evidence.

### Preconditions and run record

- Use an owned `application.ccn` and the recovered mobile-CCN patch only from
  storage outside this repository. Do not copy either into the worktree or an
  output directory under it.
- Start from a clean, revision-pinned Chowdren checkout. Record the checkout commit,
  patch-file hash, input hash, host/OS, Python/Cython versions, and exact commands
  in an ignored experiment record. Hashes identify the inputs without publishing
  them; paths and raw output can reveal proprietary material and remain local.
- Give generated C++, build trees, binaries and logs an external experiment
  directory. The only repo-facing evidence is a derived summary: phase reached,
  exit status/signal, counts, and a short non-content error classification.
- Apply the patch with a clean-tree check first. A patch conflict means **Phase 1
  did not run**; do not hand-edit around it and label the result as a successful
  forward port.

### Re-derived Android patch — 2026-08-28

Using an owned, currently installed v2.0.7 copy on the unlocked research device,
the CCN was extracted only to an external experiment directory. The input and
patch hashes are retained there, not in Git. A newly reconstructed 299-line patch
was applied to a pristine Chowdren revision-pinned clone, rebuilt under Py2.7 with
`Cython<3`, and exercised against that external input.

The structural `GameData` parse completed at mobile build 296 with **33 frames**
and **782 image records**. The 2026-08-28 asset pass then decoded all 782 image
payloads, parsed **7** real font records, and bound all **67** APK audio resources
to their CCN descriptors. This owned build's music bank is genuinely empty. The
raw audio resources and all generated media remain outside Git and are supplied
to the parser from the external experiment directory. This is still a Phase-1
*sub-gate*, not a converter or boot pass.

The refreshed patch also contains the previously identified mobile event/object
layout handling, guarded unknown parameter/movement records, real Android media
bank support, and current Cython/Pillow compatibility adjustments. It is an
external research artifact and must not be committed with the owned CCN, APK
resources, or generated output.

### Phase gates

| phase | bounded action | evidence required to pass | not sufficient |
| --- | --- | --- | --- |
| 1 — parse | Rebuild Chowdren's bundled `mmfparser` after applying the recovered patch, then invoke `python -m chowdren.run <owned-ccn> <external-gamesrc>`. | The command exits successfully after constructing `GameData`; log the frame count and parser warnings without serializing events or assets. | A successful Cython build, or getting past only the image bank. |
| 2 — generate | Let the converter write C++ to the external output directory. | Converter exit success plus a derived count/classification of unsupported ACE writers and extensions. | A parsed CCN with no generated translation unit. |
| 3 — build | Compile the generated desktop target with the declared stubs/runtime. | Link success and a runnable binary identity in the local record. | Source generation or a binary that immediately terminates. |
| 4 — boot | Start the desktop binary and reach a selected night through normal input. | Timestamped title → night transition plus a minimal derived event/timing trace compared with the sourced model. | A title screen, a menu click, or visual similarity alone. |
| 5 — pilot | Add the smallest bounded controller: observe a named state, choose one reversible action, and log requested/accepted frame numbers and effect. | Repeated state → decision → action → state-effect traces without screen/ADB timing in the control path. | An input fired on a timer, a debug print with no transition check, or any result labeled as retail-runtime. |

For Phase 1, the expected command shape is deliberately only
`python -m chowdren.run <owned-ccn> <external-gamesrc>`: the concrete paths and
the patch are experiment artifacts.  If that command fails, retain the *first*
parser boundary (image bank, events, objects, or converter contract) and return to
the matching patch hunk. Do not skip ahead to extension stubs or pilot code.

### Phase 2 — generate boundaries (2026-08-28)

The cache-backed converter rerun (`chowdren.run` over the same externally parsed
build-296 CCN, assets already in `cache.dat` / `image_cache/`) clears parse and
asset creation — it writes `Assets.dat` and processes the 108 subtitle files and
the shader set — then **stops in C++ generation, at `write_objects`.** The
boundaries hit so far, in order:

1. **`NotImplementedError: invalid image: (0, 0)`** —
   `writers/objects/system.py:write_pre` resolves an object direction frame whose
   image handle is the placeholder `(0, 0)` (also `(332, 0)`, `(334, 0)`, … — a
   `handle, game_index` pair the mobile runtime never draws). Stock
   `configs/default.py` raises here. A one-function research config
   (`get_missing_image` → first real image, the `configs/fp.py` approach) passes
   it; ~15 substitutions are logged across four `ObjectInfo` objects.
2. **`ValueError: need more than 0 values to unpack`** in
   `mmfparser/data/chunkloaders/extensions.py:fromHandle`, from
   `converter.py:get_object_impl`. **`game.extensions.items` is empty** — the
   mobile-CCN patch does not parse the extension list — while `game.frameItems`
   references extension object types `40` (*Android object*), `42` (*iOS Plus
   Object*), `43` (*AndroidPlus*), `46` (*Multiple Touch*) and `47` (*Layer
   object*). With no parsed extension the converter cannot map the handle to a
   writer.

Both were cleared with a game config (`fnaf2-config.py`, external):

- **image `(0, 0)`** — `get_missing_image` → first real image (`configs/fp.py`
  approach). ~40 substitutions logged. A fidelity compromise, not a clean pass;
  revisit before any boot comparison.
- **empty extension list** — the config's `init(converter)` hook synthesizes one
  `game.extensions` entry per distinct extension `objectType` in the frame items,
  handle `objectType - 32`, name from a small map: `47` → Chowdren's native
  `Layer` writer; `46`/`40`/`43`/`42` → names with no Chowdren writer, which
  `load_extension_module(..., use_default=True)` resolves to the generic
  `ObjectWriter` stub. `Multiple Touch` (46) becomes the pilot input hook in a
  later phase (Plan 17 WP4); for now it is a stub.

### Phase 2 — third boundary: the mobile event format (2026-08-28)

With the config in place the converter clears **all of `write_objects`** and
reaches event/frame generation (`write_frame` → `write_loops`), then stops:

```
chowdren/writers/events/system.py:323, write_loops
  items = parameter.loader.items
AttributeError: 'Short' object has no attribute 'items'
```

Investigated with a raw-payload capture patch on `mmfparser`'s `Parameter.read`
(`events.pyx`: store `self.raw` for codes past the table instead of discarding)
plus two probe scripts (`probe-unknown-params.py`, `probe-onloop.py`, both in the
recompile experiment dir). The mobile event format differs from build-293
`mmfparser` in several independent ways:

**1. Loops are numeric, not named.** The mobile `OnLoop` condition (System
num −16) has **one parameter, code 11 → `Short`**, holding a small integer
(1, 2, 3, …). Desktop Fusion puts a `FASTLOOPNAME` expression there (the loop
*name*), which is why Chowdren reads `parameter.loader.items`. `StartLoop`
(System action 14) is the mirror. Chowdren's entire loop machinery
(`write_loops`, `StartLoop.get_loop_names`, `get_loop_running_name`, …) is
name-keyed, so this needs a mobile mode: derive a stable name (`loop_<index>`)
from the `Short`, or recover a fastloop-name table if one of the unknown app
chunks holds it.

**2. `parameterLoaders` runs 0–66 here; build 296 uses codes 67–70.** Captured
raw payloads and the ACE each attaches to:

| code | ACE (objectType / num) | size | raw payload (sample) | likely meaning |
| --- | --- | --- | --- | --- |
| 67 | System cond −40 (`RunningAs`) | 8 | `04000000` / `03000000` / `00000000` | int32 runtime-kind enum |
| 68 | Active cond −25 / −41; Extension cond −25 | 80 | 76 bytes, leading `11000000…` / `01000000…` | new fixed-width compare/alterable-value struct |
| 69 | System cond −43 / action 43 | 16 / 12 | `01000000 2b000000 ffffffff` / `00000000 ffffffff` | int32 fields + trailing `-1` sentinel |
| 70 | Active action, num 0 | 8 | `01000000` | int32 immediate |

Each needs a loader class registered in `parameterLoaders`, and Chowdren's
writers must then consume it.

**3. Frames 29–32 do not parse at all** — `frame.load()` raises
`error('1 bytes required')`, i.e. the frame-chunk stream desyncs. `unknown chunk
13132` (past the stock frame-chunk table, which ends at 13130) is the prime
suspect; `unknown chunk 8774 / 8781 / 8783 / 8796` are the app-level equivalents.
These four frames are likely gameplay frames, so this is on the critical path,
not cosmetic.

**Scope.** This is a build-293 → build-296 `mmfparser` port: ~4 parameter loaders,
a mobile loop mode in `mmfparser` **and** Chowdren, ≥2 unknown chunk formats, and
the frame-parse desync. It is the bulk of the remaining Phase-1/2 work. A newer
`mmfparser`/CTFAK fork that already targets Fusion 2.5+ may shortcut parts of it.

External artifacts for the next session (all outside Git, under the recompile
experiment dir): the parsed CCN + `android-res-raw/`, the populated
`gamesrc/cache.dat` + `image_cache/`, `fnaf2-config.py`, `probe-unknown-params.py`,
`probe-onloop.py`, and the `events.pyx` raw-capture instrumentation in the
Chowdren tree.

### Fidelity labels

Every result must carry exactly one label:

- **retail-runtime** — untouched Play-installed package; the oracle only.
- **hooked-retail** — untouched package files with an explicitly recorded approved
  research environment; not established by this recompile route.
- **rebuilt-runtime** — the Chowdren/other independently packaged result. It can
  validate decoded event logic and controller shape, but it is never evidence that
  stock Android accepted the same action/timing.
- **model-only** — `src/engine.js` or a derived simulation result with no executable
  rebuild observation.

The first pilot acceptance criterion is intentionally the Foxy hall reset from
Plan 17: read Foxy `D` and blackout, assert hall light only when the controller's
condition is true, then log the relevant state change. It is one scalar read and
one reversible output, so it demonstrates the whole closed loop without claiming a
full-night strategy or retail fidelity.

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
