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
| `mmfparser-chowdren-mobile.patch` | Source patch (`.py` / `.pyx` only) forward-porting `fnmwolf/Anaconda`'s bundled `mmfparser` + Chowdren to the build-296 mobile CCN: image/font/sound/music banks, object and movement records, the Pillow `frombytes` fix, and `Parameter.read` raw-payload capture for undecoded codes. |
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

Parse ✓, asset creation ✓, `write_objects` ✓, **`write_loops` ✓**. The patch now
carries (all NebulaFD-sourced or confirmed against captured bytes):

- parameter loaders 67–72: `67`/`70` → `Int`, `68` → `ParameterVariables`,
  `69` → `ParameterChildEvent`, `71` → `Bug` (no-op), `72` → `Zone`; names added
- frame chunk `0x334C` (13132) = `FrameHandle` (one `int32`)
- `ChunkList.read` stops at end-of-data (build-296 leaves 4 truncated
  `olivier_DEBUG_*` / `_GLOBALS` stub frames with no LAST marker)
- Chowdren `write_loops` / `StartLoop` key loops on `loop_<index>` — mobile
  fastloops are numeric (`Short`), not named (`static_loop_name` helper)
- Chowdren stubs: `RunningAs` → `Always` (fidelity caveat, dev-branch gate);
  `SetGlobalValueDouble` → `global_values->set`

**Next boundary:** event C++ generation stops at `convert_parameter` on
`ParameterChildEvent`. System condition `-43` and action `43` (169 / 189 uses,
one `CHILDEVENT` param each) are **not in the stock `systemDict`** — new build-296
system ACEs carrying a qualifier-object list. Read NebulaFD's
`Nebula.Core/Data/Chunks/FrameChunks/Events/{Condition,Action}.cs` and its
qualifier handling to decide whether they are qualifier-scoping no-ops.
Also minor: `expression not implemented: Zero`.

Regenerate this patch after landing more:
`cd <anaconda> && git diff -- '*.py' '*.pyx' '*.pxd' ':(exclude)*.cpp' ':(exclude)build/*' > tools/recompile/mmfparser-chowdren-mobile.patch`
