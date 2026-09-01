#!/bin/bash
# Retain read-only HUD telemetry for one Plan 23 qualification phase.
#
#   overlay-qualification-observe.sh [samples] [interval-seconds] [output.tsv]
#
# Set CUE_HELPER_OVERLAY_PHASE=off for the HUD-off baseline, or `probe` for the
# explicit debug-only sensor-renderer probe. The default `on` phase requires
# the authenticated controller to report VISIBLE at every sample. This script
# never launches the game, grants an app-op, or sends input.
set -euo pipefail

SAMPLES="${1:-10}"
INTERVAL_SECONDS="${2:-1}"
OUTPUT="${3:-}"
PHASE="${CUE_HELPER_OVERLAY_PHASE:-on}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PACKAGE="com.fnaf2.cuehelper"
TARGET_PACKAGE="com.scottgames.fnaf2"

case "$SAMPLES" in
  ''|*[!0-9]*) echo "samples must be a positive integer" >&2; exit 2 ;;
esac
case "$INTERVAL_SECONDS" in
  ''|*[!0-9]*) echo "interval must be a non-negative integer" >&2; exit 2 ;;
esac
[ "$SAMPLES" -gt 0 ] || { echo "samples must be a positive integer" >&2; exit 2; }
case "$PHASE" in
  off|on|probe) ;;
  *) echo "CUE_HELPER_OVERLAY_PHASE must be off, probe, or on" >&2; exit 2 ;;
esac

if [ -z "$OUTPUT" ]; then
  OUTPUT="$ROOT/captures/cue-helper/overlay-${PHASE}-$(date +%Y%m%d-%H%M%S).tsv"
fi
[ ! -e "$OUTPUT" ] || { echo "refusing to overwrite: $OUTPUT" >&2; exit 2; }
mkdir -p "$(dirname "$OUTPUT")"

. "$HERE/select-adb.sh"
adb get-state >/dev/null

# Qualification telemetry must observe a stable session. Hold the same
# per-serial lease as setup/queue so another agent cannot stop/restart capture,
# rotate the target, or provision a sidecar halfway through this trace.
if [ "${CUE_HELPER_DEVICE_LOCK_HELD:-0}" != 1 ]; then
  export CUE_HELPER_DEVICE_LOCK_HELD=1
  exec python3 "$HERE/device-lock-exec.py" "$ANDROID_SERIAL" -- "$0" "$@"
fi

helper_pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
case "$helper_pid" in
  ''|*[!0-9]*)
    echo "cue helper is not running; start capture and grant consent first" >&2
    exit 1
    ;;
esac

target_package_dump="$(adb shell dumpsys package "$TARGET_PACKAGE" 2>/dev/null | tr -d '\r' || true)"
target_version_code="$(printf '%s\n' "$target_package_dump" | sed -n \
  's/.*versionCode=\([0-9][0-9]*\).*/\1/p' | head -n1)"
target_version_name="$(printf '%s\n' "$target_package_dump" | sed -n \
  's/.*versionName=\([^ ]*\).*/\1/p' | head -n1)"
target_build="${target_version_code}:${target_version_name}"
if [ -z "$target_version_code" ] || [ -z "$target_version_name" ]; then
  echo "could not determine exact $TARGET_PACKAGE versionCode:versionName" >&2
  exit 1
fi
case "$target_version_code:$target_version_name" in
  *[!0-9:._A-Za-z+-]*)
    echo "could not determine exact $TARGET_PACKAGE versionCode:versionName" >&2
    exit 1
    ;;
esac

# Retain the exact native point/ROI values that protect the detector from
# self-capture feedback. Status is read first so the observer can activate only
# the APK's authenticated, profile-bound watchlist; it never invents a second
# coordinate table or treats a missing read as evidence.
watch_status=""
if ! watch_status="$(CUE_HELPER_TRANSPORT=loopback \
    "$HERE/query-cue-helper.sh" watchlist status 2>/dev/null)"; then
  echo "could not read the authenticated native watchlist status" >&2
  exit 1
fi
watch_spec="$(printf '%s\n' "$watch_status" | sed -n \
  's/.*spec=\([0-9a-fA-F][0-9a-fA-F]*\).*/\1/p')"
case "$watch_spec" in
  [0-9a-fA-F][0-9a-fA-F]*) ;;
  *) echo "native watchlist status has no valid spec hash" >&2; exit 1 ;;
esac
if ! printf '%s\n' "$watch_status" | grep -q 'watch=ACTIVE'; then
  if ! CUE_HELPER_TRANSPORT=loopback \
      "$HERE/query-cue-helper.sh" watchlist load "$watch_spec" >/dev/null 2>&1; then
    echo "could not activate the authenticated native watchlist" >&2
    exit 1
  fi
fi

printf 'phase\tsample\telapsed_s\tepoch_s\thelper_pid\ttarget_build\tgame_focused\twindow_count\toverlay_state\toverlay_gate\toverlay_updates\toverlay_draws\toverlay_dropped\toverlay_cadence_samples\toverlay_p50_ms\toverlay_p95_ms\toverlay_p99_ms\tdraw_interval_p50_ms\tdraw_interval_p95_ms\tdraw_interval_p99_ms\tvisual_seq\tvisual_age_us\tdetector_latency_ms\tmonitor_up\tmonitor_reason\tcamera_selected\tcamera_reason\tbattery_percent\tbattery_reason\tcpu_percent\tpss_kb\trss_kb\tthreads\tthermal_status\twatch_seq\twatch_age_us\twatch_values\n' \
  > "$OUTPUT"

started=$SECONDS
failed=0
i=1
while [ "$i" -le "$SAMPLES" ]; do
  elapsed=$((SECONDS - started))
  epoch="$(date +%s)"

  pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  case "$pid" in
    ''|*[!0-9]*)
      echo "sample $i: cue-helper process disappeared" >&2
      failed=1
      pid=0
      ;;
  esac
  if [ "$pid" != 0 ] && [ "$pid" != "$helper_pid" ]; then
    echo "sample $i: cue-helper process restarted ($helper_pid -> $pid)" >&2
    failed=1
  fi

  # The parent `dumpsys window` output carries the authoritative
  # mCurrentFocus/mFocusedApp lines. The `windows` subcommand lists window
  # records but can omit those focus lines on Android 15/16, which would make
  # a focused target look like a failed qualification sample.
  windows="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' || true)"
  if printf '%s\n' "$windows" | awk '/mCurrentFocus=.*com\.scottgames\.fnaf2/ { found=1 } END { exit !found }'; then
    game_focused=1
  else
    game_focused=0
    echo "sample $i: FNaF is not the focused physical-display window" >&2
    failed=1
  fi
  # Count window records, not every diagnostic line that repeats the window
  # title (for example WindowStateAnimator and mAlertWindows entries).
  window_count="$(printf '%s\n' "$windows" | awk \
    '/^[[:space:]]+Window #[0-9]+ .*FNaF 2 Cue Helper HUD/ { count++ } END { print count + 0 }')"

  overlay_status=""
  if ! overlay_status="$(CUE_HELPER_TRANSPORT=loopback \
      "$HERE/query-cue-helper.sh" overlay 2>/dev/null)"; then
    echo "sample $i: authenticated overlay status query failed" >&2
    failed=1
  fi
  overlay_state="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*overlay=\([^ ]*\).*/\1/p')"
  overlay_gate="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*gate=\([^ ]*\).*/\1/p')"
  updates="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*updates=\([0-9][0-9]*\).*/\1/p')"
  draws="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*draws=\([0-9][0-9]*\).*/\1/p')"
  dropped="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*dropped=\([0-9][0-9]*\).*/\1/p')"
  cadence="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*cadenceSamples=\([0-9][0-9]*\).*/\1/p')"
  p50="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*updateToDrawMs=p50:\([^,]*\),p95:.*/\1/p')"
  p95="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*updateToDrawMs=.*p95:\([^,]*\),p99:.*/\1/p')"
  p99="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*updateToDrawMs=.*p99:\([^ ]*\).*/\1/p')"
  draw_interval_p50_ms="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*drawIntervalMs=p50:\([^,]*\),p95:.*/\1/p')"
  draw_interval_p95_ms="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*drawIntervalMs=.*p95:\([^,]*\),p99:.*/\1/p')"
  draw_interval_p99_ms="$(printf '%s\n' "$overlay_status" | sed -n \
    's/.*drawIntervalMs=.*p99:\([^ ]*\).*/\1/p')"
  overlay_state="${overlay_state:-UNKNOWN}"
  overlay_gate="${overlay_gate:-UNKNOWN}"
  updates="${updates:--1}"
  draws="${draws:--1}"
  dropped="${dropped:--1}"
  cadence="${cadence:--1}"
  p50="${p50:--1}"
  p95="${p95:--1}"
  p99="${p99:--1}"
  draw_interval_p50_ms="${draw_interval_p50_ms:--1}"
  draw_interval_p95_ms="${draw_interval_p95_ms:--1}"
  draw_interval_p99_ms="${draw_interval_p99_ms:--1}"

  visual_status=""
  if ! visual_status="$(CUE_HELPER_TRANSPORT=loopback \
      "$HERE/query-cue-helper.sh" 2>/dev/null)"; then
    echo "sample $i: authenticated visual snapshot query failed" >&2
    failed=1
  fi
  visual_seq="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*visual=.*seq=\([0-9][0-9]*\).*/\1/p')"
  visual_age_us="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*ageUs=\([-0-9][0-9]*\).*/\1/p')"
  detector_latency_ms="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*detectorLatencyMs=\([0-9][0-9]*\).*/\1/p')"
  monitor_up="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*monitorUp=\([^ ]*\).*/\1/p')"
  monitor_reason="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*monitorReason=\([^ ]*\).*/\1/p')"
  camera_selected="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*cameraSelected=\([^ ]*\).*/\1/p')"
  camera_reason="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*cameraReason=\([^ ]*\).*/\1/p')"
  battery_percent="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*batteryPercent=\([^ ]*\).*/\1/p')"
  battery_reason="$(printf '%s\n' "$visual_status" | sed -n \
    's/.*batteryReason=\([^ ]*\).*/\1/p')"
  visual_seq="${visual_seq:--1}"
  visual_age_us="${visual_age_us:--1}"
  detector_latency_ms="${detector_latency_ms:--1}"
  monitor_up="${monitor_up:-UNKNOWN}"
  monitor_reason="${monitor_reason:-UNKNOWN}"
  camera_selected="${camera_selected:-UNKNOWN}"
  camera_reason="${camera_reason:-UNKNOWN}"
  battery_percent="${battery_percent:-UNKNOWN}"
  battery_reason="${battery_reason:-UNKNOWN}"
  case "$monitor_up" in
    true|false|UNKNOWN) ;;
    *)
      echo "sample $i: invalid monitor state ($monitor_up)" >&2
      failed=1
      ;;
  esac
  case "$camera_selected" in
    UNKNOWN|cam:[1-9]|cam:1[0-2]) ;;
    *)
      echo "sample $i: invalid selected camera ($camera_selected)" >&2
      failed=1
      ;;
  esac
  if [ "$monitor_up" != true ] && [ "$camera_selected" != UNKNOWN ]; then
    echo "sample $i: camera selection leaked while monitor is not up" >&2
    failed=1
  fi
  if [ "$monitor_up" != true ] && [ "$camera_reason" != monitor-not-up ]; then
    echo "sample $i: camera reason is not monitor-not-up while monitor is not up ($camera_reason)" >&2
    failed=1
  fi
  if [ "$detector_latency_ms" = -1 ]; then
    echo "sample $i: visual snapshot has no detector latency" >&2
    failed=1
  fi
  case "$battery_percent" in
    UNKNOWN|0|25|50|75|100) ;;
    *)
      echo "sample $i: invalid battery percentage ($battery_percent)" >&2
      failed=1
      ;;
  esac
  case "$battery_reason" in
    UNKNOWN) ;;
    *[!A-Za-z0-9_-]*)
      echo "sample $i: invalid battery reason ($battery_reason)" >&2
      failed=1
      ;;
    *)
      ;;
  esac

  watch_read=""
  if ! watch_read="$(CUE_HELPER_TRANSPORT=loopback \
      "$HERE/query-cue-helper.sh" read 2>/dev/null)"; then
    echo "sample $i: authenticated native watch read failed" >&2
    failed=1
  fi
  watch_seq="$(printf '%s\n' "$watch_read" | sed -n \
    's/.*seq=\([0-9][0-9]*\).*/\1/p')"
  watch_age_us="$(printf '%s\n' "$watch_read" | sed -n \
    's/.*ageUs=\([-0-9][0-9]*\).*/\1/p')"
  watch_values="$(printf '%s\n' "$watch_read" | sed -n \
    's/^OK read=[^ ]* //p')"
  watch_seq="${watch_seq:--1}"
  watch_age_us="${watch_age_us:--1}"
  watch_values="${watch_values:-UNKNOWN}"
  case "$watch_read" in
    'OK read=OBSERVED '*) ;;
    *)
      echo "sample $i: native watch read is not a fresh OBSERVED frame" >&2
      failed=1
      ;;
  esac

  if [ "$PHASE" = on ] && [ "$overlay_state" != "VISIBLE" ]; then
    echo "sample $i: HUD-on phase is not VISIBLE ($overlay_state)" >&2
    failed=1
  fi
  if [ "$PHASE" = probe ] && [ "$overlay_state" != "PROBE" ]; then
    echo "sample $i: qualification probe is not PROBE ($overlay_state)" >&2
    failed=1
  fi
  if [ "$PHASE" = probe ] && [ "$overlay_gate" != "UNQUALIFIED(self-capture-unqualified)" ]; then
    echo "sample $i: qualification probe unexpectedly changed the production gate ($overlay_gate)" >&2
    failed=1
  fi
  if [ "$PHASE" = off ] && [ "$overlay_state" = "VISIBLE" ]; then
    echo "sample $i: HUD-off phase is still VISIBLE" >&2
    failed=1
  fi
  if [ "$window_count" -gt 1 ]; then
    echo "sample $i: more than one Cue Helper HUD window ($window_count)" >&2
    failed=1
  fi

  meminfo="$(adb shell dumpsys meminfo "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  pss="$(printf '%s\n' "$meminfo" | awk '
    /TOTAL PSS:/ {
      for (i = 1; i <= NF; i++) if ($i == "PSS:") { print $(i + 1); exit }
    }
    $1 == "TOTAL" && $2 ~ /^[0-9]+$/ { fallback = $2 }
    END { if (fallback != "") print fallback }
  ' | head -n1)"
  [ -n "$pss" ] || pss=-1

  process_status=""
  if [ "$pid" != 0 ]; then
    process_status="$(adb shell cat "/proc/$pid/status" 2>/dev/null | tr -d '\r' || true)"
  fi
  rss="$(printf '%s\n' "$process_status" | awk '$1 == "VmRSS:" { print $2; exit }')"
  threads="$(printf '%s\n' "$process_status" | awk '$1 == "Threads:" { print $2; exit }')"
  [ -n "$rss" ] || rss=-1
  [ -n "$threads" ] || threads=-1

  cpu="$(adb shell dumpsys cpuinfo 2>/dev/null | tr -d '\r' | awk -v pid="$pid" '
    $0 ~ (" " pid "/") { value=$1; sub(/%/, "", value); print value; exit }
  ' || true)"
  [ -n "$cpu" ] || cpu=-1
  thermal="$(adb shell dumpsys thermalservice 2>/dev/null | tr -d '\r' | \
    awk -F': *' '/Thermal Status:/ { print $2; exit }' || true)"
  [ -n "$thermal" ] || thermal=-1

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$PHASE" "$i" "$elapsed" "$epoch" "$pid" "$target_build" "$game_focused" \
    "$window_count" "$overlay_state" "$overlay_gate" "$updates" "$draws" \
    "$dropped" "$cadence" "$p50" "$p95" "$p99" "$draw_interval_p50_ms" \
    "$draw_interval_p95_ms" "$draw_interval_p99_ms" "$visual_seq" \
    "$visual_age_us" "$detector_latency_ms" "$monitor_up" "$monitor_reason" \
    "$camera_selected" "$camera_reason" "$battery_percent" "$battery_reason" \
    "$cpu" "$pss" "$rss" "$threads" \
    "$thermal" "$watch_seq" "$watch_age_us" "$watch_values" >> "$OUTPUT"

  printf 'phase=%s sample=%d/%d elapsed=%ss state=%s gate=%s windows=%s ' \
    "$PHASE" "$i" "$SAMPLES" "$elapsed" "$overlay_state" "$overlay_gate" "$window_count"
  printf 'updates=%s draws=%s dropped=%s p50=%sms p95=%sms p99=%sms ' \
    "$updates" "$draws" "$dropped" "$p50" "$p95" "$p99"
  printf 'drawInterval=%s/%s/%sms visualSeq=%s visualAge=%sus detector=%sms ' \
    "$draw_interval_p50_ms" "$draw_interval_p95_ms" "$draw_interval_p99_ms" \
    "$visual_seq" "$visual_age_us" "$detector_latency_ms"
  printf 'monitor=%s(%s) camera=%s(%s) ' "$monitor_up" "$monitor_reason" \
    "$camera_selected" "$camera_reason"
  printf 'battery=%s(%s) ' "$battery_percent" "$battery_reason"
  printf 'watchSeq=%s watchAge=%sus cpu=%s%% pss=%sKiB thermal=%s\n' \
    "$watch_seq" "$watch_age_us" "$cpu" "$pss" "$thermal"

  if [ "$i" -lt "$SAMPLES" ] && [ "$INTERVAL_SECONDS" -gt 0 ]; then
    sleep "$INTERVAL_SECONDS"
  fi
  i=$((i + 1))
done

echo "trace: $OUTPUT"
if [ "$failed" -ne 0 ]; then
  echo "overlay qualification observation failed one or more phase/lifecycle checks" >&2
  exit 1
fi
