# Low-cost visual checks inside the stock device

*Prototype added 2026-08-23. This is the inexpensive stock-game path between
the blind adb schedule and a rebuilt/instrumented game.*

## Result

Run the screenshot **and** the classifier in one device-side shell. Only the
classification (`match`, `clear`, or a few integer features) crosses adb:

```text
stock SurfaceFlinger -> screencap -> 12.4 KiB native helper -> local branch
                                               |
                                       no image leaves phone
```

The helper is [`tools/device/screencheck.c`](../../tools/device/screencheck.c). It is
a static, libc-free ARM64/Linux executable, so it does not need an APK, root,
an Android permission prompt, Python, an NDK runtime, or a writable game
package. It consumes Android's native 16-byte raw-screencap header and RGBA
rows from stdin. It also exits after the final row in the requested region,
instead of copying the rest of the image through the pipeline.

This removes the part that made reactive host driving untenable: a screenshot
is no longer transferred to the Mac, decoded there, and followed by another
adb command. `screencap` itself still has an unavoidable full-display capture
cost. On the connected Moto g56, the real 2400x1080 landscape pipeline measured
225 ms p95 over 30 interleaved samples. That leaves useful room inside the
shortest relevant visual response, but a target-specific classifier and its
following action still need an end-to-end holdout trial before live use.

## Build and install

The build uses Apple's clang for the ELF object and Rust's bundled `ld.lld` as
the cross-linker. No Android SDK/NDK is installed on this Mac.

```sh
tools/device/build-screencheck.sh /tmp/fnaf-screencheck
adb push /tmp/fnaf-screencheck /data/local/tmp/fnaf-screencheck
adb shell chmod 755 /data/local/tmp/fnaf-screencheck
```

The current binary is 12,680 bytes, AArch64, static, and has no dynamic interpreter.
The exact ARM binary executed successfully under an ARM64 Linux container; the
same algorithm's native host build passes synthetic header, raw-RGBA, ROI,
colour-count, threshold, model classification/rejection, replay, truncation,
and bounds checks:

```sh
python3 tools/device/test-screencheck.py
```

## Correct invocation boundary

Keep the pipe inside the quotes passed to `adb shell`:

```sh
adb shell 'screencap 2>/dev/null | /data/local/tmp/fnaf-screencheck stats 0 0 2400 1080 4'
```

Do **not** use this form for a timed check:

```sh
adb exec-out screencap | /tmp/fnaf-screencheck ...
```

That second pipe is a host pipe, so the full screenshot still crosses USB.
The real driver already executes as one long device-side `sh`; it should call
the helper directly within that remote program and branch before scheduling
its next press:

```sh
state=$(screencap 2>/dev/null |
  /data/local/tmp/fnaf-screencheck match \
    1950 675 2140 770 4  100 255 100 255 0 99  1000)
case "$state" in
  match) echo "CAM 10 lime highlight is selected" ;;
  clear) echo "CAM 10 is not selected" ;;
esac
```

The sample rule is only a smoke check for the known lime camera-selection UI,
not a Balloon Boy classifier. On a retained 1280x576 recording, the equivalent
CAM 10 region scored 1,952 basis points while CAM 10 was selected and zero while
CAM 04 was selected. This proves that the streaming primitive can make a real
visual decision, but threat frames still need their own calibration.

## Operations

All rectangles use half-open device pixels (`X0 Y0 X1 Y1`). `STEP=1` samples
every pixel; 2 or 4 is normally enough for a large UI/sprite and reduces the
classifier work.

```sh
# Means, dark/bright fractions (basis points), and horizontal edge strength.
screencheck stats X0 Y0 X1 Y1 STEP

# Fraction of sampled pixels inside inclusive R/G/B ranges, as 0..10000.
screencheck count X0 Y0 X1 Y1 STEP R0 R1 G0 G1 B0 B1

# The same colour fraction reduced locally to match/clear.
screencheck match X0 Y0 X1 Y1 STEP R0 R1 G0 G1 B0 B1 MIN_BPS

# Nearest-template classification. Output is LABEL score=N margin=N; uncertain
# frames are `unknown` according to the model's maximum score/minimum margin.
screencheck classify MODEL
```

`--rgba W H` after the operation skips the Android header. It exists for host
calibration against `ffmpeg -pix_fmt rgba -f rawvideo`; the in-device path
should use the default auto-sized screencap input.

The output is deliberately integer-only. A threshold rule can therefore live
inside Android's stock shell without `awk`, floating point, or another host
round trip.

## Building and replaying a model

`SCM1` models contain the ROI, sampling stride, a small normalized RGB grid,
and at most 64 labeled templates. The native process uses integer L1 distance;
there is no ML runtime or dynamic allocation. Capture raw samples at the exact
live resolution and view:

```sh
tools/device/capture-screen-sample.sh gf-office empty empty-01
tools/device/capture-screen-sample.sh gf-hall empty empty-01 1200 540 900
```

The optional coordinates hold a light/control on-device and capture after
`CAPTURE_DELAY` (default 350 ms), without inserting a host round trip between
the press and screenshot. Keep a hall hold below Golden Freddy's 1.67 s exposure
fuse. The capture tool checks game focus and refuses overwrite, but the operator
is still responsible for proving the label.

Build from calibration frames, requiring leave-one-out separation:

```sh
tools/device/build-screen-model.py \
  --roi X0,Y0,X1,Y1 --grid 12x8 --step 2 \
  --max-score 30 --min-margin 8 \
  --output captures/screencheck/gf-hall.scm \
  empty=captures/screencheck/gf-hall/empty/calibration \
  golden=captures/screencheck/gf-hall/golden/calibration \
  other=captures/screencheck/gf-hall/other/calibration
```

Do not use `--allow-errors` for a live model. It exists only to inspect a
non-separable calibration set. Replay independent holdouts through the same C
classifier before installing the model:

```sh
tools/device/replay-screen-model.py captures/screencheck/gf-hall.scm \
  empty=captures/screencheck/gf-hall/empty/holdout \
  golden=captures/screencheck/gf-hall/golden/holdout \
  other=captures/screencheck/gf-hall/other/holdout
```

Raw/PNG frames and models stay under ignored `captures/`; no game imagery is
committed. PNG input needs Pillow, while Android raw screencaps do not.

## Cost measurement

With the phone connected and in the intended orientation/view, run:

```sh
tools/device/bench-screencheck.sh 30 [model.scm]
```

It interleaves and reports min/p50/p95/max/mean for:

- `capture`: `screencap` with its output discarded;
- `classify`: one helper process reading a saved 10.4 MB RGBA frame at stride 4;
- `combined`: the intended device-local pipe.

The benchmark leaves the 12,680-byte helper installed and deletes only its explicit
`/data/local/tmp/fnaf-screencheck-benchmark-<pid>.raw` temporary frame. The
optional model is also removed from its explicit benchmark path.

Measured 2026-08-23 on the connected Moto g56 5G:

| View/workload | Samples | Capture p95 | Classify p95 | Combined p95 |
|---|---:|---:|---:|---:|
| FNaF 2 landscape, 2400x1080, full-frame stride-4 stats | 30 | 206 ms | 42 ms | 225 ms |
| Android portrait, 1080x2400, synthetic 16-template timing model | 30 | 227 ms | 53 ms | 246 ms |

The portrait model duplicated a settings screenshot across labels and was built
with `--allow-errors`; it validates classifier cost only, not accuracy. The
landscape combined median was 204 ms. A lower-value host sanity check classified
100 full 2400x1080 frames in 0.64 s total (6.4 ms each), confirming that Android
capture—not the feature distance—is the dominant cost.

For the Minus 7 response window, judge **p95 combined**, not the average. It
must leave room for the following `input swipe` (about 170 ms on the Moto) and
the game's roughly 0.7 s worst-case response window. The practical gate is:

```text
p95(combined visual check) + p95(input swipe) + safety margin < 700 ms
```

Using the measured 225 ms landscape visual p95 and the existing roughly 170 ms
duration-press measurement gives about 395 ms before game/render scheduling,
leaving about 305 ms against a 700 ms BB leaving window. This proves timing
feasibility, not classifier correctness. The final gate must measure the
specific model followed by the actual action in one device-side driver.

## Threat models and conservative branches

The execution path and cost are solved. BB now has independent holdout and live
branch evidence; Golden Freddy remains a provisional tripwire, and Toy Bonnie
is uncalibrated. Build separate models because each view has different lighting
and safe actions:

| Model/view | Required labels | Conservative live handling |
|---|---|---|
| `bb-cam05` | `empty`, `bb`, other occupants/static | Treat `bb` or `unknown` as a threat; schedule the left-opening defense check. A miss lets him permanently remove every light and causes the BB→Foxy chain. |
| `bb-left` | `empty`, `bb`, other vent views | Treat `bb` or `unknown` as present: monitor stays down and mask remains on for the sourced five continuous scheduler ticks. |
| `gf-office` | `empty`, `golden`, blackout/other | `golden` or `unknown` must mask; never raise the monitor or flash the hall. A prophylactic mask flick is cheaper and safer than vision in the normal Minus 7 cycle. |
| `gf-hall` | `empty`, `foxy`, `golden`/other | `golden` or `unknown` releases/avoids the hall light immediately; never spend the full 1.67 s exposure fuse. |
| `tb-right` | `empty`, `toy-bonnie`, other vent occupants | `toy-bonnie` or `unknown` keeps the right light/defense branch active. If a fixed light stall is acceptable, holding the right light is cheaper than classifying. |

The owned Night-6 AI table constrains collection: Toy Bonnie is AI 0 until
2 AM, then becomes 5. Golden Freddy is rarer but not impossible before 2 AM:
one night start in ten assigns him AI 1 (the other nine assign 0), and 2 AM
overwrites that result with AI 3. BB is active from 12 AM and rises from AI 5
to 9 at the 2 AM cliff, so his two views remain the easiest first calibration
targets. Custom Night/10/20 remains locked on the current save.

For each view:

1. Disable pointer/touch overlays. Collect multiple raw frames per class across
   static/noise phases, exact pan positions, and early/late-night lighting.
2. Split captures into calibration and untouched holdout sets before tuning the
   ROI, grid, maximum score, or margin.
3. Prefer a tight stable sprite/vent ROI. A color `match` is sufficient if it
   cleanly separates every retained frame; otherwise use the existing compact
   template model rather than adding a second inference stack.
4. Require zero observed false negatives on holdouts and exercise `unknown`
   with transitions, blackouts, other occupants, and deliberately shifted views.
5. Benchmark that exact model, then measure capture-to-action inside one remote
   shell. Preserve the working open-loop runner until the experimental branch
   passes screenrecord grading and selected-camera tracing.

The retained camera-button experiment produced a separated four-template model
on a tight 1280x576 CAM 10 button ROI and classified a later CAM 10 frame as
`cam10 score=7 margin=25`. That is a real visual/model-path proof, but it is UI
evidence—not evidence for any threat class.

## Live BB checkpoint (2026-08-23)

The `bb-left` candidate was built from runs G/H with 19 templates (15 empty,
two independent BB-opening frames, and two BB-inside negatives). Its untouched
run-I holdout contained 17 empty frames plus the difficult simultaneous frame:
BB in the lit left opening while a translucent Golden Freddy covered the
office. All 18 classified correctly; the BB frame was `score=0 margin=18`.

Run K then exercised the complete device-local branch on new live frames. One
raw screencap was reused for the BB-left and GF-office classifiers before any
hall input. Cycles 0–6 were BB `empty score=0 margin=19`; cycle 7 visibly showed
BB and returned `bb score=0 margin=18`. The provisional GF classifier returned
`empty score=0 margin=3` on all eight. The mask began 42 ms after the second
classification, and the dedicated status made host cleanup stop the game before
any hall input or capture pull. Offline replay of the untouched run-K split
reproduced all eight BB results.

This is a **detection-and-safe-stop checkpoint**, not yet a survivable response
loop. The seven completed cycles produced eight complete camera sweeps and 11
visible Foxy hall flashes, but the box fell from full to 9.5% before cycle 7's
wind. The added clean capture, prophylactic GF mask, post-mask hall gate, and
two classifications leave only a 1.3 s wind in each 6.5 s cycle. A preceding
run that delayed sampling until cycle 8 died to Foxy around 42 s; its first raw
sample was already full static and correctly rejected as `unknown`. Do not
extend the current branch or implement the five-tick BB clear/resynchronization
until the per-cycle wind deficit is recovered without weakening the hall gate.

The GF model used in run K is intentionally provisional: it has one real Golden
Freddy source frame duplicated only to exercise leave-one-out mechanics, plus
eight independent run-K negative frames. It may stop on `golden` or `unknown`,
but it is not evidence for skipping the prophylactic mask. A distinct positive
animation frame must pass as an untouched holdout first.

`GF_SKIP_MASK_ON_EXACT_EMPTY=1` exists only to collect that missing evidence
without repeating run K's box deficit. It accepts the narrower literal result
`empty score=0`, moves the fail-closed hall branch ahead of the omitted mask,
and expands the wind from 1.3 s to 2.0 s. It is off by default and must not be
described as validated GF defense until it stops on a new positive frame.
