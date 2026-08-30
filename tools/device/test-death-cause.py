#!/usr/bin/env python3
"""Phone-free contract for the shadow-only visual Foxy observation."""
import importlib.util
import json
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent


def load():
    spec = importlib.util.spec_from_file_location("death_cause", HERE / "death-cause.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def frame(kind, variant=0):
    im = Image.new("RGB", (1280, 576), (8, 8, 10))
    d = ImageDraw.Draw(im)
    if kind == "foxy":
        # A deliberately coarse jumpscare-like positive. The real model is
        # built from labelled frames, not from this fixture; this only checks
        # the envelope and UNKNOWN protocol.
        d.ellipse((260 + variant, 50, 1010, 565), fill=(130, 35, 20))
        d.polygon(((250, 280), (450, 160), (650, 290), (830, 150), (1050, 300)),
                  fill=(205, 70, 28))
        d.rectangle((420, 300, 850, 435), fill=(18, 15, 14))
        d.rectangle((500, 215, 585, 270), fill=(235, 235, 190))
        d.rectangle((700, 205, 785, 260), fill=(235, 235, 190))
    elif kind == "office":
        d.rectangle((0, 500, 1280, 555), fill=(105, 25, 70))
        d.rectangle((30, 80, 220, 120), fill=(200, 200, 200))
        d.rectangle((850, 80, 1120, 190), fill=(20, 40, 80))
    else:
        d.rectangle((80, 80, 1100, 500), fill=(40, 45, 90))
        for x in range(150, 1100, 120):
            d.rectangle((x, 120, x + 30, 150), fill=(240, 240, 240))
    return im


def main():
    dc = load()
    failed = 0

    def check(ok, message):
        nonlocal failed
        if not ok:
            print(f"FAIL {message}")
            failed += 1

    with tempfile.TemporaryDirectory() as root:
        root = Path(root)
        positive = root / "positive"
        negative = root / "negative"
        positive.mkdir(); negative.mkdir()
        for i in range(3):
            frame("foxy", i * 3).save(positive / f"p{i}.png")
        frame("office").save(negative / "office.png")
        frame("title").save(negative / "title.png")
        model = dc.build_model(positive, negative)
        check(model["authorized_for"] == "shadow",
              "the visual death model was not hard-bound to shadow mode")
        check(model["training"]["positive_images"] == 3 and
              model["training"]["negative_images"] == 2,
              "the model did not record its labelled sample counts")
        check(dc.classify_image(frame("foxy", 1), model)["state"] == "OBSERVED",
              "a labelled Foxy-shaped frame was not observed")
        unknown = dc.classify_image(frame("office"), model)
        check(unknown["state"] == "UNKNOWN",
              "an office control became a Foxy cause")
        bad = dc.classify_image(Image.new("RGB", (1000, 576), (0, 0, 0)), model)
        check(bad["state"] == "UNKNOWN" and "aspect" in bad["reason"],
              "an uncalibrated sensor geometry was not refused")

        # The lifecycle authority is still independent. A cause label can
        # close only after the last office segment and a captured tail; an
        # isolated Foxy-looking observation in the middle of a night is not a
        # death verdict.
        timeline_spec = importlib.util.spec_from_file_location(
            "run_timeline", HERE / "run-timeline.py")
        timeline = importlib.util.module_from_spec(timeline_spec)
        timeline_spec.loader.exec_module(timeline)
        th = {"staticRoughnessMin": 12}
        not_terminal = timeline.terminal_outcome(
            [["office", 0, 5]], ["office"] * 5, [0] * 5, 1, th,
            [None, "foxy", None, None, None])
        check(not_terminal["outcome"] == "unknown",
              "an in-night cause observation overrode lifecycle authority")
        terminal = timeline.terminal_outcome(
            [["office", 0, 3], ["other", 3, 5]],
            ["office", "office", "office", "other", "other"],
            [0] * 5, 1, th, [None, None, None, "foxy", None])
        check(terminal["outcome"] == "death" and terminal["cause"] == "foxy" and
              terminal["evidence"] == "visual-foxy-jumpscare",
              "post-office Foxy cause did not produce shadow death evidence")

    if failed:
        print(f"{failed} death-cause check(s) failed")
        return 1
    print("death cause: labelled visual Foxy envelope is shadow-only and lifecycle-safe")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
