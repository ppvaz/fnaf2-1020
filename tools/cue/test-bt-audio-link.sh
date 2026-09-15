#!/usr/bin/env bash
# Phone-free check of bt-audio-link.sh's one piece of logic: the uiautomator
# node -> tap point parser. The fixture is cut from the Moto g56's Bluetooth
# settings dump of 2026-09-15 (portrait 1080x2400), with the host entry under
# "Media devices" and look-alike text around it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LINK="$HERE/bt-audio-link.sh"
fixture='<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0">
<node index="0" text="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]">
<node index="1" text="Media devices" class="android.widget.TextView" bounds="[193,557][454,604]" />
<node index="2" text="pedro-82cg headset" class="android.widget.TextView" bounds="[312,400][589,440]" />
<node index="3" text="pedro-82cg" class="android.widget.TextView" bounds="[312,663][589,729]" />
<node index="4" text="SBC" class="android.widget.TextView" bounds="[322,736][417,773]" />
<node index="5" text="Active" class="android.widget.TextView" bounds="[312,773][414,818]" />
</node></hierarchy>'
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got '$2' want '$3'"; fail=1; fi; }

check "exact name, centre of its bounds" "$(printf '%s' "$fixture" | "$LINK" --tap-point pedro-82cg)" "450 696"
check "a prefix match is not the device" "$(printf '%s' "$fixture" | "$LINK" --tap-point pedro-82c || echo none)" "none"
check "an absent name fails" "$(printf '%s' "$fixture" | "$LINK" --tap-point other-host || echo none)" "none"
check "a section header is matched only by its own text" "$(printf '%s' "$fixture" | "$LINK" --tap-point 'Media devices')" "323 580"
check "--tap-point without a name refuses" "$("$LINK" --tap-point < /dev/null 2>/dev/null || echo refused)" "refused"

[ "$fail" = 0 ] && echo "bt-audio-link: tap-point parser pass" || exit 1
