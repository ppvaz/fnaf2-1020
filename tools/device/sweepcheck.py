#!/usr/bin/env python3
"""Did the sweep actually *flash* each camera, not merely select it?

camtrace.py reads the lime highlight on the camera map, which answers "which
camera is selected". A Minus 7 sweep exists to apply the camera-light stun, and
that needs the light on *while* that camera is the selected feed. A trace of
selections alone cannot tell a working sweep from three selections in the dark
-- the same distinction HID-MULTITOUCH.md draws when it says two Android
pointer dots are not sufficient evidence.

This pairs both signals per frame: the map highlight for the camera, and the
feed's own brightness for the light. A lit frame is several times the unlit
baseline, so the threshold is taken from the recording rather than hardcoded.

Usage: sweepcheck.py VIDEO [--fps 60] [--expect 10,4,7]
"""
import argparse
import subprocess
import sys

WIDTH, HEIGHT = 1280, 576
# A feed row varying by less than this across the ROI is a tear band, not
# scene content. Clean frames carry zero such rows; torn frames carry 17-134.
BAND_FLAT = 12
MAP = {10: (1091, 384), 4: (923, 379), 7: (947, 328), 11: (1213, 365)}
FEED = (60, 60, 620, 430)


def stream(path, fps, pix, depth):
    """Yield decoded frames one at a time.

    This used to buffer the whole decode with capture_output and then slice it
    into a second full copy. A 440 s night at 60 fps is 26,400 frames of
    1280x576x3, about 58 GB, and the grader was OOM-killed ("Killed: 9")
    partway through a cleared Night 1 -- taking with it the only instrument
    that says whether the sweep's light actually flashed.

    Nothing here ever needed a frame twice: both callers reduce each frame to
    one scalar. So the frames stream and only the two scalar series are kept.
    """
    size = WIDTH * HEIGHT * depth
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={WIDTH}:{HEIGHT}",
         "-f", "rawvideo", "-pix_fmt", pix, "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield buf
    finally:
        proc.stdout.close()
        err = proc.stderr.read()
        # A decoder that dies mid-file must not read as a short video: this
        # tool's whole job is saying what the run contained.
        if proc.wait():
            sys.stderr.buffer.write(err)
            raise SystemExit(proc.returncode)


def selected(frame):
    best, score = None, 0
    for cam, (cx, cy) in MAP.items():
        s = 0
        for y in range(max(0, cy - 24), min(HEIGHT, cy + 25), 2):
            for x in range(max(0, cx - 48), min(WIDTH, cx + 49), 2):
                i = (y * WIDTH + x) * 3
                r, g, b = frame[i:i + 3]
                if r > 100 and g > 100 and b < 100 and g > b * 1.5:
                    s += 1
        if s > score:
            best, score = cam, s
    return best if score >= 30 else None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--fps", type=int, default=60)
    p.add_argument("--expect", default="10,4,7")
    p.add_argument("--lit-ratio", type=float, default=2.0,
                   help="times the unlit baseline that counts as a lit feed")
    a = p.parse_args()

    x0, y0, x1, y1 = FEED

    def luma(f):
        """Mean feed brightness over TEXTURED rows only.

        The camera switch tears the frame, and a torn frame is a composite of
        two rendered states separated by near-uniform white bands. Averaging
        the whole ROI counts those bands as brightness and inverts the answer:
        measured at 60 fps on hid-sweep-probe.mp4, a torn-and-unlit frame reads
        176-199 while a clean-and-lit one reads 88-92. That is how this tool
        reported 68/75 sweeps flashed on a night where the flash is not what it
        was seeing.

        Excluding torn frames instead is no better -- it drops so many that the
        camera selection stops registering (0/21 on the same recording).

        So drop the band ROWS and keep the picture. A row that varies by less
        than BAND_FLAT across the ROI is part of a tear, not of the scene.
        Reference frames, from CAM 11 unless noted, in
        captures/frames-tearing-vs-flash:

            dark          0 band rows, 18.5
            lit           0 band rows, 114.6
            tearing     123 band rows, 21.3
            tearing+lit 118 band rows, 136.2   (CAM 10 -- absent on CAM 11,
                                                which is where the sweep
                                                returns with the light already
                                                released)

        The measure sees the flash THROUGH a tear, which is what makes it
        usable: state four is the one that matters and it is not reachable by
        excluding torn frames.

        A frame with no textured row at all returns None -- fully torn, no
        opinion. It is not 0, which would read as a confident dark.
        """
        textured = []
        for y in range(y0, y1, 4):
            r = y * WIDTH
            row = [f[r + x] for x in range(x0, x1, 16)]
            if max(row) - min(row) >= BAND_FLAT:
                textured.append(sum(f[r + x] for x in range(x0, x1, 4))
                                / len(range(x0, x1, 4)))
        return sum(textured) / len(textured) if textured else None

    feed = [luma(f) for f in stream(a.video, a.fps, "gray", 1)]
    # None = fully torn, no opinion. Never counted as lit and never as dark.
    readable = sum(1 for f in feed if f is not None)
    sel = [selected(f) for f in stream(a.video, a.fps, "rgb24", 3)]
    # Baseline from the monitor-up frames that are not flashing: the lower
    # quartile of frames where some camera is selected.
    up = sorted(feed[i] for i, s in enumerate(sel)
                if s is not None and feed[i] is not None)
    if not up:
        print("no camera ever selected"); raise SystemExit(1)
    base = up[len(up) // 4]
    thresh = base * a.lit_ratio

    want = [int(v) for v in a.expect.split(",")]

    # The flash lands during the camera STAGGER -- the transition frames where
    # the map highlight is between buttons and selected() returns None. At the
    # LIGHT_AFTER geometry the select's Click sets `viewing` and THEN the light
    # is pressed, so the bright frames come BEFORE that camera's highlight
    # settles: frame-by-frame on c33-stable, camN's flash is a None run that
    # ends when sel first reads camN. The strict "highlight == camN on the same
    # frame as the bright feed" rule discarded every one of them.
    #
    # So attribute each None frame FORWARD to the next target-camera selection
    # within `stagger` frames (the transition is INTO it); fall back to the
    # previous one only if there is no forward match. Forward-first is what
    # keeps the 04->07 transition's flash on 07 instead of on 04.
    stagger = max(1, round(a.fps * 0.12))          # ~120 ms of transition
    nxt = [None] * len(sel)
    prv = [None] * len(sel)
    seen = None
    for i in range(len(sel) - 1, -1, -1):
        if sel[i] in want:
            seen = (i, sel[i])
        nxt[i] = seen
    seen = None
    for i in range(len(sel)):
        if sel[i] in want:
            seen = (i, sel[i])
        prv[i] = seen
    attributed = list(sel)
    for i, cam in enumerate(sel):
        if cam is not None:
            continue
        if nxt[i] and nxt[i][0] - i <= stagger:
            attributed[i] = nxt[i][1]
        elif prv[i] and i - prv[i][0] <= stagger:
            attributed[i] = prv[i][1]

    sweeps, cur, last11 = [], {}, True
    lit_run, gap = False, 0
    for i, cam in enumerate(attributed):
        if cam == 11:
            if cur and not last11:
                sweeps.append(cur); cur = {}
            last11 = True
            lit_run = False
            continue
        if cam is None:
            continue
        last11 = False
        bright = feed[i] is not None and feed[i] >= thresh
        if bright:
            cur[cam] = cur.get(cam, 0) + 1
            if not lit_run:
                cur["_clusters"] = cur.get("_clusters", 0) + 1
            lit_run, gap = True, 0
        elif lit_run:
            gap += 1
            if gap > 2:            # two dark frames end a cluster
                lit_run = False
    if cur:
        sweeps.append(cur)

    # HONEST LIMIT. A fast (c33) sweep lights each camera for 2-4 frames on a
    # tearing feed, and adjacent flashes can merge -- so the per-camera counts
    # under-resolve a sweep the eye calls fine, and frame-by-frame inspection
    # of captures/c33-stable.mp4 shows all three flashing on every sweep where
    # this reports gaps. This tool reliably catches a whole sweep going DARK;
    # it does not certify a fast sweep. For that, dump the frames (--dump DIR)
    # and look, or check the game effect (did the CAM 04 / CAM 07 occupant get
    # pinned).
    print(f"{a.video}: unlit baseline {base:.0f}, lit threshold {thresh:.0f}")
    lit_sweeps = 0
    for n, s in enumerate(sweeps, 1):
        got = [c for c in want if s.get(c)]
        missing = [c for c in want if not s.get(c)]
        cl = s.get("_clusters", 0)
        # "lit" = every camera per-frame, OR most cameras plus >=len(want)-1
        # distinct clusters (the merge-adjacent-flashes case).
        sweep_ok = not missing or (len(got) >= len(want) - 1 and cl >= len(want) - 1)
        if sweep_ok:
            lit_sweeps += 1
        detail = " ".join(f"cam{c:02d}={s.get(c,0)}f" for c in want)
        print(f"  sweep {n}: {detail}  clusters={cl}"
              + ("" if sweep_ok else "   DARK: " + ",".join(f"cam{c:02d}" for c in missing)))
    print(f"summary: {lit_sweeps}/{len(sweeps)} sweeps lit "
          f"(every camera, or all-but-one plus enough distinct flashes)")
    if lit_sweeps < len(sweeps):
        sys.exit(1)


if __name__ == "__main__":
    main()
