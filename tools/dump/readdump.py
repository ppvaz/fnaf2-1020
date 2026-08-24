#!/usr/bin/env python3
"""Read the Fusion event-sheet dump with object handles unscrambled.

The Android runtime XORs every object handle with 28 at load, and events
address objects *after* that XOR, so a raw dump labels every event with the
wrong object name. This reader resolves each handle through the XOR before
looking the name up, which is the only way the dump means anything.

Read docs/android/SOURCE-DUMP-GUIDE.md first -- it explains the file format, the handle
scramble, and the alterable-value vocabulary these commands print.

The dump itself is game content: it lives outside the repo. Point --dump (or
$FNAF2_DUMP) at it; regenerate it with tools/dump/regen-dump.sh.

  readdump.py frames                     every frame and its group count
  readdump.py objects [pattern]          objects by event-space handle
  readdump.py group 3 413-418            print a group range
  readdump.py find 3 "balloon boy"       groups whose text matches
  readdump.py object 3 "balloon boy"     groups referencing an object
  readdump.py writes 3 "balloon boy" 0   groups whose actions write its value 0
  readdump.py sounds 3                   sample handles played, and by which groups
  readdump.py sounds 3 21                the groups that play one sample handle

PC dumps (Fusion builds before the Android scramble) need --xor 0.
"""
import argparse
import os
import re
import sys

DEFAULT_DUMP = os.environ.get(
    "FNAF2_DUMP", "/private/tmp/fnaf2-android-dump/events-android.txt")

# "6:Sample:Sample '<obfuscated name>' handle: N" is a play-sample action.
SAMPLE_RE = re.compile(r"Sample:Sample .*? handle: (\d+)")
POSITION_RE = re.compile(r"Object Info: (\d+)")
# ParamObject renders as "Object <oil> <handle> <type>" (see ParamObject.cs).
PARAMOBJECT_RE = re.compile(r"Object (\d+) (\d+) (\d+)")


class Dump:
    def __init__(self, path, xor=28):
        self.xor = xor
        self.objects = {}          # stored handle -> name as the item table has it
        self.frames = []           # [{idx, name, groups: [{idx, header, lines}]}]
        frame = group = None
        with open(path, errors="replace") as handle:
            for raw in handle:
                line = raw.rstrip("\n")
                field = line.split("\t")
                if field[0] == "OBJECT":
                    self.objects[int(field[1])] = field[5]
                elif field[0] == "FRAME":
                    frame = {"idx": int(field[1]), "name": field[2], "groups": []}
                    self.frames.append(frame)
                elif field[0] == "GROUP":
                    group = {"idx": int(field[1]), "header": dict(zip(field[2::2], field[3::2])),
                             "lines": []}
                    frame["groups"].append(group)
                elif line.startswith(" C") or line.startswith(" A"):
                    group["lines"].append(line)

    def name(self, handle):
        """True name of the object an event addresses by `handle`."""
        return self.objects.get(handle ^ self.xor, "?%d" % handle)

    def render(self, line):
        field = line.split("\t")
        kind = field[0].strip()
        cell = dict(zip(field[1::2], field[2::2]))
        handle = int(cell.get("OI", "0"))
        # Fusion stores condition negation in OtherFlags bit 0.
        negated = kind == "C" and int(cell.get("COTHER", "0") or 0) & 1
        params = line.split("PARAMS\t", 1)[1] if "PARAMS\t" in line else ""
        # Position parameters carry event-space handles too: unscramble them so
        # a route hop reads "-> cam 10" instead of a meaningless number.
        params = POSITION_RE.sub(
            lambda m: "Object Info: %s [%s]" % (m.group(1), self.name(int(m.group(1)))),
            params)
        params = PARAMOBJECT_RE.sub(
            lambda m: "Object %s %s [%s] %s" % (
                m.group(1), m.group(2), self.name(int(m.group(2))), m.group(3)),
            params)
        return "  %s%s ot=%s num=%s oi=%s [%s] %s" % (
            "!" if negated else " ", kind, cell.get("OT"), cell.get("NUM"),
            handle, self.name(handle), params)

    def text(self, group):
        return "\n".join(self.render(line) for line in group["lines"])

    def show(self, frame_index, group):
        header = group["header"]
        print("FRAME %d GROUP %d  flags=%s conds=%s acts=%s" % (
            frame_index, group["idx"], header.get("FLAGS"),
            header.get("CONDS"), header.get("ACTS")))
        print(self.text(group))
        print()

    def samples(self, group):
        """Sample handles this group plays, in action order."""
        played = []
        for _, line in self.actions(group):
            played.extend(int(h) for h in SAMPLE_RE.findall(line))
        return played

    def actions(self, group):
        for line in group["lines"]:
            if line.startswith(" A"):
                field = line.split("\t")
                yield dict(zip(field[1::2], field[2::2])), line


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dump", default=DEFAULT_DUMP)
    parser.add_argument("--xor", type=int, default=28,
                        help="handle scramble; 28 on Android, 0 on PC builds")
    parser.add_argument("command", choices=["frames", "objects", "group", "find",
                                            "object", "writes", "sounds"])
    parser.add_argument("args", nargs="*")
    opts = parser.parse_args()

    if not os.path.exists(opts.dump):
        sys.exit("no dump at %s -- see docs/android/SOURCE-DUMP-GUIDE.md" % opts.dump)
    dump = Dump(opts.dump, opts.xor)

    if opts.command == "frames":
        for frame in dump.frames:
            print("%3d  %-34s %5d groups" % (frame["idx"], frame["name"], len(frame["groups"])))
        return

    if opts.command == "objects":
        pattern = opts.args[0].lower() if opts.args else ""
        for stored, name in sorted(dump.objects.items()):
            if pattern and pattern not in name.lower():
                continue
            # Events address this object as stored^xor; print that handle first.
            print("%4d  %s" % (stored ^ opts.xor, name))
        return

    frame_index = int(opts.args[0])
    frame = dump.frames[frame_index]

    if opts.command == "group":
        span = opts.args[1]
        low, _, high = span.partition("-")
        low, high = int(low), int(high or low)
        for group in frame["groups"]:
            if low <= group["idx"] <= high:
                dump.show(frame_index, group)
        return

    if opts.command == "find":
        needle = opts.args[1].lower()
        for group in frame["groups"]:
            if needle in dump.text(group).lower():
                dump.show(frame_index, group)
        return

    if opts.command == "object":
        target = opts.args[1].lower()
        for group in frame["groups"]:
            if any(dump.name(int(dict(zip(l.split("\t")[1::2], l.split("\t")[2::2]))
                                  .get("OI", "0"))).lower() == target
                   for l in group["lines"]):
                dump.show(frame_index, group)
        return

    if opts.command == "sounds":
        wanted = int(opts.args[1]) if len(opts.args) > 1 else None
        index = {}
        for group in frame["groups"]:
            for handle in dump.samples(group):
                index.setdefault(handle, []).append(group["idx"])
        if wanted is not None:
            for group in frame["groups"]:
                if wanted in dump.samples(group):
                    dump.show(frame_index, group)
            return
        # A sample played by one group is a candidate cue; a sample played by
        # many is shared, and cannot identify a state edge on its own.
        for handle in sorted(index):
            groups = index[handle]
            print("sample %3d  %2d group(s)  %s%s" % (
                handle, len(groups), ", ".join(str(g) for g in groups[:12]),
                " ..." if len(groups) > 12 else ""))
        return

    if opts.command == "writes":
        target = opts.args[1].lower()
        value = "AlterableValue%s " % opts.args[2] if len(opts.args) > 2 else "AlterableValue"
        for group in frame["groups"]:
            for cell, line in dump.actions(group):
                if (dump.name(int(cell.get("OI", "0"))).lower() == target
                        and value in line):
                    dump.show(frame_index, group)
                    break
        return


if __name__ == "__main__":
    main()
