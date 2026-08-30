#!/usr/bin/env python3
"""Classify whether the CAM 11 map button is lit on a monitor screencap.

This is the Minus Toys `--minimal` arm verifier. The split-camera glitch is
armed when the monitor raise leaves `viewing` on CAM 11 with the marker parked
on CAM 09, and the button highlight is driven from `viewing` by groups g46-57,
so a lit CAM 11 button means the raise restored CAM 11 -- the arm landed. A
dark CAM 11 beside a lit CAM 09 is exactly the r3 state: not armed, feed on
Show Stage, wind button absent, music box unwoundable, Puppet death at ~4 AM
(2026-08-29 device runs `n1-minustoys-minimal-20260829-r{2,3}`).

Why the button and not the feed caption: the highlight is opaque UI at a fixed
position drawn from the state this check exists to read. Measured on the two
2026-08-29 recordings (1280x576 screenrecord, crop
x 1152..1224 / y 336..362, green mean over 1872 px):

  lit   (r2, armed, 8 frames across 215 s):  228.0 .. 229.7
  unlit (r3, not armed, 6 frames / 165 s):   110.2 .. 111.8
  office frame, monitor down (r3 @ 2 s):      34
  main menu after death       (r3 @ 312 s):   16

Bands: green >= 170 lit, <= 140 unlit, otherwise unknown -- the nearest
cluster edge is 28 points away (unlit), so any state this instrument has not
seen (mid-animation frame, an unforeseen overlay) lands in unknown rather
than voting. CAM 09's own button is lit in BOTH r2 and r3 (167 measured in
each): it confirms the monitor is up with the map drawn, but only CAM 11
discriminates armed from not-armed, because the arm's marker is parked there
in both outcomes.

Reads a PNG from stdin (an `adb exec-out screencap -p` stream) or a file path.
Prints one self-describing line and exits 0; the verdict is data, not an
error. Geometry is normalized fractions of the frame, so the same crop works
on the 1280x576 recordings and the g56's native 2400x1080 landscape screencap;
a portrait-sized frame is rotated into landscape first, because the map is a
landscape UI.
"""
import subprocess
import sys

# Crop fractions, from the 1280x576 recording frame the numbers above were
# measured on: the CAM 11 button fill (inside its border).
X0, X1 = 1152 / 1280, 1224 / 1280
Y0, Y1 = 336 / 576, 362 / 576
# CAM 09, context only -- reported raw, never interpreted.
C9X0, C9X1 = 1132 / 1280, 1204 / 1280
C9Y0, C9Y1 = 278 / 576, 304 / 576

LIT_AT = 170.0
UNLIT_AT = 140.0


def decode(png_bytes):
    """PNG bytes -> (w, h, rgb bytes), rotated to landscape if portrait."""
    p = subprocess.run(
        ['ffmpeg', '-v', 'error', '-f', 'image2pipe', '-i', '-',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        input=png_bytes, capture_output=True, check=True)
    raw = p.stdout
    # rawvideo carries no header; get the true dimensions from the source.
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height', '-of', 'csv=p=0', '-'],
        input=png_bytes, capture_output=True, check=True)
    w, h = (int(v) for v in probe.stdout.decode().strip().split(','))
    if h <= w:
        return w, h, raw
    # Portrait frame: rotate 90 degrees clockwise into landscape, because the
    # map is a landscape UI. CW means dst(col c, row r) = src(col r,
    # row (hp-1)-c) -- the source's left column becomes the output's top row.
    # Which way the phone rotates a landscape screencap is unverified on this
    # device; a wrong direction lands the crop on feed pixels and reads
    # unknown-or-unlit, never a false "armed".
    wp, hp = w, h
    w_out, h_out = hp, wp
    out = bytearray(w_out * h_out * 3)
    for r in range(h_out):
        o_row = 3 * r * w_out
        for c in range(w_out):
            i = 3 * ((hp - 1 - c) * wp + r)
            out[o_row + 3 * c: o_row + 3 * c + 3] = raw[i:i + 3]
    return w_out, h_out, bytes(out)


def green_mean(w, h, raw, fx0, fx1, fy0, fy1):
    x0, x1 = int(fx0 * w), int(fx1 * w)
    y0, y1 = int(fy0 * h), int(fy1 * h)
    total = n = 0
    for y in range(y0, y1):
        base = 3 * y * w
        for x in range(x0, x1):
            total += raw[base + 3 * x + 1]
            n += 1
    return total / n, n


def main():
    png = open(sys.argv[1], 'rb').read() if len(sys.argv) > 1 else sys.stdin.buffer.read()
    w, h, raw = decode(png)
    green, n = green_mean(w, h, raw, X0, X1, Y0, Y1)
    cam9, _ = green_mean(w, h, raw, C9X0, C9X1, C9Y0, C9Y1)
    if green >= LIT_AT:
        verdict = 'lit'
    elif green <= UNLIT_AT:
        verdict = 'unlit'
    else:
        verdict = 'unknown'
    edge = min(abs(green - LIT_AT), abs(green - UNLIT_AT))
    print(f'cam11lit verdict={verdict} green={green:.1f} cam9green={cam9:.1f} '
          f'px={n} frame={w}x{h} margin={edge:.1f}')


if __name__ == '__main__':
    main()
