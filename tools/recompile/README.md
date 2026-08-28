# In-engine recompile toolchain

Toolchain for the faithful-recompile route of [Plan 17](../../plans/17-in-apk-bot.md)
(route 5): convert the owned FNaF 2 Android CCN through open-source Chowdren into
a separately-packaged research binary, then inject the pilot in generated C++.
The evidence contract and phase gates are in
[`docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md`](../../docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md).

**Everything here is content-free toolchain code** — a patch against open-source
Chowdren, a converter config, and two probe scripts. The owned `application.ccn`,
the APK, `res/raw` audio, `Assets.dat`, `image_cache/`, and all generated C++
**never enter the repository**. Run against copies held in an external experiment
directory (`/private/tmp/fnaf2-recompile.*` on the dev machine).

## Files

| File | What it is |
|---|---|
| `mmfparser-chowdren-mobile.patch` | Content-free source patch (`.py` / `.pyx` plus one Chowdren runtime header) forward-porting `fnmwolf/Anaconda`'s bundled `mmfparser` + Chowdren to the build-296 mobile CCN: image/font/sound/music banks, object and movement records, the Pillow `frombytes` fix, raw-payload capture for undecoded codes, and the arm64 `size_t`/`uint64_t` overload fix. |
| `fnaf2-config.py` | Chowdren `--config`: `get_missing_image` for placeholder image handle `(0,0)`, and an `init()` hook that synthesizes `game.extensions` entries from the frame items (`Layer` → native writer; `Multiple Touch` / `Android object` / `AndroidPlus` / `iOS Plus Object` → generic `ObjectWriter` stub). |
| `probe-unknown-params.py` | Dumps every event parameter whose code is past `parameterLoaders`, with the ACE it attaches to and its raw bytes. Requires the `Parameter.read` capture patch. |
| `probe-onloop.py` | Prints every `OnLoop` condition and its parameter loader — the probe that showed mobile loops are numeric `Short` indices, not name expressions. |

## Environment

Pinned base: **`fnmwolf/Anaconda` at `9b00bb4227cc3ddd6f7baefe06120368bd7226e9`**
(caps at Fusion build 293; build 296 is what the patch adds).

```sh
# 1. Clone the pinned base into an external dir
git clone https://github.com/fnmwolf/Anaconda anaconda && cd anaconda
git checkout 9b00bb4227cc3ddd6f7baefe06120368bd7226e9

# 2. Apply the mobile patch
git apply /path/to/repo/tools/recompile/mmfparser-chowdren-mobile.patch

# 3. Build the Cython image (see IN-ENGINE-PILOT-RECOMPILE.md
#    "Public toolchain recheck" for the Debian-archive apt fix)
docker build ...   # -> fnaf2-chowdren-phase1:local

# 4. Rebuild the .so modules after any .pyx edit
docker run --rm -v "$PWD:/work" -w /work fnaf2-chowdren-phase1:local \
    bash -lc 'pip install "Cython<3" >/dev/null; python build.py build_ext --inplace'

# 5. Convert (assets cached in <gamesrc> after the first run)
docker run --rm -e MMFPARSER_ANDROID_RAW_DIR=/input/android-res-raw \
    -v "$PWD:/work" -v "$EXTERNAL_INPUT:/input" -w /work/Chowdren \
    fnaf2-chowdren-phase1:local \
    python -u -m chowdren.run --config /input/fnaf2-config.py \
        /input/application.ccn /input/gamesrc
```

## State (2026-08-28)

Parse ✓ · assets ✓ · `write_objects` ✓ · event/frame C++ emission ✓ (29 real
frames; 4 known truncated debug stubs skipped). This is a **generation** gate
only: the emitted source still has inert compatibility paths and has not been
compiled, booted, or treated as retail-runtime evidence. The patch carries
(NebulaFD-sourced or confirmed against captured bytes):

- parameter loaders 67–72: `67`/`70` → `Int`, `68` → `ParameterVariables`,
  `69` → `ParameterChildEvent`, `71` → `Bug`, `72` → `Zone`; names + inert
  `convert_parameter` cases
- frame chunk `0x334C` (13132) = `FrameHandle`; `ChunkList.read` end-of-data
  guard (4 truncated `olivier_DEBUG_*` / `_GLOBALS` stub frames — real game is
  frames 0–28)
- `static_loop_name()` — mobile fastloops are numeric (`Short` index), so
  `write_loops` / `write_foreach` / `StartLoop` / `StopLoop` / `SetLoopIndex` /
  `Foreach` key on `loop_<index>`
- new system ACEs: cond `-42`/`-43` → `Always`, action `43` → `EmptyAction`
  (Fusion 2.5+ structural markers; `CHILDEVENT` object-scope list dropped)
- `GroupPointer` build-≥284 layout (int ID, `tell − 12` base; `Group` base
  `tell − 36`); `containers` also keyed by group id with a `pointer == 0`
  fallback in `Activate`/`DeactivateGroup` / `GroupActivated`
- Chowdren stubs: `RunningAs` → `Always`, `SetGlobalValueDouble` →
  `global_values->set`
- unknown mobile extensions become inert, instance-bearing `FrameObject`
  placeholders; static backdrops receive generated BackMagic-style lists;
  undefined frame-local instances/actions and malformed expressions are logged
  and omitted or replaced with `0` solely to complete source emission
- arm64 desktop portability: the duplicate `size_t` / `uint64_t`
  `number_to_string` overload is disambiguated in `base/stringcommon.h`

The completed run's derived unsupported inventory is printed at the end of the
converter output (not committed): Android/iOS/In-App, INI, Multiple Touch,
Perspective, KYSO, Calculate Text Rect, several system ACEs and unmatched
fastloops remain. The next boundary is **Phase 3 desktop compilation** of the
external generated target. The first arm64 CMake probe configures and clears a
`size_t`/`uint64_t` runtime overload conflict, then stops in generated events:
generic extension placeholders do not expose their emitted methods and some
unsupported system actions have no receiver. Repair those declaration/receiver
paths before a second link attempt. `Multiple Touch` remains a later pilot-hook
task.

Regenerate this patch after landing more:
`cd <anaconda> && git diff -- '*.py' '*.pyx' '*.pxd' '*.h' ':(exclude)*.cpp' ':(exclude)build/*' > tools/recompile/mmfparser-chowdren-mobile.patch`
