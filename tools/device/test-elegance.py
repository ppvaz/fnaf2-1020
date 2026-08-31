#!/usr/bin/env python3
"""Regressions for elegance.py. No phone, no dump, no recipe.mjs.

The bug this file exists for has now happened four times, always the same way:
a route action that answers several threats gets attributed to one animatronic,
and the tool then grades the run's actual defence as waste on a night that
animatronic sits out. The sweep was Foxy's (39% reported, 72% true), the vent
read was Balloon Boy's, CAM 11 was the Puppet's alone and the mask was the
Toys'. So the pins here are on the TABLE, not on a headline number: what each
label serves, that every class the table names can be priced, and that the
compound HID macros are charged to the thing each contact does.
"""
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import importlib.util
spec = importlib.util.spec_from_file_location(
    "elegance", os.path.join(HERE, "elegance.py"))
elegance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(elegance)


class Serves(unittest.TestCase):
    def test_labels_map_to_their_audited_class(self):
        for label, want in [
                ("wind", "puppet"),
                ("cam11", "cam11"), ("cam-11", "cam11"),
                ("sweep", "stun"), ("cam10", "stun"), ("cam-07", "stun"),
                ("hall", "hall"), ("flash-hall", "hall"),
                ("read", "@observation"),
                ("left-vent-light", "@observation"),
                ("left-view", "@observation"),
                ("mask", "maskable"), ("mask-on", "maskable"),
                ("monitor-verify", "@correction"),
                ("monitor-resync", "@correction"),
                ("monitor-resync-2", "@correction"),
                ("monitor", "@transport"),
                ("mute", "@setup"),
                ("cams", "@unattributed")]:
            self.assertEqual(elegance.serves(label), want, label)

    def test_read_is_not_unattributed(self):
        # `read` is the plan's name for the vent capture. It reaches serves()
        # only when a macro expansion starts before it, which is why it went
        # unnoticed as @unattributed -- the one run log in the tree happens to
        # log its reads individually.
        self.assertEqual(elegance.serves("read"), "@observation")

    def test_the_mask_does_not_answer_withered_foxy(self):
        # g824 ticks his approach counter once a second; g825 ticks it AGAIN
        # while the mask is fully on. The mask makes Foxy strictly worse, so
        # listing him here would grade a Foxy-free night's masks as needed for
        # a threat the mask is feeding.
        self.assertNotIn("foxy", elegance.CLASS_IDS["maskable"])

    def test_the_hall_flash_is_not_a_camera_stun(self):
        # Its state is `viewing hall light`, written only with the monitor DOWN
        # (g489). It must never share a class with the sweep, which needs
        # `viewing > 0`.
        self.assertNotEqual(elegance.CLASS_IDS["hall"],
                            elegance.CLASS_IDS["stun"])
        self.assertIn("withfreddy", elegance.CLASS_IDS["hall"])   # g848/849

    def test_every_class_the_table_names_can_be_priced(self):
        for pattern, who in elegance.SERVES:
            if who.startswith("@"):
                continue
            self.assertIn(who, elegance.CLASS_IDS, pattern)

    def test_every_class_id_exists_in_the_sourced_ai_table(self):
        # A typo'd id is the silent failure: canAct() returns peak 0 for a name
        # nothing sets, so the whole class grades as WASTED on every night and
        # reads like a finding.
        with open(os.path.join(REPO, "packages", "core", "src", "mechanics", "config.js")) as f:
            config = f.read()
        table = config[config.index("AI_BY_NIGHT"):config.index("aiUpdates")]
        known = set(re.findall(r"(\w+):\s*(?:\d+|\{ oneIn)", table))
        for cls, ids in elegance.CLASS_IDS.items():
            self.assertTrue(ids, cls)
            for i in ids:
                self.assertIn(i, known, f"{cls}: {i}")


class Contacts(unittest.TestCase):
    def test_a_compound_macro_is_charged_to_each_thing_it_does(self):
        # `maskraise 180 hall 134` is one HID macro only because the
        # mask -> monitor seam drops presses; it is three purposes.
        self.assertEqual(elegance.instruction_contacts("maskraise",
                                                       ["180", "hall", "134"]),
                         [("mask", 1), ("hall", 1), ("monitor", 1)])
        self.assertEqual(elegance.instruction_contacts("maskraise",
                                                       ["180", "up", "0"]),
                         [("mask", 1), ("monitor", 1)])
        self.assertEqual(elegance.instruction_contacts("hallraise", ["133"]),
                         [("hall", 1), ("monitor", 1)])

    def test_the_split_does_not_change_how_many_contacts_were_sent(self):
        for kind, rest, want in [("maskraise", ["180", "hall", "134"], 3),
                                 ("maskraise", ["180", "up", "0"], 2),
                                 ("hallraise", ["133"], 2),
                                 ("sweep", ["120", "100", "10,4,7"], 5),
                                 ("read", ["600", "40"], 2),
                                 ("tap", ["monitor", "100"], 1),
                                 ("hold", ["wind", "916"], 1),
                                 ("hall", ["133"], 1)]:
            got = sum(n for _, n in elegance.instruction_contacts(kind, rest))
            self.assertEqual(got, want, kind)

    def test_a_tap_is_labelled_by_what_it_taps(self):
        self.assertEqual(elegance.instruction_contacts("tap", ["cam11", "100"]),
                         [("cam11", 1)])
        self.assertEqual(elegance.instruction_contacts("hold", ["wind", "916"]),
                         [("wind", 1)])


CYCLES = {"clear": [("tap", ["monitor", "100"]),
                    ("read", ["600", "40"]),
                    ("maskraise", ["180", "hall", "134"]),
                    ("tap", ["cam11", "100"]),
                    ("hold", ["wind", "916"]),
                    ("sweep", ["120", "100", "10,4,7"])]}


class Parse(unittest.TestCase):
    def _log(self, body):
        fd, path = tempfile.mkstemp(suffix="-run.log")
        with os.fdopen(fd, "w") as f:
            f.write(body)
        self.addCleanup(os.remove, path)
        return path

    def test_a_macro_expands_from_its_start_index_through_the_plan(self):
        log = self._log("     0 ms  monitor\n"
                        "   367 ms  left-vent-light\n"
                        "   400 ms  macro clear[2..999]\n")
        got = elegance.parse(log, CYCLES)
        self.assertEqual(got, [("monitor", 1), ("left-vent-light", 1),
                               ("mask", 1), ("hall", 1), ("monitor", 1),
                               ("cam11", 1), ("wind", 1), ("sweep", 5)])

    def test_an_unrecognised_macro_is_one_unattributed_contact(self):
        log = self._log("   400 ms  macro nosuchcycle[0..9]\n")
        self.assertEqual(elegance.parse(log, CYCLES), [("@unattributed", 1)])

    def test_the_classifier_verdict_line_is_not_an_input(self):
        # classify-bb-left is the read's RESULT, printed by
        # 08-bb-threat-response.sh; counting it would double-count the capture.
        log = self._log("   367 ms  left-vent-light\n"
                        "   900 ms  classify-bb-left empty cams=down\n")
        self.assertEqual(elegance.parse(log, CYCLES), [("left-vent-light", 1)])


if __name__ == "__main__":
    unittest.main()
