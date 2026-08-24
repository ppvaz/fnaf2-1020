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
elif [ "${1:-}" = shell ] && [ "${2:-}" = sh ] && [ "${3:-}" = -s ]; then
  cat >/dev/null
  # args: shell sh -s -- PORT VERB TOKEN [ARG]
  case "${6:-}/${8:-}" in
    GET/*) echo 'OK snapshotNs=9000 visual=OBSERVED seq=121 rgba=1,2,3 luma=2 ageUs=1200 content=2400x1080 visible=1 audio=OBSERVED frames=33000 rms=10 peak=21 readAgeUs=1000' ;;
    CAL/on) echo 'OK cal=on' ;;
    CAL/off) echo 'OK cal=off' ;;
    REC/*) echo 'OK rec=cue-1700000000000-p0-q1.wav frames=16000 rate=16000 bytes=32044' ;;
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
  echo "$(date +%s).000 I/FnafCueHelper(7007): RUNNING visual=OBSERVED seq=120 rgba=1,2,3 luma=2 ageUs=1500 content=2400x1080 visible=1 audio=OBSERVED rate=16000 frames=32000 rms=9 peak=20 ageUs=3000 control=READY port=49707 socket=com.fnafminus7.cuehelper.control token=0123456789abcdef0123456789abcdef"
else
  echo "unexpected mock adb invocation: $*" >&2
  exit 1
fi
