#!/usr/bin/env python3
"""Check the frame-instance reader against a synthetic dump.

No game content: the fixture below is hand-written, so this runs anywhere.

What it defends is the one rule that is easy to get backwards. Event handles
are XOR-28 scrambled and frame instance handles are *not*, so the same integer
in two line types names two different objects. Reading an instance through the
XOR silently renames every placed object -- exactly the failure
docs/android/SOURCE-DUMP-GUIDE.md section 4 records for events, but in the
opposite direction.
"""
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from readdump import Dump

# Handles are chosen so the two readings disagree: 66 ^ 28 == 94.
FIXTURE = """GAME\tfixture\tBUILD\t296\tFRAMES\t1
OBJECTS
OBJECT\t66\tTYPE\t2\tNAME\tleft light\tVALUES\t\tSTRINGS\t
OBJECT\t94\tTYPE\t2\tNAME\tcam 11\tVALUES\t\tSTRINGS\t
OBJECT\t99\tTYPE\t7\tNAME\tviewing hall light\tVALUES\t\tSTRINGS\t
FRAME\t0\t04-Office\tGROUPS\t1
 F\tWIDTH\t1600\tHEIGHT\t768\tLAYERS\t2\tINSTANCES\t2
 L\tIDX\t0\tNAME\tLayer 1\tXC\t1\tYC\t1
 L\tIDX\t1\tNAME\tLayer 2\tXC\t1\tYC\t1
 I\tINST\t0\tOI\t66\tNAME\tleft light\tX\t-276\tY\t634\tLAYER\t3\tPTYPE\t0\tPARENT\t0\tINSTNUM\t0\tW\t58\tH\t88\tHOTX\t28\tHOTY\t42
 I\tINST\t1\tOI\t99\tNAME\tviewing hall light\tX\t-867\tY\t102\tLAYER\t5\tPTYPE\t0\tPARENT\t0\tINSTNUM\t1\tW\t\tH\t\tHOTX\t\tHOTY\t
GROUP\t0\tFLAGS\t0\tRESTRICT\tFalse\tCONDS\t1\tACTS\t0
 C\tOT\t2\tNUM\t-27\tOI\t94\tNAME\tcam 11\tOIL\t0\tCFLAGS\t0\tCOTHER\t0\tPARAMS\t50:AlterableValue:AlterableValue0
"""


def main():
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        handle.write(FIXTURE)
        path = handle.name
    try:
        dump = Dump(path, 28)
        frame = dump.frames[0]
        checks = []

        def check(label, got, want):
            checks.append((label, got, want))

        check("frame size", (frame["size"]["WIDTH"], frame["size"]["HEIGHT"]),
              ("1600", "768"))
        check("layer count", len(frame["layers"]), 2)
        check("instance count", len(frame["instances"]), 2)
        check("groups still parse", len(frame["groups"]), 1)

        # The rule. Event handle 94 is cam 11's scrambled name for `left light`;
        # instance handle 66 is `left light` directly. Swap them and both lie.
        check("event handle 94 -> left light", dump.name(94), "left light")
        check("instance handle 66 -> left light",
              dump.placed(frame["instances"][0]), "left light")
        check("instance is NOT read through the XOR",
              dump.placed(frame["instances"][0]) != dump.name(66), True)

        # Fusion draws the image with its hotspot on the object's position.
        check("extent subtracts the hotspot",
              dump.extent(frame["instances"][0]), (-304, 592, -246, 680))
        check("no image -> no extent", dump.extent(frame["instances"][1]), None)

        # The new line types must not leak into the event lines.
        check("condition line intact", dump.render(frame["groups"][0]["lines"][0]).strip(),
              "C ot=2 num=-27 oi=94 [left light] 50:AlterableValue:AlterableValue0")

        # The `instances` command runs end to end.
        out = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                          "readdump.py"), "--dump", path,
             "instances", "0", "left"],
            capture_output=True, text=True)
        check("instances command exits 0", out.returncode, 0)
        check("instances command prints the box",
              "box x[-304..-246] y[592..680]" in out.stdout, True)

        bad = [c for c in checks if c[1] != c[2]]
        for label, got, want in checks:
            print("%-4s %-40s %s" % ("FAIL" if got != want else "ok", label,
                                     "" if got == want else "got %r want %r" % (got, want)))
        print("\n%d/%d checks passed" % (len(checks) - len(bad), len(checks)))
        return 1 if bad else 0
    finally:
        os.unlink(path)


if __name__ == "__main__":
    sys.exit(main())
