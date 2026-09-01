#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TEST_TMP="$(mktemp -d "${TMPDIR:-/tmp}/cue-helper-java-test.XXXXXX")"
trap 'rm -rf "$TEST_TMP"' EXIT HUP INT TERM
# Find a JDK rather than assuming one machine's. This used to hardcode the
# Homebrew prefix as the fallback, which made the check pass on the laptop that
# wrote it and fail everywhere else -- including CI, where JAVA_HOME is not
# guaranteed. Order: an explicit JAVA_HOME, then whatever javac is on PATH,
# then the Homebrew prefix.
#
# There is no skip path. A check that quietly does nothing when its toolchain
# is missing reads as coverage, and this repository has already paid for that
# once with a grading step that graded a file which did not exist.
# A candidate must actually COMPILE, not merely exist. macOS ships
# /usr/bin/javac as a stub that is present, executable, and on PATH, and then
# exits with "Unable to locate a Java Runtime" -- so an `-x` test picks it over
# a real JDK sitting beside it. Probe each candidate with -version.
JDK_ROOT=""
for candidate in "${JAVA_HOME:-}" \
                 "$(dirname "$(dirname "$(command -v javac 2>/dev/null || echo /nonexistent/bin/javac)")")" \
                 /opt/homebrew/opt/openjdk /usr/lib/jvm/default-java; do
  [ -n "$candidate" ] || continue
  [ -x "$candidate/bin/javac" ] || continue
  "$candidate/bin/javac" -version >/dev/null 2>&1 || continue
  JDK_ROOT="$candidate"
  break
done
if [ -z "$JDK_ROOT" ]; then
  echo "no working JDK found: set JAVA_HOME or put a real javac on PATH" >&2
  echo "this check compiles Cue Helper host contracts on the host; it needs no phone or Android SDK" >&2
  exit 2
fi
JAVAC="$JDK_ROOT/bin/javac"
JAVA="$JDK_ROOT/bin/java"

# --release, not -source/-target: the latter compiles against the running JDK's
# system modules and warns that the result may not run on 17.
"$JAVAC" -encoding UTF-8 --release 17 -d "$TEST_TMP" \
  "$HERE/src/com/fnaf2/cuehelper/CueDetector.java" \
  "$HERE/src/com/fnaf2/cuehelper/AudioAnalyzer.java" \
  "$HERE/src/com/fnaf2/cuehelper/PhaseClock.java" \
  "$HERE/src/com/fnaf2/cuehelper/PixelWatch.java" \
  "$HERE/src/com/fnaf2/cuehelper/ScreenIdentity.java" \
  "$HERE/src/com/fnaf2/cuehelper/ScreenStats.java" \
  "$HERE/src/com/fnaf2/cuehelper/NormalizedRect.java" \
  "$HERE/src/com/fnaf2/cuehelper/RoiSpec.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlayGeometry.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlayCollisionDetector.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlayRegionFilter.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlaySnapshot.java" \
  "$HERE/src/com/fnaf2/cuehelper/BatteryLifeDetector.java" \
  "$HERE/src/com/fnaf2/cuehelper/MonitorStateDetector.java" \
  "$HERE/src/com/fnaf2/cuehelper/CameraSelectionDetector.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlayCaptureGate.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlayMetrics.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlayCueArbiter.java" \
  "$HERE/src/com/fnaf2/cuehelper/OverlaySnapshotRetention.java" \
  "$HERE/test/com/fnaf2/cuehelper/CueDetectorTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/AudioAnalyzerTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/PhaseClockTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/PixelWatchTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/BatteryLifeDetectorTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/ScreenIdentityTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/ScreenStatsTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/OverlayContractTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/OverlayMetricsTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/OverlaySnapshotRetentionTest.java"
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.CueDetectorTest
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.AudioAnalyzerTest
$JAVA -cp "$TEST_TMP" com.fnaf2.cuehelper.PhaseClockTest
$JAVA -cp "$TEST_TMP" com.fnaf2.cuehelper.PixelWatchTest
$JAVA -cp "$TEST_TMP" com.fnaf2.cuehelper.ScreenIdentityTest
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.ScreenStatsTest
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.OverlayContractTest
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.OverlayMetricsTest
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.OverlaySnapshotRetentionTest

# Video capture is independent of the optional audio receiver. Keep this
# source-level guard beside the host tests because MainActivity itself needs
# Android framework classes and cannot be executed on the host JVM.
capture_method="$(awk '
  /private void toggleCapture\(\)/ { active=1 }
  active { print }
  active && /^    private Button themedButton/ { exit }
' "$HERE/src/com/fnaf2/cuehelper/MainActivity.java")"
case "$capture_method" in
  *bluetoothConnected*|*ensureBluetoothReady*|*showAudioSetupDialog*)
    echo "capture flow: FAILED (video start regained an audio prerequisite)" >&2
    exit 1
    ;;
esac
case "$capture_method" in
  *requestProjection\(\)*) ;;
  *) echo "capture flow: FAILED (video start does not request projection)" >&2; exit 1 ;;
esac
echo "capture flow: optional audio does not gate video start"

overlay_refresh="$(awk '
  /private void refreshOverlayControls\(String status\)/ { active=1 }
  active { print }
  active && /^    private void toggleOverlay\(\)/ { exit }
' "$HERE/src/com/fnaf2/cuehelper/MainActivity.java")"
case "$overlay_refresh" in
  *"overlayButton.setText(overlayEnabled ? \"Disable overlay\" : \"Enable overlay\")"*) ;;
  *) echo "overlay controls: FAILED (button label is not stable)" >&2; exit 1 ;;
esac
case "$overlay_refresh" in
  *"overlayButton.setText"*"line.substring"*)
    echo "overlay controls: FAILED (status text is embedded in the button)" >&2
    exit 1
    ;;
esac
echo "overlay controls: status is separate from the stable action button"

identity_gate="$(awk '
  /public void onCapturedScreenIdentity\(int identity\)/ { active=1 }
  active { print }
  active && /^    public void onCaptureStopped\(\)/ { exit }
' "$HERE/src/com/fnaf2/cuehelper/OverlayController.java")"
case "$identity_gate" in
  *"identity == ScreenIdentity.FNAF2_NIGHT"*"detach(null)"*"target-not-game"*) ;;
  *) echo "overlay identity gate: FAILED (non-game capture does not detach)" >&2; exit 1 ;;
esac
echo "overlay identity gate: non-game capture detaches the HUD"
