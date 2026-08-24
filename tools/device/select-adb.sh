#!/bin/bash
# Select one phone transport for a caller that uses plain `adb` commands.
#
# An explicit ANDROID_SERIAL always wins. Otherwise prefer one healthy USB
# transport, falling back to one healthy wireless transport only when USB is
# absent. Never let adb's own "more than one device" failure happen midway
# through a timed trial.

fnaf_select_adb_transport() {
  local listing usb_serials wireless_serials candidates transport state

  if [ -n "${ANDROID_SERIAL:-}" ]; then
    state=$(adb -s "$ANDROID_SERIAL" get-state 2>/dev/null || true)
    if [ "$state" != "device" ]; then
      echo "ANDROID_SERIAL is not a ready ADB device: $ANDROID_SERIAL" >&2
      return 1
    fi
    export ANDROID_SERIAL
    echo "ADB transport: $ANDROID_SERIAL (explicit)" >&2
    return 0
  fi

  if ! listing=$(adb devices -l); then
    echo "could not list ADB devices" >&2
    return 1
  fi
  usb_serials=$(printf '%s\n' "$listing" | awk '
    $2 == "device" {
      for (i = 3; i <= NF; i++) {
        if ($i ~ /^usb:/) {
          print $1
          next
        }
      }
    }
  ')
  wireless_serials=$(printf '%s\n' "$listing" | awk '
    $2 == "device" {
      usb = 0
      for (i = 3; i <= NF; i++) if ($i ~ /^usb:/) usb = 1
      if (!usb && ($1 ~ /:/ || $1 ~ /^adb-/ || $1 ~ /_adb-tls-connect/)) print $1
    }
  ')

  if [ -n "$usb_serials" ]; then
    candidates=$usb_serials
    transport=USB
  else
    candidates=$wireless_serials
    transport=wireless
  fi

  # ADB serials contain no shell whitespace, so positional parameters provide
  # a Bash-3-compatible count without arrays or mapfile.
  set -- $candidates
  if [ "$#" -eq 0 ]; then
    echo "no ready USB or wireless ADB device found" >&2
    return 1
  fi
  if [ "$#" -ne 1 ]; then
    echo "multiple ready $transport ADB devices found; set ANDROID_SERIAL to one of:" >&2
    printf '  %s\n' "$@" >&2
    return 1
  fi

  ANDROID_SERIAL=$1
  export ANDROID_SERIAL
  state=$(adb -s "$ANDROID_SERIAL" get-state 2>/dev/null || true)
  if [ "$state" != "device" ]; then
    echo "selected $transport ADB device is no longer ready: $ANDROID_SERIAL" >&2
    return 1
  fi
  echo "ADB transport: $ANDROID_SERIAL ($transport)" >&2
}

fnaf_select_adb_transport
