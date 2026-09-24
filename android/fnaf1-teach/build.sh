#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/.local/toolchains/android-sdk}"
JDK_ROOT="${JAVA_HOME:-/usr/lib/jvm/default-java}"
BUILD_TOOLS="${ANDROID_BUILD_TOOLS_VERSION:-36.0.0}"
PLATFORM="${ANDROID_PLATFORM_VERSION:-36}"
AAPT2="$SDK_ROOT/build-tools/$BUILD_TOOLS/aapt2"
D8="$SDK_ROOT/build-tools/$BUILD_TOOLS/d8"
ZIPALIGN="$SDK_ROOT/build-tools/$BUILD_TOOLS/zipalign"
APKSIGNER="$SDK_ROOT/build-tools/$BUILD_TOOLS/apksigner"
ANDROID_JAR="$SDK_ROOT/platforms/android-$PLATFORM/android.jar"
JAVAC="$JDK_ROOT/bin/javac"
JAR="$JDK_ROOT/bin/jar"
KEYTOOL="$JDK_ROOT/bin/keytool"
BUILD="$HERE/build"
CLASSES="$BUILD/classes"
DEX="$BUILD/dex"
KEYSTORE="$HERE/debug.keystore"

for tool in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER" "$ANDROID_JAR" "$JAVAC" "$JAR" "$KEYTOOL"; do
  [ -e "$tool" ] || { echo "missing required tool: $tool" >&2; exit 1; }
done
[ "$BUILD" = "$HERE/build" ] || { echo "refusing unexpected build directory: $BUILD" >&2; exit 1; }
rm -rf "$BUILD"
mkdir -p "$CLASSES" "$DEX"

"$AAPT2" compile --dir "$HERE/res" -o "$BUILD/compiled-res.zip"
"$AAPT2" link --manifest "$HERE/AndroidManifest.xml" -I "$ANDROID_JAR" \
  -R "$BUILD/compiled-res.zip" --auto-add-overlay --min-sdk-version 29 --target-sdk-version 36 \
  --version-code 1 --version-name 0.1.0 -o "$BUILD/base-unsigned.apk"
"$JAVAC" -encoding UTF-8 -source 17 -target 17 -classpath "$ANDROID_JAR" -d "$CLASSES" \
  "$HERE/src/com/ppvaz/fnaf1teach/Fnaf1TeachContract.java" \
  "$HERE/src/com/ppvaz/fnaf1teach/Fnaf1TeachView.java" \
  "$HERE/src/com/ppvaz/fnaf1teach/Fnaf1TeachCommandReceiver.java" \
  "$HERE/src/com/ppvaz/fnaf1teach/Fnaf1TeachOverlayService.java" \
  "$HERE/src/com/ppvaz/fnaf1teach/MainActivity.java"
"$JAR" --create --file "$BUILD/classes.jar" -C "$CLASSES" .
"$D8" --min-api 29 --lib "$ANDROID_JAR" --output "$DEX" "$BUILD/classes.jar"
cp "$BUILD/base-unsigned.apk" "$BUILD/with-dex-unsigned.apk"
zip -q -j "$BUILD/with-dex-unsigned.apk" "$DEX/classes.dex"
"$ZIPALIGN" -f 4 "$BUILD/with-dex-unsigned.apk" "$BUILD/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  "$KEYTOOL" -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 \
    -validity 10000 -noprompt >/dev/null
fi
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$BUILD/fnaf1-teach.apk" "$BUILD/aligned.apk"
"$APKSIGNER" verify --verbose "$BUILD/fnaf1-teach.apk"
echo "$BUILD/fnaf1-teach.apk"
