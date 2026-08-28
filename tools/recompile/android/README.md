# Chowdren → Android backend (route a)

Goal: build the desktop-only recompile (`../README.md`, `../mmfparser-chowdren-mobile.patch`)
for `arm64-v8a` Android and sideload it to the Moto g56 as an own-package research
APK. **Content-free** — no game assets, no owned CCN.

## Target device (read 2026-08-28)

Moto g56 5G (`bogota_gn`) — **Android 16 (API 36)**, `arm64-v8a` (abilist
`arm64-v8a,armeabi-v7a,armeabi`), **4 KB pages** (`getconf PAGE_SIZE` = 4096, no
16 KB-alignment concern), 176 GB free on `/data`.
`install_non_market_apps=1`, no Advanced Protection Mode, Play-Protect ADB
verification not forced. Build targets API 34 (`targetSdkVersion 34`, installs
fine on 16); minSdk 24.

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

- `base/fileio.cpp`: missing `#include <iostream>` — **fixed in the patch**
- `base/overlap.cpp` errors were a probe artefact: it is `#include`d into
  `common.cpp` (as `gencol.cpp` is into `collision.cpp`), never a standalone TU,
  and compiles clean in context
- the `glslshader.h` `GLhandleARB` errors were also an artefact of probing with
  the *desktop* renderplatform — the Android renderplatform will not include it
  (FNaF 2 has no shaders; `glslshader.cpp` is already excluded by the
  `CMAKE_CROSSCOMPILING` path)
- **net: one real one-line engine fix; all generated FNaF 2 code compiles as-is.**

NDK sysroot provides `libGLESv1_CM.so` (real ES 1.1 driver iface), `libEGL.so`,
`libOpenSLES.so`, `liblog.so`, `libandroid.so`. Missing and needing an NDK
cross-build: `freetype` (official Android build exists), `libogg`/`libvorbis`
(tiny pure-C), OpenAL-soft (CMake Android support) — or replace audio with
`SDL_mixer` / OpenSLES.

## Progress

- **Full APK pipeline proven end to end (2026-08-28).** `fnaf2-android-build:local`
  container → SDL2 `android-project` with `testgles2` as the app
  (`org.fnaf2rebuild.hello`, arm64-only, minSdk 24 / target 34, in
  `fnaf2-android:/root/ws`) → `./gradlew assembleDebug` → `app-debug.apk` (2.3 MB)
  → `adb install` on the g56 = **Success** (no Play-Protect block) → launched,
  SDLActivity focused, **GLES rendering on the device** (screenshot: the
  spinning gradient quad). Every uncertain link verified: amd64-emulated NDK →
  working arm64 `.so`; Gradle/AGP; sideload accepted on Android 16; SDL2 GL
  context + swap on the g56's **PowerVR** GPU (`IMGSRV` in logcat, not Mali).
- **Engine:** compiles for arm64 Android with **one** fix — `fileio.cpp`
  `#include <iostream>` (in the patch).

## Remaining work (est. ~1 week to a device boot attempt)

1. ~~Confirm the `testgles2` APK installs and renders on the g56~~ — **done.**
2. `include_gl.h` — real `#elif defined(CHOWDREN_IS_ANDROID)` branch (draft:
   `include_gl-android.h.draft`).
3. `base/android/{platform,renderplatform,fbo}.cpp` — adapt from `desktop/`; the
   `CMAKE_CROSSCOMPILING` path already drops the desktop versions +
   `CHOWDREN_IS_DESKTOP` + `glslshader.cpp`.
4. Cross-build ogg/vorbis/freetype/openal-soft (or SDL_mixer).
5. `platform.cpp` Android runtime: `Assets.dat` from the APK → internal storage,
   `chdir` (`SDL_AndroidGetInternalStoragePath`); drop
   `SDL_WINDOW_FULLSCREEN_DESKTOP`/resize; SDL2 touch→pointer is on by default.
6. FNaF 2 `gamesrc` into the Gradle project → `libmain.so` + `libSDL2.so` +
   bundled `Assets.dat` → debug APK → `adb install`.
7. Boot on the g56, iterate on ES 1.1 texture-format / FBO-OES / blit issues.
