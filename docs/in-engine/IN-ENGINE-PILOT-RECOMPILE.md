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

### Phase 2 — the mobile event format (2026-08-28)

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

**2. `parameterLoaders` runs 0–66 here; build 296 uses codes 67–72.** Captured
raw payloads and the ACE each attaches to:

| code | ACE (objectType / num) | size | raw payload (sample) | likely meaning |
| --- | --- | --- | --- | --- |
| 67 | System cond −40 (`RunningAs`) | 8 | `04000000` / `03000000` / `00000000` | int32 runtime-kind enum |
| 68 | Active cond −25 / −41; Extension cond −25 | 80 | 76 bytes, leading `11000000…` / `01000000…` | new fixed-width compare/alterable-value struct |
| 69 | System cond −43 / action 43 | 16 / 12 | `01000000 2b000000 ffffffff` / `00000000 ffffffff` | int32 fields + trailing `-1` sentinel |
| 70 | Active action, num 0 | 8 | `01000000` | int32 immediate |

Each needs a loader class registered in `parameterLoaders`, and Chowdren's
writers must then consume it.

**3. Frames 29–32 do not parse** — `frame.load()` raises `error('1 bytes
required')`. **Resolved:** those four are truncated developer stub frames
(`olivier_DEBUG_SelectFrame`, `_SUBS`, `_SoundTest`, `olivier_GLOBALS`), 100–130
bytes each, with a header and name but no `LAST` marker. The real game is frames
0–28 (`01-Initialize` … `29-Options`; the Night is frame 3, `04-Office`). Fix:
`ChunkList.read` stops at end-of-data instead of raising. Frame chunk `13132` is
`FrameHandle` (one `int32`); registered.

### Phase 2 — fixes landed and the next boundary (2026-08-28)

All in `tools/recompile/mmfparser-chowdren-mobile.patch`:

| gap | fix |
| --- | --- |
| parameter codes 67–72 | `67`/`70` → `Int`; `68` → `ParameterVariables` (flags + up to 4 `{index, op, value}`); `69` → `ParameterChildEvent` (count + `uint16` pairs); `71` → `Bug` no-op; `72` → `Zone`. Names added to `names.py`; inert cases in `convert_parameter`. |
| numeric loops | `static_loop_name()` helper: `Short` loop index → `loop_<index>`, used by `write_loops`, `write_foreach`, `StartLoop` / `StopLoop` / `SetLoopIndex` / `Foreach`. **`write_loops` and `write_foreach` pass.** |
| frame stub desync | `ChunkList.read` end-of-data guard; `13132` → `FrameHandle`. |
| new system ACEs | System condition `-42` (`GroupStart`), `-43` (`ChildEventsCondition`) → `Always`; System action `43` (`ChildEvents`) → `EmptyAction`. Structural markers Fusion 2.5+ writes on every group; the `CHILDEVENT` object-scope list is dropped (fidelity caveat — 87 of the 189 carry a non-empty list). |
| `GroupPointer` alignment | Build ≥ 284: ID is a 32-bit field and the pointer resolves against `tell − 12` (per NebulaFD `ParameterGroupPointer`); `Group` param base is `tell − 36`. `containers` is also keyed by group `id`, and `Activate`/`DeactivateGroup` / `GroupActivated` fall back to it when `pointer == 0`. |
| `RunningAs` condition | → `Always` (dev-branch gate; a `RunningAs <non-app>` branch would wrongly activate — fidelity caveat, like the `(0,0)` image). |
| `SetGlobalValueDouble` action | → `global_values->set` (Chowdren globals are doubles). |

**Next boundary:** event C++ generation now runs deep (past loops, foreach, group
activation) and stops in `get_object_handle` with **`KeyError: (20, 40, 0)`** —
an action operates on an `AndroidObject` (extension type 40) instance that the
synthesized-extension stub does not register in `name_to_item` / `all_objects`.
The 14 synthesized stub extensions need full **object-instance** registration in
Chowdren, not just a `game.extensions` entry. Also open: `Could not find loop
'loop_3'` (a `StartLoop` with no matching `OnLoop` in-frame), and the
`multipletouch_*` generated groups (expected — `Multiple Touch` becomes the pilot
input hook, WP4).

**Scope remaining.** The structural blockers — loops, foreach, group pointers,
the frame parse, the parameter table — are cleared. What's left is extension
stub-object coverage, then the per-ACE grind, then desktop build + boot.

### Phase 2 — complete source emission (2026-08-28)

The next external rerun cleared the `AndroidObject` instance lookup and exits
successfully after writing the generated C++ for all **29 real frames**. The four
already-classified truncated developer frames (29–32) are skipped. This passes
the Phase-2 generation gate only; it does not establish a compilable, runnable,
or faithful binary.

The patch now gives unsupported extensions an inert but instance-bearing
`FrameObject` fallback, provides static backdrops with generated BackMagic-style
lists, and logs/omits unresolved frame-local objects. It also converts an
unbalanced expression to `0` and makes static-backdrop overlap inert so source
emission can finish. These are deliberate compatibility placeholders, not
semantic implementations.

The converter's end-of-run inventory records unsupported Android/iOS/In-App,
INI, Multiple Touch, Perspective, KYSO, Calculate Text Rect, several system
ACEs, and unmatched numeric loops. Generated source remains external. The next
phase is desktop compilation: capture the first compiler-error classes, then
replace only the necessary extension/runtime paths before attempting a boot.

### Phase 3 — first arm64 compiler boundary (2026-08-28)

An external Debian arm64 CMake configure completed with SDL2, OpenAL and OpenGL.
The first runtime-only error was a duplicate `number_to_string(size_t)` /
`number_to_string(uint64_t)` overload; build-296’s Chowdren base now spells the
latter as `unsigned long long`, which clears that host portability issue. The
compiler then reaches generated event translation and fails on the expected
stub semantics: generic `FrameObject` extension placeholders lack emitted
extension methods, and some system actions have no valid receiver after a
placeholder/unsupported-ACE path. Thus **Phase 3 has started but has not linked**.
The next repair slice is a minimal no-op extension writer that declares the
specific generated method surface, plus receiver-safe handling for the first
unbound system actions; no boot attempt is authorized by this result.

### Phase 3 — second arm64 compiler boundary (2026-08-28)

The follow-up patch makes unsupported ACEs explicit inert writers: actions are
omitted, conditions are false, and expressions have a marked numeric fallback
whose containing comparison becomes false. It also omits object actions that
have no recoverable receiver rather than guessing one from nearby conditions,
and adds the default-instance lookup needed when a static backdrop is used as
an expression target. The regenerated external source again completes for the
29 real frames.

The same arm64 CMake probe now compiles generated event units 1–16 before
stopping on three separate representation mismatches: an empty qualifier list
is emitted as an invalid initializer; numeric mobile loop indexes reach the
string-keyed runtime API; and static backdrop selection still calls
`ObjectList` selection methods on a flat vector. No link or boot was attempted.
The next slice must model those three cases explicitly, then rerun from a clean
external generation. These compatibility omissions mean this remains a compiler
probe, not a fidelity result.

### Phase 3 — linked desktop target; first runtime boundary (2026-08-28)

The next compatibility slice supplies the empty-qualifier sentinel, turns
numbered mobile loop-index expressions into the generated loop keys, and keeps
static backdrop selection bookkeeping inert while supporting its default lookup
and flat-vector traversal. It also makes receiver-free `Never` conditions and
unsupported-expression actions safe before their C++ receiver is emitted. With
those strictly compatibility-oriented paths, the external arm64 CMake build
completes and links the desktop target.

That is not a boot pass. The first direct process attempt lacks a container video
and audio device and exits during SDL initialization. A second attempt with dummy
SDL/OpenAL drivers initializes OpenAL but segfaults before any visual state can
be observed. Therefore there is no title transition, selected-night transition,
or runtime-fidelity evidence. Next: obtain a display-capable external runtime
probe or capture a symbolized crash at the dummy-driver boundary; keep the
generated target, binary, and logs external.

### Phase 3 — visual boot reached; crash is now in generated event code (2026-08-28)

Both open items above are answered, and the "segfaults before any visual state"
sentence above is **withdrawn** (kept per the retractions rule): it was a
consequence of the SDL *dummy video* driver, not of the binary.

Environment (external Debian-buster arm64 container, `chowdren-build` base +
`cmake libsdl2-dev libopenal-dev libgl1-mesa-dev gdb xvfb mesa-utils`):

```sh
cd <external>/gamesrc        # CWD must be the dir holding Assets.dat — the
                             # binary opens "./Assets.dat" (base/assetfile.cpp:56)
export LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe ALSOFT_DRIVERS=null
xvfb-run -s "-screen 0 1280x720x24" ./build-linux/Chowdren
```

- Run from the wrong CWD → `BaseFile::seek` SIGSEGV in `init_assets` (null
  `./Assets.dat` handle, no open-failure check). Not a code fault — a CWD/asset
  layout requirement. With `SDL_VIDEODRIVER=dummy` the window never renders and
  an unrelated null-GL segfault masks this.
- Run correctly (real Xvfb + llvmpipe 3.1, `ALSOFT_DRIVERS=null`): the process
  **renders an SDL window**. First run without null audio drew a real in-engine
  modal — *"Could not open audio device"* with an OK button — proving GL context,
  text render and event loop are live. With null audio the log reaches:
  `Audio initialized … / Renderer: llvmpipe … / Setting frame: 0 / Frame set`,
  then SIGSEGV.

Symbolized crash (`gdb -batch -ex run -ex bt`):

```
#0 Counter::set(double)                         this == 0x0
#1 Frames::on_frame_1_start_events()   → event_func_44  (events_1.cpp)
#5 GameManager::run / update / update_frame
```

`event_func_44` (event `59_0`) is
`((Counter*)get_instance(playvoice4_3_instances))->set(randrange_event(1000)+1);`
— the 1-in-1000 menu RNG roll. `get_instance(ObjectList&)` returns `back_obj`,
which is `NULL` here: **frame 1 ("01-Initialize & Setup") never adds
`playvoice4_3` or `star1_4`** (`on_frame_1_init` emits 11 objects), yet frame 1's
start events act on both. Those objects *are* emitted for frames 2–3
(`events_2.cpp` `on_frame_3_init`), so this is a **frame-1-specific object-instance
emission gap** in the patched converter — the README's "undefined frame-local
instances … are omitted" path dropping instances on this frame that resolve on
later frames — compounded by conditions on event 59 being emitted as blank
(`event_func_44` has empty condition lines; cf. `event_func_37`'s `if (!((false)))`).

This is `rebuilt-runtime` progress only: the engine boots and enters real decoded
event logic, but no frame has drawn game content and no title/night transition
has occurred. Next slice: fix frame-1 instance resolution in the converter (or,
as an explicit compatibility placeholder, make generated single-object actions
no-op on a null `get_instance`), then rerun the boot and compare frame-1→title.

### Tooling survey (2026-08-28) — NebulaFD is the reference spec

The Fusion-decompiler landscape was checked for a shortcut:

| tool | lang | state | verdict |
| --- | --- | --- | --- |
| `fnmwolf/Anaconda` (`mmfparser`, in use) | Python | current, caps at **build 293** | the base; needs the 296 port |
| `AITYunivers/NebulaFD` | C# (.NET) | **active** (2026-07, commits re "re-reading ccn file for Android") | reads build-296 Android CCN; has event/parameter/expression model + MFA export |
| `CTFAK/CTFAK2.0`, `CTFAK-UnEx` | C# | archived 2024 | dead |
| `CTFAK/CTFAK` | C++ | dead 2021 | dead |
| `FNAFSource` / `gfktrin` `AnacondaDecompiler` | Python | last touched 2018 / 2021 | older than what we have |

No maintained Python option exists. Taking on NebulaFD as a **runtime** dependency
means a C# process in the pipeline plus a large adapter onto Chowdren's
`mmfparser` object model (the "CTFAK→JSON→adapter bridge" this doc's Phase-0 note
called redundant — it stops being redundant only if the in-place port fails).

**Chosen approach: port `mmfparser` in place, using NebulaFD's C# source as the
byte-layout spec.** That keeps the pipeline Python-in-Docker with no new tools,
and NebulaFD's readers remove the reverse-engineering guesswork. The specs pulled
this session (`Nebula.Core/Data/Chunks/FrameChunks/`):

- **Parameter code → type**, build 296 (`Events/Parameter.cs`): `67` and `70`
  and `26`(when build ≥ 296) → **`Int`**; `68` → **`ParameterVariables`**
  (3 × uint32 flags, then up to 4 × `{int32 index, int32 op, int32|double value
  +skip4}`); `69` → **`ParameterChildEvent`** (`int32 count`, `count·2` × uint16,
  skip 4); `72` → **`Zone`**. Confirmed against the captured raw payloads.
- **Loop parameter is a `Short` index by design** (code `11`). Not a bug — the
  fix is Chowdren-side: `write_loops` / `StartLoop` must key on
  `"loop_<index>"` instead of a name expression.
- **Frame chunk `0x334C` (13132) = `FrameHandle`** — a single `int32` (the
  frame's handle). `mmfparser`'s frame-chunk table ends at 13130 and mis-sizes
  it, which is what desyncs frames 29–32. Add the handler.
- App chunks `8774 / 8781 / 8783 / 8796` still need identifying in NebulaFD's
  `AppChunks/`.

Fallback if the in-place port hits pervasive silent mis-parses (`mmfparser` and
NebulaFD disagree on more codes than the gaps above): NebulaFD → MFA export →
load in licensed Clickteam Fusion 2.5 → re-export a desktop CCN Chowdren fully
supports. Adds a paid tool and a manual step; keep it in reserve.

Toolchain (content-free, committed): `tools/recompile/` — the build-296
`mmfparser-chowdren-mobile.patch`, `fnaf2-config.py`, and the two probes, with
`tools/recompile/README.md` for setup. External, uncommitted: the parsed CCN +
`android-res-raw/`, the populated `gamesrc/cache.dat` + `image_cache/`, and the
applied/rebuilt Chowdren checkout.

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
