#!/bin/bash
# Print the complete program that runs ON THE PHONE, to stdout.
#
# `trial.sh` used to carry this as one 1619-line heredoc, inside a 2934-line
# file -- 47% over the working agreement's ceiling, in the script that touches
# the device. You cannot `source` into a heredoc: the phone gets one stream of
# text on stdin and nothing else, so splitting it means assembling it.
#
# The parts are named for what they DO, not for which layer they are. Reading
# `10-minus7-sweep.sh` tells you where the strategy lives; reading
# `08-bb-threat-response.sh` tells you where Balloon Boy is answered. The old
# file said only "trial-minus7.sh, line 1900-ish".
#
# ORDER IS SEMANTIC, NOT ALPHABETICAL BY ACCIDENT. This is `sh`, not a module
# system: every definition must precede its first use, and `01-arguments.sh`
# must come first because it consumes the positionals with `shift`. The numeric
# prefixes exist to make the order impossible to get wrong by renaming, and
# PARTS below is the authority -- a glob would silently include an editor
# backup and push it to the phone.
#
# The guarantee that made this refactor safe, and that keeps it safe:
# test-trial-assembly.sh asserts this output is BYTE-IDENTICAL to the program
# the shipped runner sends. Behaviour cannot drift across the split, and the
# tests that extract functions from the driver read this rather than grepping a
# source file -- so they check the artifact that is actually delivered.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PARTS='
01-arguments.sh
02-hid-wire.sh
03-clock.sh
04-session.sh
05-press.sh
06-cams-up-anchor.sh
07-light-and-capture.sh
08-bb-threat-response.sh
09-constants.sh
10-minus7-sweep.sh
11-plan-interpreter.sh
12-night-loop.sh
'

for part in $PARTS; do
  path="$HERE/$part"
  # A missing part would push a truncated program to the phone, which would
  # run -- `sh` does not need a complete file to start executing one -- and
  # fail somewhere in the middle of a night.
  [ -f "$path" ] || { echo "trial: missing driver part $part" >&2; exit 2; }
  cat "$path"
done
