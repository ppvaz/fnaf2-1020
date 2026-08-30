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
  echo "this check compiles CueDetector.java on the host; it needs no phone and no Android SDK" >&2
  exit 2
fi
JAVAC="$JDK_ROOT/bin/javac"
JAVA="$JDK_ROOT/bin/java"

# --release, not -source/-target: the latter compiles against the running JDK's
# system modules and warns that the result may not run on 17.
"$JAVAC" -encoding UTF-8 --release 17 -d "$TEST_TMP" \
  "$HERE/src/com/fnaf2/cuehelper/CueDetector.java" \
  "$HERE/src/com/fnaf2/cuehelper/PixelWatch.java" \
  "$HERE/src/com/fnaf2/cuehelper/ScreenIdentity.java" \
  "$HERE/src/com/fnaf2/cuehelper/ScreenStats.java" \
  "$HERE/test/com/fnaf2/cuehelper/CueDetectorTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/PixelWatchTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/ScreenIdentityTest.java" \
  "$HERE/test/com/fnaf2/cuehelper/ScreenStatsTest.java"
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.CueDetectorTest
$JAVA -cp "$TEST_TMP" com.fnaf2.cuehelper.PixelWatchTest
$JAVA -cp "$TEST_TMP" com.fnaf2.cuehelper.ScreenIdentityTest
"$JAVA" -cp "$TEST_TMP" com.fnaf2.cuehelper.ScreenStatsTest
