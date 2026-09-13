# Night 7: the frame trace was pulled on the Custom Night dial screen (2026-09-13)

A negative finding about the instrument, not the route. Every Night 7 trace
that "died ~3 s before the onset" was stopped by `night-run.sh` itself.

The runner's end-of-night watcher pulls the native frame trace the moment the
campaign log carries a `state=gameover` or `state=sixam` observation. On seven
of the twelve traced Night 7 runs the lifecycle observer labelled the Custom
Night dial screen -- every dial at 20, the Golden Freddy preset, the frame
taken right before the Ready contact -- as `state=gameover`. The watcher
pulled the trace on that label, 6-8 s before the first `state=night`
observation, and the helper spent the rest of the night on its slow detector
path (about 8 fps, reads 400 ms old, screen UNKNOWN) because the trace's drain
loop was already off.

| run | trace's last frame (UTC) | first `state=gameover` | first `state=night` | pulled (local) | NIGHT rows |
| --- | --- | --- | --- | --- | --- |
| i2 | 18:44:19.2 | none | 18:44:18.2 | 15:44:20 | 165 |
| i3 | 18:51:25.7 | none | none | 15:51:27 | 0 |
| i4 | 18:55:22.4 | none | none | 15:55:24 | 0 |
| i5 | 18:58:19.9 | 18:58:19.2 | 18:58:25.6 | 15:58:21 | 0 |
| i6 | 19:01:46.4 | 19:01:45.2 | 19:01:51.1 | 16:01:47 | 0 |
| j2 | 21:22:35.9 | none | 21:18:53.8 | 18:22:41 | 11866 |
| j3 | 22:03:39.1 | none | 22:02:36.9 | 19:03:42 | 3268 |
| j4 | 22:09:47.6 | 22:09:47.5 | 22:09:53.3 | 19:09:49 | 0 |
| j5 | 22:23:40.0 | 22:23:39.2 | 22:23:47.2 | 19:23:41 | 0 |
| j6 | 22:26:34.4 | 22:26:33.9 | 22:26:40.9 | 19:26:35 | 0 |
| j7 | 22:33:05.3 | 22:33:04.6 | 22:33:10.6 | 19:33:06 | 0 |
| j8 | 22:43:18.8 | 22:43:18.6 | 22:43:26.7 | 19:43:20 | 0 |

The trace's last frame is `elapsed_ns` mapped through the phone's uptime and
wall clock read in one shell; the observation times are the campaign log's;
"pulled" is the mtime of the run's `frame-trace.file`. In every frozen run the
trace ends 0.1-1.3 s after the false label and the pull lands 1-2 s later,
inside the black intro. i3 and i4 never reached the night (flow failures fixed
by i5/i6). The three runs without the false label kept their trace through the
night. The helper's own frame counter agrees: on j8 the campaign's reads show
sequence 1001 at the trace's end and 1053 at the first gate read, then about
eight frames per second with `ageUs` near 400000, where j2 shows 59 fps and
`ageUs` under 20000 throughout.

Why the dial screen reads as a game over (`screenstate.py`, 32x32
downsample): the red-face box holds the orange preset arrows and the
red-faced portraits (0.078 against the 0.05 floor) and the text box holds the
white preset name (0.142 against 0.08). What separates it: the game over
screen is black above the face -- bright fraction 0.000 in x 100-2300,
y 40-260 on all ten real game overs (Nights 5-6, 2026-09-12/13) -- while the
dial screen's portraits read 0.215 there on all seven captured dial frames.

Reproduction without the campaign (`cnprobe1`, trace started on the title,
Custom Night entered by adb taps, Golden Freddy preset, Ready 100 ms): the
trace ran 5857 frames through the intro (black at 60 fps, one 1239 ms gap,
then NIGHT) and was never lost. The helper is not the fault.

Changes: `screenstate.py` refuses `gameover` when the portrait band's bright
fraction is 0.05 or more (`GAMEOVER_TOP_BRIGHT_MAX`, a decade above the
measured zero and a quarter of the dial reading); `test-screenstate.py`
carries a game over fixture and the same fixture with portraits; the runner's
watcher accepts `gameover`/`sixam` only after a `state=night` observation, so
the next lookalike cannot pull the trace either. The false `gameover` had no
effect on the campaign itself, which went on to the intro and the night.

Consequence for the record: the Night 7 delivered epochs of i5, i6 and j4-j8
are UNKNOWN because their traces were stopped before the onset, not because
the Custom Night intro breaks the helper. j4's 403 s is still an outlier of a
run whose epoch was never measured.
