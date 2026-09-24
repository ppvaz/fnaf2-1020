#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf1-teach-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
if ! "$JAVAC" -version >/dev/null 2>&1; then
  JAVAC="$(command -v javac)"
  JAVA="$(command -v java)"
fi
"$JAVAC" -encoding UTF-8 --release 17 -d "$TMP" \
  "$HERE/src/com/ppvaz/fnaf1teach/Fnaf1TeachContract.java" \
  "$HERE/test/com/ppvaz/fnaf1teach/Fnaf1TeachContractTest.java"
"$JAVA" -cp "$TMP" com.ppvaz.fnaf1teach.Fnaf1TeachContractTest
