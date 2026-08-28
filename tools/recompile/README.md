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
frames) · arm64 link ✓ · **boots to the 02-title screen ✓**. Still
`rebuilt-runtime` only: inert compatibility paths remain, sprites are placeholder
boxes, and it does not reach gameplay. The patch carries
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
  undefined frame-local instances/actions are omitted, unbound object actions
  are omitted, and malformed/unknown expressions carry an explicit numeric
  fallback (their containing comparisons become `false`) solely for build probes
- arm64 desktop portability: the duplicate `size_t` / `uint64_t`
  `number_to_string` overload is disambiguated in `base/stringcommon.h`
- the runtime accepts a `FlatObjectList` default-instance lookup when a mobile
  event references a static backdrop
- **absent single-object ACEs** (a Global object placed only on a later frame, a
  dead cross-frame reference): `write_frame` tracks `frame_startup_handles`;
  `get_object` routes reads through a type default instance
  (`default_active/counter/text_instance`, new `Default{Counter,Text}` +
  `base/frameobject.h::default_instance`), and a single-object *action* on one is
  skipped as the Fusion no-op it is
- **`JumpToFrame` / `NextFrame` / timer actions no longer dropped:** the
  "unbound action omitted" guard fires only when the action *names* an object
  with no FrameItems definition, not on pure system actions
- **every object gets `create_alterables()`** (`Counter.use_alterables = True`
  plus an unconditional `create_alterables()` in `ObjectWriter.load_alterables`),
  so a build-296 event reading `.alterables` on a Counter or extension stub does
  not hit NULL
- **`Media::play_id` guards `INVALID_ASSET_ID`** — an unresolved mobile Play
  Sample plays silence instead of indexing `sounds[]` out of bounds

The completed run's derived unsupported inventory is printed at the end of the
converter output (not committed): Android/iOS/In-App, INI, Multiple Touch,
Perspective, KYSO, Calculate Text Rect, several system ACEs and unmatched
fastloops remain. The Phase-3 arm64 CMake probe now completes and links the
external desktop target after compatibility handling for empty qualifiers,
numeric loop indices, static-backdrop traversal, receiver-free `Never`, and
unsupported-expression actions.

**Boots to the FNaF 2 title screen 2026-08-28.** Under real Xvfb + llvmpipe with
`ALSOFT_DRIVERS=null`, run with CWD at the `gamesrc` dir (the binary opens
`./Assets.dat`), the linked binary renders an SDL/GL window, initializes audio,
boots frame 0 → frame 1, and runs the 02-title event logic — title text, the
`12:00 AM` clock, the WARNING block, the camera-map layout, menu buttons — stable
45 s+. Sprites are placeholder boxes (image bank still incomplete); it does not
yet advance to gameplay. Fidelity class `rebuilt-runtime`. Fixes this slice:
absent single-object ACEs routed to a type default / skipped as Fusion no-ops
(`frame_startup_handles`, `Default{Counter,Text}`), the blanket "unbound action
omitted" guard narrowed so `JumpToFrame` and other pure system actions emit,
`Counter.use_alterables = True` + `load_alterables` always calls
`create_alterables()`, and `Media::play_id` guards `INVALID_ASSET_ID`. Full note:
`IN-ENGINE-PILOT-RECOMPILE.md` §"Phase 3 — boots to the FNaF 2 title screen".

Run recipe (external Debian-buster arm64 container, `fnaf2-chowdren-phase1:local`
+ `cmake libsdl2-dev libopenal-dev libgl1-mesa-dev gdb xvfb mesa-utils`, mounts
`<anaconda>:/work` and `<external>:/input`):

```sh
cd /input/gamesrc     # CWD must hold Assets.dat
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe ALSOFT_DRIVERS=null \
  xvfb-run -s "-screen 0 1280x720x24" ./build-linux/Chowdren
```

Regenerate this patch after landing more (keeps `Chowdren/base` runtime `.cpp`,
drops the Cython-generated `mmfparser/**/*.cpp`):
`cd <anaconda> && git diff -- '*.py' '*.pyx' '*.pxd' '*.h' 'Chowdren/base' ':(exclude)build/*' > tools/recompile/mmfparser-chowdren-mobile.patch`
