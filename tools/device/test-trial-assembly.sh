#!/bin/bash
# The assembled device driver must be a complete, ordered, syntactically valid
# program -- and the runner must send exactly it. No phone.
#
# `trial.sh` was 2934 lines, 47% over the working agreement's ~2000-line
# ceiling, and 1619 of those lines were a heredoc that runs on the PHONE. You
# cannot source into a heredoc, so the parts under trial/ are concatenated and
# piped to `adb shell sh -s` instead.
#
# That makes assembly a new way to be wrong, and this is the gate for it. The
# failure it exists to prevent is specific and quiet: `sh` starts executing a
# script before it has read all of it, so a truncated or misordered driver does
# not fail at launch. It runs, presses real buttons, and dies somewhere in the
# middle of a night that then has to be diagnosed from a recording.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-assembly.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

bash "$HERE/trial/assemble.sh" > "$TMP/driver.sh"
[ -s "$TMP/driver.sh" ] || fail "assemble.sh produced nothing"

# 1. The runner must SEND the assembled program, and carry no second copy.
#
# The whole guarantee rests on there being one driver. A heredoc left behind in
# the runner would be what the phone actually gets, while every check here
# passed on a file nothing used.
runner="$(cat "$HERE/legacy-trial.sh")"
case "$runner" in
  *'< "$REMOTE_PROGRAM" &'*) ;;
  *) fail "legacy-trial.sh does not send the assembled driver on stdin" ;;
esac
case "$runner" in
  *"<<'REMOTE'"*) fail "legacy-trial.sh still carries an inline driver heredoc" ;;
esac
grep -q 'trial/assemble.sh' "$HERE/legacy-trial.sh" || fail "legacy-trial.sh does not assemble the driver"

# 2. It parses under the shell the PHONE actually runs.
#
# Which is mksh, not POSIX sh -- Android's /system/bin/sh has been mksh since
# 4.4. That is not a detail: the driver opens the HID coprocess with
#
#     /system/bin/hid - |&
#
# and `|&` is a ksh/mksh coprocess operator. `dash` refuses it outright and
# bash 3.2 refuses it too, so validating this program with `sh -n` on a
# developer machine reports a syntax error in working code -- which is how this
# check was first written, and it failed on its first run for exactly that
# reason.
#
# So it is checked with a ksh-family shell when one is present, and says
# UNKNOWN with the reason when none is. A skip that announces itself is worth
# more than a check that fails because the host's shell moved: the CI workflow
# pins its JDK and Python for the same reason.
syntax_shell=""
for candidate in mksh ksh93 ksh; do
  command -v "$candidate" >/dev/null 2>&1 && { syntax_shell="$candidate"; break; }
done
if [ -n "$syntax_shell" ]; then
  "$syntax_shell" -n "$TMP/driver.sh" ||
    fail "the assembled driver does not parse under $syntax_shell (the phone runs mksh)"
  syntax_note="parses under $syntax_shell"
else
  syntax_note="syntax UNKNOWN(no mksh/ksh on this host; the phone runs mksh and the driver uses its |& coprocess)"
  echo "  note: $syntax_note" >&2
fi

# 3. Every part is included, in the order assemble.sh names, exactly once.
#
# A glob would have ordered these by accident and silently swept in an editor
# backup. PARTS is the authority; this checks it against what is on disk, so a
# new part file that nobody added to the list fails here instead of being left
# out of the program.
listed="$(sed -n '/^PARTS=/,/^.$/p' "$HERE/trial/assemble.sh" | grep -o '^[0-9][0-9]-[a-z0-9-]*\.sh' || true)"
[ -n "$listed" ] || fail "could not read the PARTS list out of assemble.sh"
ondisk="$(cd "$HERE/trial" && ls -1 [0-9][0-9]-*.sh)"
[ "$listed" = "$ondisk" ] || fail "assemble.sh's PARTS and trial/ disagree:
  listed: $(echo "$listed" | tr '\n' ' ')
  ondisk: $(echo "$ondisk" | tr '\n' ' ')"

expected=0
while read -r part; do
  expected=$((expected + $(wc -l < "$HERE/trial/$part")))
done <<< "$listed"
actual=$(wc -l < "$TMP/driver.sh")
[ "$expected" -eq "$actual" ] || fail "assembled $actual lines from parts totalling $expected"

# 4. Ordering is semantic, and `sh` has no forward declarations.
#
# 01-arguments.sh must come first because it consumes the positionals with
# `shift`; a part ahead of it that read $1 would read a coordinate as a pidfile.
first="$(echo "$listed" | head -1)"
[ "$first" = "01-arguments.sh" ] || fail "the driver must start with 01-arguments.sh, not $first"
head -3 "$TMP/driver.sh" | grep -q 'PIDFILE=$1' || fail "the driver does not consume its positionals first"

# 5. Every function the driver calls is defined before its first call site.
#
# This is what ordering actually buys, so it is checked rather than trusted.
# Definitions inside the file are what matter; `sh` builtins and device
# binaries obviously are not defined here, so only names the driver itself
# defines are checked.
python3 - "$TMP/driver.sh" <<'PY' || fail "the assembled driver calls a function before defining it"
import re, sys
lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
defined = {}
for i, line in enumerate(lines):
    m = re.match(r'^([a-z_0-9]+)\(\) *\{', line)
    if m and m.group(1) not in defined:
        defined[m.group(1)] = i
bad = []
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('#'):
        continue
    for name, at in defined.items():
        # a call is the name at the start of a command position
        if re.search(rf'(^|[;&|]|\bthen\b|\bdo\b|\belse\b|\$\()\s*{re.escape(name)}\b(?!\(\))', line):
            if i < at:
                bad.append(f"line {i+1} calls {name}(), defined at line {at+1}")
for b in bad[:10]:
    print(b, file=sys.stderr)
sys.exit(1 if bad else 0)
PY

echo "trial assembly: $actual lines from $(echo "$listed" | wc -l | tr -d ' ') named parts, $syntax_note, \
nothing defined after its first call, and trial.sh sends exactly this"
