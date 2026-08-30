#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="${ANDROID_SDK_ROOT:-${HOME}/Library/Android/sdk}"
JDK_ROOT="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
BUILD_TOOLS="${ANDROID_BUILD_TOOLS_VERSION:-36.0.0}"
PLATFORM="${ANDROID_PLATFORM_VERSION:-36}"
export JAVA_HOME="$JDK_ROOT"

AAPT2="$SDK_ROOT/build-tools/$BUILD_TOOLS/aapt2"
D8="$SDK_ROOT/build-tools/$BUILD_TOOLS/d8"
ZIPALIGN="$SDK_ROOT/build-tools/$BUILD_TOOLS/zipalign"
APKSIGNER="$SDK_ROOT/build-tools/$BUILD_TOOLS/apksigner"
ANDROID_JAR="$SDK_ROOT/platforms/android-$PLATFORM/android.jar"
JAVAC="$JDK_ROOT/bin/javac"
JAR="$JDK_ROOT/bin/jar"
KEYTOOL="$JDK_ROOT/bin/keytool"
BUILD_DIR="$SCRIPT_DIR/build"
CLASSES_DIR="$BUILD_DIR/classes"
DEX_DIR="$BUILD_DIR/dex"
KEYSTORE="$SCRIPT_DIR/debug.keystore"

for required in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER" "$ANDROID_JAR" \
        "$JAVAC" "$JAR" "$KEYTOOL"; do
    if [[ ! -e "$required" ]]; then
        echo "missing required tool: $required" >&2
        exit 1
    fi
done

if [[ "$BUILD_DIR" != "$SCRIPT_DIR/build" ]]; then
    echo "refusing unexpected build directory: $BUILD_DIR" >&2
    exit 1
fi
rm -rf "$BUILD_DIR"
mkdir -p "$CLASSES_DIR" "$DEX_DIR"

"$AAPT2" link \
    --manifest "$SCRIPT_DIR/AndroidManifest.xml" \
    -I "$ANDROID_JAR" \
    --min-sdk-version 29 \
    --target-sdk-version 36 \
    --version-code 1 \
    --version-name 0.1.0 \
    -o "$BUILD_DIR/base-unsigned.apk"

"$JAVAC" \
    -encoding UTF-8 \
    -source 17 \
    -target 17 \
    -classpath "$ANDROID_JAR" \
    -d "$CLASSES_DIR" \
    "$SCRIPT_DIR/src/com/fnafminus7/cuehelper/MainActivity.java" \
    "$SCRIPT_DIR/src/com/fnafminus7/cuehelper/CueDetector.java" \
    "$SCRIPT_DIR/src/com/fnafminus7/cuehelper/PixelWatch.java" \
    "$SCRIPT_DIR/src/com/fnafminus7/cuehelper/ScreenStats.java" \
    "$SCRIPT_DIR/src/com/fnafminus7/cuehelper/CaptureService.java"

"$JAR" --create --file "$BUILD_DIR/classes.jar" -C "$CLASSES_DIR" .
JAVA_HOME="$JDK_ROOT" "$D8" \
    --min-api 29 \
    --lib "$ANDROID_JAR" \
    --output "$DEX_DIR" \
    "$BUILD_DIR/classes.jar"

cp "$BUILD_DIR/base-unsigned.apk" "$BUILD_DIR/with-dex-unsigned.apk"
zip -q -j "$BUILD_DIR/with-dex-unsigned.apk" "$DEX_DIR/classes.dex"
"$ZIPALIGN" -f 4 \
    "$BUILD_DIR/with-dex-unsigned.apk" \
    "$BUILD_DIR/cue-helper-aligned.apk"

if [[ ! -f "$KEYSTORE" ]]; then
    "$KEYTOOL" -genkeypair \
        -keystore "$KEYSTORE" \
        -storepass android \
        -keypass android \
        -alias androiddebugkey \
        -dname "CN=Android Debug,O=Android,C=US" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -noprompt >/dev/null
fi

"$APKSIGNER" sign \
    --ks "$KEYSTORE" \
    --ks-pass pass:android \
    --key-pass pass:android \
    --out "$BUILD_DIR/cue-helper.apk" \
    "$BUILD_DIR/cue-helper-aligned.apk"
"$APKSIGNER" verify --verbose "$BUILD_DIR/cue-helper.apk"

echo "$BUILD_DIR/cue-helper.apk"
