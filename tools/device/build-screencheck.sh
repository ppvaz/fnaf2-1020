#!/bin/bash
# Build the libc-free AArch64/Linux helper used under `adb shell`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$HERE/../../packages/screencheck/src"
OUTPUT="${1:-$HERE/fnaf-screencheck}"
BUILD_DIR="${TMPDIR:-/tmp}/fnaf-screencheck-build"
HOST_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
RUST_SYSROOT="$(rustc --print sysroot)"
LINKER="$RUST_SYSROOT/lib/rustlib/$HOST_TRIPLE/bin/gcc-ld/ld.lld"

[ -x "$LINKER" ] || {
  echo "rust-lld not found; install a Rust toolchain or set up an Android NDK" >&2
  exit 2
}
mkdir -p "$BUILD_DIR"

clang -target aarch64-linux-android -O3 -ffreestanding -fno-builtin \
  -fno-stack-protector -fno-unwind-tables -fno-asynchronous-unwind-tables \
  -DSCREENCHECK_FREESTANDING -c "$NATIVE_DIR/screencheck.c" \
  -o "$BUILD_DIR/screencheck.o"
clang -target aarch64-linux-android -c "$NATIVE_DIR/screencheck-start.S" \
  -o "$BUILD_DIR/screencheck-start.o"
"$LINKER" -m aarch64elf -static --gc-sections -s \
  -e _start -o "$OUTPUT" \
  "$BUILD_DIR/screencheck-start.o" "$BUILD_DIR/screencheck.o"
chmod 755 "$OUTPUT"
file "$OUTPUT"
