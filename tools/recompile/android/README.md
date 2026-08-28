# Chowdren → Android backend (route a)

Goal: build the desktop-only recompile (`../README.md`, `../mmfparser-chowdren-mobile.patch`)
for `arm64-v8a` Android and sideload it to the Moto g56 as an own-package research
APK. **Content-free** — no game assets, no owned CCN.

## Feasibility spike — result (2026-08-28): GO

Build env: `fnaf2-android-build:local` — `--platform linux/amd64` (the NDK ships
only `linux-x86_64` host binaries; Docker's amd64 emulation on Apple Silicon runs
them), NDK r26d, SDK platform-34 / build-tools 34, `adb`, SDL2 2.30
`android-project`. Verified: `aarch64-linux-android34-clang++` cross-compiles a
valid Android `.so`.

Syntax-checked **20 translation units** (engine core + `renderplatform` +
`platform` + `fbo` + generated `events_*/objects*/frame*_1/lists/fonts`) for
`arm64-v8a` with `-DCHOWDREN_USE_GLES1` against NDK `<GLES/gl.h>` + the draft
`include_gl` shim below. **Total: 12 errors, all trivial:**

- `base/fileio.cpp` (6): missing `#include <iostream>` (`std::cout`/`std::endl`)
- `base/overlap.cpp` (6): include-order — `Movement` incomplete type; one
  `CollisionBase*` ← `InstanceCollision*` cast
- **everything else, including all generated FNaF 2 code: 0 errors.**

NDK sysroot provides `libGLESv1_CM.so` (real ES 1.1 driver iface), `libEGL.so`,
`libOpenSLES.so`, `liblog.so`, `libandroid.so`. Missing and needing an NDK
cross-build: `freetype` (official Android build exists), `libogg`/`libvorbis`
(tiny pure-C), OpenAL-soft (CMake Android support) — or replace audio with
`SDL_mixer` / OpenSLES.

## Remaining work (est. ~1 week to a device boot attempt)

1. `include_gl.h` — real Android branch (draft: `include_gl-android.h.draft`);
   guard `glslshader.h` out of no-shader builds instead of stubbing its ARB types.
2. The 12 compile fixes above.
3. `base/CMakeLists.txt` / a toolchain file — the existing `CMAKE_CROSSCOMPILING`
   path already drops `desktop/{platform,glslshader,fbo}.cpp` and
   `CHOWDREN_IS_DESKTOP`; supply `base/android/{platform,renderplatform,fbo}.cpp`
   (adapt from `desktop/` — the render layer is already fixed-function / ES-shaped).
4. Cross-build ogg/vorbis/freetype/openal-soft (or SDL_mixer).
5. `platform.cpp` Android runtime: `Assets.dat` from the APK → internal storage,
   `chdir` there (`SDL_AndroidGetInternalStoragePath`); drop
   `SDL_WINDOW_FULLSCREEN_DESKTOP`/resize; SDL2 touch→pointer is on by default.
6. SDL2 `android-project` Gradle shell → `libmain.so` + `libSDL2.so` + bundled
   `Assets.dat` → debug-signed APK → `adb install`.
7. Boot on the g56 (Android version TBD — confirm with `adb shell getprop
   ro.build.version.release`), iterate on ES 1.1 texture-format / FBO-OES / blit
   issues.
