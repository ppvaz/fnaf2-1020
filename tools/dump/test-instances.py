#!/usr/bin/env python3
"""Check the frame-instance reader against a synthetic dump.

No game content: the fixture below is hand-written, so this runs anywhere.

What it defends is the one rule that is easy to get backwards. A frame
instance's OI is in the same space as an event handle, so it is named through
the same XOR-28 lookup, and its image is the item-table row OI ^ 28 -- the row
the dumper did NOT read. The 2026-08-26 reader named instances by the raw row
and reversed every placed object; the recompiled Office init refutes that
reading (186 of 189 objects at the dump instance's X, Y by raw OI, 2 through
the XOR). docs/android/SOURCE-DUMP-GUIDE.md section 4.
"""
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from readdump import Dump

# Handles are chosen so the two readings disagree: 66 ^ 28 == 94, 127 ^ 28 == 99.
# The item table is pre-XOR: row 94 holds the object events call 66, and each
# instance line carries the image of its raw row.
FIXTURE = """GAME\tfixture\tBUILD\t296\tFRAMES\t1
OBJECTS
OBJECT\t66\tTYPE\t2\tNAME\tleft light\tVALUES\t\tSTRINGS\t
OBJECT\t94\tTYPE\t2\tNAME\tcam 11\tVALUES\t\tSTRINGS\t
OBJECT\t99\tTYPE\t7\tNAME\tviewing hall light\tVALUES\t\tSTRINGS\t
FRAME\t0\t04-Office\tGROUPS\t1
 F\tWIDTH\t1600\tHEIGHT\t768\tLAYERS\t2\tINSTANCES\t3
 L\tIDX\t0\tNAME\tLayer 1\tXC\t1\tYC\t1
 L\tIDX\t1\tNAME\tLayer 2\tXC\t1\tYC\t1
 I\tINST\t0\tOI\t66\tNAME\tleft light\tX\t-276\tY\t634\tLAYER\t3\tPTYPE\t0\tPARENT\t0\tINSTNUM\t0\tW\t58\tH\t88\tHOTX\t28\tHOTY\t42
 I\tINST\t1\tOI\t94\tNAME\tcam 11\tX\t-274\tY\t482\tLAYER\t3\tPTYPE\t0\tPARENT\t0\tINSTNUM\t1\tW\t59\tH\t40\tHOTX\t29\tHOTY\t20
 I\tINST\t2\tOI\t127\tNAME\t?\tX\t-867\tY\t102\tLAYER\t5\tPTYPE\t0\tPARENT\t0\tINSTNUM\t2\tW\t\tH\t\tHOTX\t\tHOTY\t
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
        cam11, light, hall = frame["instances"]
        checks = []

        def check(label, got, want):
            checks.append((label, got, want))

        check("frame size", (frame["size"]["WIDTH"], frame["size"]["HEIGHT"]),
              ("1600", "768"))
        check("layer count", len(frame["layers"]), 2)
        check("instance count", len(frame["instances"]), 3)
        check("groups still parse", len(frame["groups"]), 1)

        # The rule: an instance is named exactly as an event with the same handle.
        check("event handle 94 -> left light", dump.name(94), "left light")
        check("instance 94 -> left light", dump.placed(light), "left light")
        check("instance 66 -> cam 11", dump.placed(cam11), "cam 11")
        check("instance read through the XOR, like events",
              dump.placed(cam11) == dump.name(66), True)

        # The image follows the name: instance 66 draws row 94's image (59x40).
        check("extent uses row OI ^ 28 and subtracts the hotspot",
              dump.extent(cam11), (-305, 614, -246, 654))
        check("instance 94 draws row 66's image (58x88)",
              dump.extent(light), (-302, 440, -244, 528))
        check("a non-Active true object has no extent", dump.extent(hall), None)
        check("and its image is not 'missing'", dump.image_known(hall), True)

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
        check("instances command prints the true name, raw oi and box",
              "left light" in out.stdout and "oi=94" in out.stdout
              and "box x[-302..-244] y[440..528]" in out.stdout, True)

        bad = [c for c in checks if c[1] != c[2]]
        for label, got, want in checks:
            print("%-4s %-48s %s" % ("FAIL" if got != want else "ok", label,
                                     "" if got == want else "got %r want %r" % (got, want)))
        print("\n%d/%d checks passed" % (len(checks) - len(bad), len(checks)))
        return 1 if bad else 0
    finally:
        os.unlink(path)


if __name__ == "__main__":
    sys.exit(main())
