#!/bin/bash
set -eu

if [ "${1:-}" = devices ] && [ "${2:-}" = -l ]; then
  printf '%s\n' 'List of devices attached' \
    'TEST123 device usb:1 product:test model:test_phone'
elif [ "${1:-}" = -s ] && [ "${3:-}" = get-state ]; then
  echo device
elif [ "${1:-}" = get-state ]; then
  echo device
elif [ "${1:-}" = shell ] && [ "${2:-}" = pidof ]; then
  echo 7007
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = meminfo ]; then
  echo 'TOTAL PSS: 51200 TOTAL RSS: 64000'
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = package ]; then
  echo 'versionCode=26 versionName=2.0.7'
elif [ "${1:-}" = shell ] && [ "${2:-}" = cat ]; then
  printf '%s\n' 'Name: cue-helper' 'VmRSS: 64000 kB' 'Threads: 7'
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = thermalservice ]; then
  echo 'Thermal Status: 0'
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = cpuinfo ]; then
  echo '  2.0% 7007/com.fnaf2.cuehelper: 7007'
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = window ]; then
  echo 'mCurrentFocus=Window{123 u0 com.scottgames.fnaf2/com.scottgames.fnaf2.Main}'
  echo '  Window #7 Window{456 u0 FNaF 2 Cue Helper HUD}'
  echo '    WindowStateAnimator{789 FNaF 2 Cue Helper HUD}'
  echo '    mAlertWindows={Window{456 u0 FNaF 2 Cue Helper HUD}}'
elif [ "${1:-}" = shell ] && [ "${2:-}" = sh ] && [ "${3:-}" = -s ]; then
  cat >/dev/null
  # The latency verb sends PORT COUNT TOKEN, so an all-digit $6 is a sample
  # loop, not an exchange. Emit COUNT samples per group for the reporter.
  case "${6:-}" in
    [0-9]*)
      if ! printf '%s' "${6:-}" | grep -q '[^0-9]'; then
        i=0
        while [ "$i" -lt "$6" ]; do
          echo "read $((48000 + i))"
          echo "grid $((52000 + i))"
          echo "base $((22000 + i))"
          i=$((i + 1))
        done
        exit 0
      fi ;;
  esac
  # args: shell sh -s -- PORT VERB TOKEN [ARG]
  case "${6:-}/${8:-}" in
    # Keep this line field-for-field with what the device sends. It is
    # `CaptureService.currentSnapshot()`, and `audio=EXTERNAL` is deliberate:
    # the APK no longer owns an AudioRecord; the receiver host owns that path.
    #
    # Why that matters more than tidiness: every consumer reads this line with a
    # greedy sed, and greedy `.*` binds to the LAST match. `trial.sh`'s
    # cue trace wants `.*luma=...*cam05_mean_luma=...*ageUs=...`, which against the old
    # mock did not match at all -- so the mock answered a shape no runner could
    # parse and the regression still went green. A trailing field is exactly the
    # kind of addition that silently re-points a capture group, and a mock that
    # lags the device cannot catch it.
    #
    # cam05_mean_luma is deliberately unequal to luma so a transposed capture group shows.
    GET/*) echo 'OK snapshotNs=9000 visual=OBSERVED seq=121 rgba=1,2,3 luma=2 cam05_mean_luma=37 grey=142 gridLuma=24 ageUs=1200 content=2400x1080 visible=1 screen=FNAF2_NIGHT screenScore=100 detectorLatencyMs=1 monitorUp=true monitorReason=anchors-up cameraSelected=cam:5 cameraHighlights=cam:5 cameraReason=single-camera-highlight batteryPercent=75 batteryReason=bars-observed audio=EXTERNAL authority=audio-authority state=UNKNOWN reason=external-authority-not-connected' ;;
    GRID/*)
      # 180 cells, with the sampled cell (3,6) = index 123 made distinctive.
      printf 'OK grid=20x9 seq=121 '
      i=0
      while [ "$i" -lt 180 ]; do
        if [ "$i" -eq 123 ]; then printf 'ffffff'; else printf '10%02x%02x' "$((i % 256))" "$(( (i * 7) % 256 ))"; fi
        i=$((i + 1))
      done
      echo ;;
    WATCH/status) echo 'OK watch=OFF spec=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa entries=23' ;;
    WATCH/*) echo 'OK watch=ACTIVE spec=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa entries=23' ;;
    READ/*|READ) echo 'OK read=OBSERVED spec=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa seq=122 snapshotNs=10000 ageUs=1200 bb_left_luma=194 bb_left_yellowness=-111 battery_bar_1=194 battery_bar_2=194 battery_bar_3=80 battery_bar_4=20 cam05_mean_luma=37 screen_grey_cells=142 foxy_hall_mean_luma=37 foxy_hall_mean_redness=0 foxy_hall_red_cells=0 pan_anchor_state=OBSERVED pan_anchor_x=1162 pan_anchor_y=116 pan_anchor_area=836 pan_anchor_margin=624 pan_anchor_confidence=746 pan_anchor_reason=component-margin' ;;
    OVERLAY/*) echo 'OK overlay=UNQUALIFIED(self-capture-unqualified) gate=UNQUALIFIED(self-capture-unqualified) updates=0 draws=0 dropped=0 cadenceSamples=0 updateToDrawMs=p50:0.00,p95:0.00,p99:0.00 drawIntervalMs=p50:0.00,p95:0.00,p99:0.00' ;;
    CAL/on) echo 'OK cal=on' ;;
    CAL/off) echo 'OK cal=off' ;;
    REC/*) echo 'OK rec=cue-1700000000000-p0-q1.wav frames=16000 rate=16000 bytes=32044' ;;
    LOG/start) echo 'OK log=started max=480' ;;
    LOG/stop) echo 'OK rec=cue-1700000000001-p0-q7.wav frames=112000 rate=16000 bytes=224044 startNs=123456789000' ;;
    MODEL/status|MODEL/reload|ARM/*|RESULT/*) echo 'ERROR audio-authority-external' ;;
    *) echo 'ERROR unknown-verb' ;;
  esac
elif [ "${1:-}" = exec-out ] && [ "${2:-}" = run-as ]; then
  # 44-byte header plus a little payload, so the size guard is exercised.
  printf 'RIFF____WAVEfmt _________________________data____'
  printf '\0\0\1\0\2\0\3\0'
elif [ "${1:-}" = shell ] && [ "${2:-}" = run-as ]; then
  :
elif [ "${1:-}" = forward ] && [ "${2:-}" = --remove ]; then
  :
elif [ "${1:-}" = forward ]; then
  echo "${MOCK_FORWARD_PORT:?mock adb forward needs MOCK_FORWARD_PORT}"
elif [ "${1:-}" = logcat ]; then
  echo "$(date +%s).000 I/FnafCueHelper(7007): RUNNING visual=OBSERVED seq=120 rgba=1,2,3 luma=2 ageUs=1500 content=2400x1080 visible=1 audio=EXTERNAL authority=audio-authority state=UNKNOWN reason=external-authority-not-connected control=READY port=49707 socket=com.fnaf2.cuehelper.control token=0123456789abcdef0123456789abcdef"
else
  echo "unexpected mock adb invocation: $*" >&2
  exit 1
fi
