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
elif [ "${1:-}" = shell ] && [ "${2:-}" = cat ]; then
  printf '%s\n' 'Name: cue-helper' 'VmRSS: 64000 kB' 'Threads: 7'
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = thermalservice ]; then
  echo 'Thermal Status: 0'
elif [ "${1:-}" = shell ] && [ "${2:-}" = dumpsys ] && [ "${3:-}" = window ]; then
  echo 'mCurrentFocus=Window{123 u0 com.scottgames.fnaf2/com.scottgames.fnaf2.Main}'
elif [ "${1:-}" = logcat ]; then
  echo "$(date +%s).000 I/FnafCueHelper(7007): RUNNING visual=OBSERVED seq=120 rgba=1,2,3 luma=2 ageUs=1500 content=2400x1080 visible=1 audio=OBSERVED rate=16000 frames=32000 rms=9 peak=20 ageUs=3000 control=READY port=49707 token=0123456789abcdef0123456789abcdef"
else
  echo "unexpected mock adb invocation: $*" >&2
  exit 1
fi
