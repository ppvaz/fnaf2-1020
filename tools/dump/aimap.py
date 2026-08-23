#!/usr/bin/env python3
"""Map every character's AI level, per hour and night, from an Office sheet.

This reads CTFAK's separately rendered `03-04-Office.txt` form, not the tabular
`events-android.txt` consumed by readdump.py. The relevant groups contain a
night comparison, an optional hour comparison, and `<name> AI` counter writes.
Levels are cumulative within a night; group 673 first zeroes all counters on
every night other than Custom Night.

  tools/dump/aimap.py [path/to/03-04-Office.txt]
  tools/dump/aimap.py --json

`$FNAF2_OFFICE_DUMP` overrides the default scratch path. The sheet is extracted
game content and stays outside the repository.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path


DEFAULT = Path(os.environ.get(
    "FNAF2_OFFICE_DUMP",
    "/private/tmp/fnaf2-android-dump/03-04-Office.txt",
))

GROUP = re.compile(r"^--- group (\d+) ---")
NIGHT = re.compile(r"IF\s+night -> CompareCounter \(COMPARISON\{(\S+) Long\[(\d+)\]\}")
HOUR = re.compile(r"IF\s+time of the night -> CompareCounter \(COMPARISON\{= Long\[(\d+)\]\}")
SET = re.compile(r"DO\s+(.+?) AI -> SetCounterValue \(EXPRESSION\{= (.+?)\}\)")
LONG = re.compile(r"^Long\[(\d+)\]$")
# (Random(D) + 1) / D uses integer division, so it is one only on D-1.
RAND = re.compile(
    r"Parenthesis Random Long\[(\d+)\] EndParenthesis Plus Long\[1\] "
    r"EndParenthesis Divide Long\[(\d+)\]"
)

NAMES = [
    "old Freddy", "old Bonnie", "old Chica", "old Foxy",
    "new Freddy", "new Bonnie", "new Chica", "new Foxy",
    "Balloon Boy", "Sockpuppet", "Paperpals", "Golden Freddy",
]
# Post-XOR, the dump's old/new names are Withered/Toy; new Foxy is Mangle.
PRETTY = {
    "old Freddy": "W. Freddy",
    "old Bonnie": "W. Bonnie",
    "old Chica": "W. Chica",
    "old Foxy": "W. Foxy",
    "new Freddy": "Toy Freddy",
    "new Bonnie": "Toy Bonnie",
    "new Chica": "Toy Chica",
    "new Foxy": "Mangle",
    "Balloon Boy": "BB",
    "Sockpuppet": "Puppet",
    "Paperpals": "PaperPals",
    "Golden Freddy": "G. Freddy",
}


def value(expression):
    match = LONG.match(expression)
    if match:
        return int(match.group(1))
    match = RAND.search(expression)
    if match and match.group(1) == match.group(2):
        return f"1/{int(match.group(1))}"
    # Night 7 copies the Custom Night dials rather than a fixed table.
    match = re.search(r"CounterValue\[cust_(.+?) AI\]", expression)
    if match:
        return "dial"
    return expression


def parse(path):
    groups = []
    current = None
    for line in path.read_text(errors="replace").splitlines():
        match = GROUP.match(line)
        if match:
            current = {
                "id": int(match.group(1)),
                "night": None,
                "night_op": None,
                "hour": None,
                "sets": [],
            }
            groups.append(current)
            continue
        if current is None:
            continue
        match = NIGHT.search(line)
        if match:
            current["night_op"], current["night"] = (
                match.group(1), int(match.group(2))
            )
        match = HOUR.search(line)
        if match:
            current["hour"] = int(match.group(1))
        match = SET.search(line)
        if match:
            current["sets"].append(
                (match.group(1).strip(), value(match.group(2).strip()))
            )
    return [group for group in groups if group["sets"] and group["night"] is not None]


def build(groups):
    """Replay the cumulative table groups for nights 1 through 7."""
    nights = {}
    for night in range(1, 8):
        levels = {name: 0 for name in NAMES}
        per_hour = {}
        for hour in range(0, 7):
            for group in groups:
                if group["night_op"] == "=" and group["night"] != night:
                    continue
                if group["night_op"] == "<>" and group["night"] == night:
                    continue
                group_hour = group["hour"] if group["hour"] is not None else 0
                if group_hour != hour:
                    continue
                for name, level in group["sets"]:
                    if name in levels:
                        levels[name] = level
            per_hour[hour] = dict(levels)
        nights[night] = per_hour
    return nights


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default=str(DEFAULT))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    path = Path(args.path)
    if not path.exists():
        raise SystemExit(f"no rendered Office sheet at {path}")

    nights = build(parse(path))
    if args.json:
        print(json.dumps(nights, indent=2))
        return

    print("AI level by hour, from the rendered Office event sheet.")
    print("Hour 0 is 12 AM; a value repeats until a later group overwrites it.")
    print(
        '"1/N" is `(Random(N)+1)/N` with integer division: one with '
        "probability 1/N, otherwise zero.\n"
    )
    for night in range(1, 8):
        label = "10/20 (Custom)" if night == 7 else f"Night {night}"
        print(f"=== {label} ===")
        print("character   " + "".join(f"{hour:>8}" for hour in range(7)))
        print(
            "            "
            + "".join(
                f"{'12AM' if hour == 0 else str(hour) + 'AM':>8}"
                for hour in range(7)
            )
        )
        for name in NAMES:
            row = [nights[night][hour][name] for hour in range(7)]
            if all(level == 0 for level in row):
                continue
            print(f"{PRETTY[name]:<12}" + "".join(f"{str(level):>8}" for level in row))
        print()


if __name__ == "__main__":
    main()
