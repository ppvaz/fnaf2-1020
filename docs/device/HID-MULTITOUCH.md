# Android HID multitouch: the two traps

This note records the stock-device input work from 2026-08-24 so a later
session does not have to rediscover it. The target was a Moto g56 5G running
the official FNaF 2 Android v2.0.7 build, but both failures are general Android
HID concerns.

## Outcome

`/system/bin/hid` can drive reliable two-finger input without root. A verified
report stream held contact 0 on the camera-light control while contact 1 tapped
CAM 10, CAM 04, and CAM 07. The recording contained the complete
`10 -> 04 -> 07 -> 11` selected-camera trace while the light stayed down.

The working device fixture is
[`tools/device/hid-multitouch-smoke.json`](../../tools/device/hid-multitouch-smoke.json).
It is a **device action**: it selects 6th Night and injects touches. Do not run
it unless the game is focused and it is safe to start that night.

## Night 6 strategy consequence

HID buys enough cycle time to change **where** Balloon Boy is detected; it does
not make Balloon Boy safe to ignore. The exact simulator's HID schedule with no
BB read or response survived **0/3000** Night 6 runs, predominantly through the
BB-to-Foxy failure chain.

CAM 05 is therefore not the selected Night 6 checkpoint. The project already
has a device-validated classifier for BB in the lit left opening, including two
independent positives and an untouched simultaneous BB/Golden-Freddy frame.
That check uses the left vent light, which does not consume flashlight battery.
The HID time saving belongs there: shorten the camera sweep, keep the
once-per-cycle left-opening read, and start the five-tick mask response only
when that read is non-empty. CAM 05 remains useful for calibration or strategy
comparison, not as a required step in the intended Night 6 controller.

This is a route decision, not a claimed clear. The phase-independent simulator
policy now survives **10000/10000** ordinary and **3000/3000** pinned-worst
Night 6 runs, with no missed BB state, a minimum 56% box, and a compact 267 ms
three-camera sweep. Its all-threat negative control fails, so the classifier
cannot safely fail closed on every cycle.

The 267 ms sweep in that result is an **idealized simulator actuator**, not a
phone result. Device trials below now prove that this distinction is
load-bearing. The former `HID_LEFT_SURVIVAL=1` pre-read probe was capped at four
cycles and is now retired from the device runner; it remains below only as a
historical measurement, not a selectable route.

## Night 7 sparse CAM 05 probe

Phase-aligning CAM 05 checks removes many unnecessary reads, but does not make
the measured lit-capture path affordable on 10/20 by itself. BB starts at CAM
10 and needs four successful five-second rolls to reach CAM 05, so 20.0 s is
the absolute arrival bound. A check immediately *before* that boundary is too
early: the first useful pre-boundary read completes just before 25 s (or it can
run immediately after 20 s). After a negative, every following five-second
boundary still needs coverage until BB is found.

A CAM 05 positive also does not guarantee that one raise will put BB in the
opening. His final hop retains the Night 7 75% movement roll. The controller
must lower across the opportunity, raise and read again, and repeat when he is
still on CAM 05; otherwise the nominal one-raise response silently fails one
time in four.

`tools/hidpilottest.mjs --night=7 --sparse-cam5` preserves those constraints.
With the current 520 ms lit-read model it survived **0/5000** ordinary and
**0/1000** pinned-worst nights: the battery reached zero and the resulting
failures were overwhelmingly Foxy. The same schedule with hypothetical unlit,
free reads survived **3000/3000** ordinary and **1000/1000** worst-luck nights,
with no missed BB states, proving that timing rather than route logic is the
barrier. It averaged 48.8 reads per ordinary night and 41 in worst luck.

A diagnostic 370 ms light hold survived **3000/3000 + 1000/1000**, but its
minimum remaining power was only 9 frames in the ordinary set. The phone needs
about 350 ms merely to draw a visibly lit vent, before screencap readiness, so
370 ms is an unvalidated and operationally fragile threshold—not a Night 7
controller claim. Sparse CAM 05 becomes viable only if an on-device immutable-
buffer test proves that acquisition bound with margin, or the base flashlight
cycle is made cheaper. Music-box time is not the limiting resource here.

### Cheaper phase-windowed left-opening candidate

CAM 05 is not the architecture floor. A sparse left-opening controller can use
the battery-free vent light, provided it controls the scheduler phase tightly:

1. Wait until BB can first have reached the opening.
2. Lower, clear a possible office Golden Freddy, and reset Foxy.
3. Acquire the free lit-left frame, then put on the prophylactic mask while the
   classifier finishes.
4. On an empty result, wind and land the normal late three-camera sweep. On BB,
   retain that mask through the aligned five ticks and recover before the prior
   camera stuns expire.

`tools/hidpilottest.mjs --night=7 --sparse-left` makes the dependency explicit.
At zero pilot offset it survived **10000/10000 ordinary and 3000/3000 pinned-
worst** nights with no missed BB state, a minimum 57% box, and **1257/3000**
flashlight frames remaining. A 340 ms offset survived another **1000/1000**;
345 ms survived only **1/1000**, overwhelmingly failing to Foxy. The useful
epoch window is therefore bounded between those measurements, not described as
generic timing tolerance.

That is a useful architecture upper bound, but it is **rejected for the stock
HID phone pilot**. Two independent device gates were measured rather than
inferred.

#### Scheduler phase: acquired

`DEVICE_EPOCH_LATCH=1` now detects the first immutable frame containing both
the top-right clock and full top-left flashlight meter entirely on-device. It
requires the signature on two consecutive frames but preserves the first
matching timestamp as T0. The two-part predicate matters: the first clock-only
version falsely triggered once on the bright title animation after four
captures, and the night watchdog correctly aborted it.

The confirmed detector produced last-clear → first-HUD brackets of **252, 312,
331, and 305 ms**. The asymmetric simulator phase sweep tolerates delayed T0
through about 340 ms but almost no early T0, so the conservative first-positive
edge is correct; midpoint interpolation is not. A 94-second recorded trial put
1 AM **69,950 ms** after the first office HUD, within the analyzer's 50 ms
resolution of the sourced 70,000 ms hour edge. `tools/device/clocktrace.mjs`
turns that relationship into an assertion.

MediaProjection can tighten this observation and replace the screencap loop,
but scheduler phase is no longer the unresolved blocker. Any replacement must
retain the originating image timestamp and the two-part false-positive gate.

#### Camera actuator: rejected

The ideal table needs CAM 10, CAM 04, and CAM 07 inside a 267 ms lit sweep.
Phone recordings rejected batched 267, 357, 477, and 597 ms gestures: early
forms rendered only CAM 07, wider forms accepted inconsistent subsets, and a
burst of `hid delay` commands did not behave as a cumulative macro. The
shortest repeatedly proven primitive remains wall-timed: 70 ms light settle,
100 ms contacts starting 240 ms apart, and **790 ms total**. A corrected staging
recording showed **2/2 complete 10 → 04 → 07 → 11 traces**.

`tools/hidpilottest.mjs --night=7 --sparse-left --device-sweep` models that
exact 70/240/240/240 ms device profile, shifts the late sweeps earlier, prevents
wind/contact overlap, and prices the later BB recovery. It survived **0/3,000
ordinary and 0/1,000 pinned-worst** nights; Golden Freddy, inside-office, and
Foxy failures show that the longer sweep destroys the stun bridge rather than
merely costing box time. `--assert-rejected` preserves this negative contract.

Therefore MediaProjection alone does not promote sparse-left: it improves the
observer, while the disproven component is now the actuator/policy combination.
The branch reopens only with a separately verified faster camera actuator or a
new exact-simulator policy built around the 790 ms sweep.

The perfect-vocal comparison is useful but not a fallback by itself. Counting
three source events before enabling the 520 ms CAM-05 path survived 3000
ordinary and 1000 worst-luck simulations, leaving at least 218 and 373 power
frames respectively. Forcing any single counted vocal to be missed made the
same policy survive 0/1000. Plan 08 therefore retains vocals as an occasional
visual-check arm or measured research signal, not as the now-unneeded primary
phase source and not as an audio-only route counter.

### Screencap readiness is observable

Starting `screencap` and masking after a fixed delay does not identify which
frame SurfaceFlinger captured. On this phone, a fixed 80 ms overlap returned
both a literal mask frame and an unlit-office frame. The useful boundary is the
first output byte: start `screencap` into a file while the left vent light is
held, poll until the file becomes non-empty, then release the light and put on
the mask while capture and classification finish. At that point the captured
buffer is immutable.

A three-cycle Night 6 staging run started capture in parallel with the vent
draw. The first byte arrived at +690 ms, +764 ms, and +761 ms from each cycle
anchor; all three retained frames classified as confident `empty` results.
The runner also locks its strategy capture against the safety watchdog and no
longer treats a transient unavailable watchdog capture as evidence that the
night ended. This validates the empty capture path only—not BB response timing
or a complete night.

## The Night 6 route, priced against the phone's actuator (2026-08-24)

Everything above prices the *Night 7* sparse-left candidate against the
790 ms device sweep. The **selected Night 6 route was never priced against it
at all**: `--device-sweep` refused to run outside `--sparse-left`, so the
10000/10000 Night 6 figure was always an idealized 267 ms actuator. It now
runs on the left route, and the route does not survive its own phone:

| Night 6 left-opening route | Result |
| --- | ---: |
| ideal 267 ms sweep (the published figure) | 1000/1000 |
| phone-proven 790 ms held-light sweep | **0/1000** |

Two independent things break, and the second is arithmetic rather than policy.

**The wind collapses.** The sweep has to land on the anchor, so a 47-frame
hold eats the clear's second wind window down to nothing; 838 of the first
1000 deaths were the Puppet at a 0% box.

**The flashlight cannot pay for the sweep at all.** A 790 ms lit sweep is 47
frames of light, 84 times in a night. That is 3948 frames against night 6's
sourced **3000**, before a single hall flash. No schedule containing it can
finish a night, whatever else it does.

### Pulsing the light instead of holding it

`stunCam` refreshes on *every frame* the camera light is on while that camera
is selected, so contact 0 does not have to stay down across the sweep. Select
the camera with contact 1, then pulse contact 0 for one 100 ms contact. Two
things follow: the sweep costs 18 frames of battery instead of 47, and the
70 ms leading light settle leaves the span, because the light no longer has to
be up before the first selection. The span becomes `2 * spacing + 100 ms`.

`--pulse-light` models this, with `--sweep-slot-ms=` for the spacing and
`--mask-margin-ms=` for the BB mask's phase margin. The device route briefly
dropped the Golden Freddy flick to recover wind, then restored it after the
input/video census identified the actual fault: the following monitor press,
not the mask toggle. `maskraise` now holds that seam at the measured-safe
180 ms inside one HID macro.

> **2026-08-25: every route on this page is grounded by the model gate.**
> Nothing reaches the phone unless locally proven: before its first adb
> command, the runner replays the plan through the exact engine under ±60 ms
> of human slack (the measured plans/04 bracket floor) and refuses below the
> 40% replay contract. The restored Golden Freddy flick, emitted as the
> measured-safe `maskraise` compound, replays **46/100** with the sourced Fusion
> LCG and therefore passes (`tools/device/human-gate.mjs`; absolute, no
> override). A gap floor was the first form of this rule and was
> retired the same day: gap width never separated human from machine —
> precision does, which is exactly what error-injected replay measures. The
> pricing below remains correct and worth keeping: it establishes what the
> *machine* route costs, and that even the machine cannot land the ideal
> figures. `test-human-gate.mjs` asserts the pass.
>
> Priced the obvious follow-up the same day: the route at the floor's own
> 350 ms slots is **0/200 in the exact simulator at every offset tried**
> (0/83/167/250/300), dying to stun-lapse office attacks — the sweep-span
> inequality below, not a tuning miss. The left-opening architecture cannot be
> slowed into human compliance; a human-executable night 6 needs a different
> route shape. `hidpilot n6 human reject` preserves the rejection.

### It still fails at the spacing the phone has proven

With the pulsed light the route survives night 6 at 240 ms spacing, but only at
**one scheduler frame**. The ideal route's window is 18 frames (about 300 ms);
`DEVICE_EPOCH_LATCH` brackets T0 to about 80 ms. A one-frame island is not a
schedule anyone can land.

The mechanism is a single inequality. Across the five-tick BB mask no camera
can be refreshed, so the same camera's stun must bridge from the pre-mask sweep
to the recovery sweep. That gap is `mask window + 27 frames + sweep span`, the
27 being mask-off plus monitor-raise. The stun is 400 frames and the movement
grid grants a few more. A five-tick mask that is robust to *any* tick phase
needs about 300 frames on its own, which leaves the sweep span about 18 frames
— **300 ms, for all three cameras**. The phone's proven 240 ms spacing spans
580 ms even with the settle removed.

Nothing else in the cycle can pay for the span, because the rest of it is
already at the sourced animation lengths (`MONITOR_ANIM_DOWN` 22, `MASK_ANIM_ON`
12, `MASK_ANIM_OFF` 15, `MONITOR_ANIM_UP` 12):

- the read cannot start before **a+22** — that is the monitor-down flip;
- the phone needs about 350 ms to draw a lit vent, so the frame is not there
  before **a+43**, and the prophylactic mask cannot precede it;
- the recovery's 27 frames are exactly mask-off plus monitor-up.

Nor can the mask be split across a sweep. g293 zeroes the counter on every
entry into the fully-on state, so the five ticks are a continuous hold, not
cumulative storage (`src/engine.js:380`, `tickMask`). The sparse Night 7 shape
is worse here, not better: it masks at a+88 instead of a+47, so its bridge only
fits the ideal 267 ms sweep — on night 6 it survives 21 phase frames ideal and
**no phase at all** at any device spacing.

Measured windows, 1000 ordinary and 300 pinned-worst nights per offset, min box
56%, min power 726:

| Camera spacing | Span | Mask margin | Perfect-phase window |
| ---: | ---: | ---: | --- |
| 240 ms (proven on this phone) | 580 ms | 600 ms | 2 frames — not landable |
| 160 ms | 420 ms | 800 ms | **6 frames (100 ms)**, offsets 11-16 |
| 120 ms | 340 ms | 900 ms | **12 frames (200 ms)**, offsets 5-16 |

So the blocker for a Night 6 device clear is now named and singular: **the
camera actuator's inter-selection spacing**. `tools/test.mjs --engine` keeps
both rejections (`hidpilot n6 device reject`, `hidpilot n6 pulse reject`) and
both 160 ms survivals so neither half can drift.

The open device gate is narrow enough to test directly, and
[`tools/device/hid-sweep-probe.sh`](../../tools/device/hid-sweep-probe.sh) is
that test: it drives CAM 10, CAM 04 and CAM 07 at each requested spacing with
the light pulsed *after* each selection, and grades the recording with
`camtrace.py`. The existing evidence does not answer the question — the
rejected forms were *batched* `hid delay` macros, and the accepted 240 ms
figure was the first wall-timed spacing tried, not a measured floor.

### Answered: the phone accepts 120 ms spacing (2026-08-24)

Three probe runs on the Moto g56, graded at the recording's native rate:

| Run | Spacings | Complete `10-04-07-11` sweeps |
| --- | --- | ---: |
| `hid-sweep-probe-1` | 240 / 200 / 160 / 120 ms | **4/4** |
| `hid-sweep-probe-160x4` | 160 ms x4, 100 ms contacts | **4/4** |
| `hid-sweep-160x4-c120` | 160 ms x4, 120 ms contacts | **4/4** |

So 120 ms spacing works, which is better than the 160 ms the policy needs and
gives the wider 200 ms phase window rather than the 100 ms one.

**The 240 ms figure was a measurement artifact, and so were the first readings
here.** `camtrace.py` decoded at 30 fps and required a 100 ms stable run, but
`screenrecord` captures at the panel's 60 fps. At 160 ms spacing every dwell
therefore reported as exactly 0.10 s — the floor — and any dwell that straddled
frame edges fell under it and read as a dropped selection. The same three
recordings scored 3/4, 1/4 and 2/4 at the default resolution and 4/4 at
`--fps 60 --min-ms 50`. Nothing about the input changed.

Treat "the shortest repeatedly proven primitive is 240 ms" as withdrawn: it was
established with the same 30 fps grader and never separated the actuator from
the detector. `tools/device/test-camtrace.py` now guards the gate that hid it.

### The shell's clock is 25x looser than the actuator's (2026-08-24)

Measured with a separate HID touchscreen aimed at empty wallpaper, no game
running, reading the kernel's own `getevent -lt` timestamps across 60 contacts
at an intended 120 ms period:

| | want | median | min | max | stdev |
| --- | ---: | ---: | ---: | ---: | ---: |
| DOWN->DOWN period | 120 ms | 120.1 | 116.4 | 121.9 | 0.76 |
| contact length | 100 ms | 99.9 | 97.0 | 101.5 | 0.80 |
| released gap | 20 ms | 19.6 | 18.5 | 22.1 | 0.66 |

`hid_delay` holds to about +/-2 ms. `wait_until` overshoots **49-93 ms** every
time, because `sleep` and `date` are fork+exec here: `sleep 0.02` costs 75 ms
wall and one `date` fork about 25 ms, so it sleeps to target-20 and then
busy-polls past it.

This matters more than the raw numbers suggest. Shifting the whole route late
is nearly free -- it survives 300/300 up to 100 ms and then falls off a cliff
to 0/300 at 110 -- but **jitter is what costs nights**: +/-10 ms around any mean
drops it to 204/300, and the phone's measured spread scores 152/300 against
282-300/300 for the hid clock. The mean can be dialled out with
`PILOT_OFFSET_MS`; the spread cannot.

So the steady cycles' post-read windows now run as a **single hid macro**: the
shell wall-times only the window's start and waits it out, and every boundary
inside is a `hid_delay`. That is one wall-timed boundary per 5 s cycle instead
of one per action. The window is capped at one cycle deliberately -- a macro
cannot be interrupted, so a longer one means input keeps landing on whatever is
in front for longer if the game dies mid-macro, and no simulator can price
that.

Two windows stay stepped, for reasons that are not performance: the shared
prefix contains the vent read, whose classifier lives in the shell, and the
opening has to absorb the epoch latch's slip out of a wind hold whose end must
not move. `run_macro` refuses both rather than running them wrong.

Note the released gap's own minimum was 18.5 ms against a 20 ms floor. The
sweep geometry below sits on its constraints with zero slack, and that is the
first place to look if a select goes missing.

### The shipped burst no longer matches the probed one (2026-08-24)

The probes above ran a burst that led the light pulse by 10 ms inside a 100 ms
select, leaving the pulse itself 90 ms. That is under the 100-120 ms this
document's own verified report sequence requires, and the contact floor in
`tools/device/test-hid-trace.mjs` was briefly lowered to 90 to accommodate it —
the wrong direction to move a device threshold.

Four constraints cannot all hold at once:

| Constraint | Source |
| --- | --- |
| selects 120 ms apart | the probe table above |
| 20 ms released between selects | Fusion polls touch per frame |
| select contact >= 100 ms | "Verified report sequence", above |
| light pulse >= 100 ms | same |

The first two fix the select at exactly 100 ms, so **any** positive light lead
puts the pulse under the floor. The runner therefore ships `SWEEP_LIGHT_LEAD_MS=0`:
the select and its light land in one report and both contacts get the full
100 ms. This is arithmetic, not a measurement — **the 4/4 result above does not
cover it.** Re-run `hid-sweep-probe.sh` before trusting a device run, and if a
zero lead turns out to miss selections, the conflict is real and one of the four
constraints has to be retracted with evidence rather than quietly shaved.

**Probed, and it holds (2026-08-24, same day).** `LIGHT_LEAD_MS=0 CONTACT_MS=100
hid-sweep-probe.sh 120 120 120 120`, graded on both signals:

| Grader | Answers | Result |
| --- | --- | --- |
| `camtrace.py` | was the select missing? | 4 complete `10-04-07-11` sweeps, 0 incomplete starts |
| `sweepcheck.py` | was the select present but unlit? | 4/4 flashed all of 10, 04, 07 |

Neither fired, and the lit-frame counts (5-6 / 5 / 4-6) are healthier than the
10 ms lead runs, which is what a 100 ms pulse instead of a 90 ms one should look
like. The two failure modes are graded separately on purpose: a dropped select
and a dark select point at different fixes.

The paragraph above stands as written rather than being deleted, because the
reasoning that produced it is still the reason the geometry has zero slack.
**Twelve selects is not eighty.** A night runs roughly 80 sweeps, and the
released gap's measured minimum is 18.5 ms against a 20 ms floor, so this
probe fails to reproduce the concern at its sample size rather than retiring
it. The night recording is the larger sample and grades the same two ways.

### What the shell's clock actually costs, and the two-frame budget (2026-08-26)

The section above measures `wait_until`; this one prices it. The answer is that
the shell's clock is not *a* contributor to the actuator cliff — on this route
it is the whole of it, and the budget it has to fit into is a **frame count,
not a millisecond figure**.

`tools/latenesssweep.mjs` sweeps `tools/device/actuator.mjs`'s lateness band
across Nights 1–7 at the `hidpilot n6 target` settings, 200 seeds a cell.
**Every number here is a simulator number** — the actuator models launch
lateness and the mask seam and nothing else. Two controls make the table
readable rather than merely favourable, and `--assert` fails on either: the
zero row must reproduce the exact figure (200/200 every night), and the
110–300 ms row must reproduce plans/12's published table.

| band, per wall-timed anchor | frames | n1 | n2 | n3 | n4 | n5 | n6 | n7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 ms (the control) | 0 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| **0–10 ms, fork-free `/proc/uptime` loop** | 0–1 | 200 | 200 | 200 | 197 | 200 | **171** | **25** |
| 0–40 ms | 0–2 | 200 | 199 | 199 | 196 | 198 | 179 | 26 |
| 0–42 ms | 0–3 | 190 | 177 | 167 | 168 | 147 | 124 | 16 |
| 0–50 ms | 0–3 | 138 | 58 | 35 | 41 | 14 | 8 | 0 |
| **49–106 ms, the shipped `date` loop** | 3–6 | 72 | 0 | 0 | 0 | 0 | 0 | 0 |
| 110–300 ms, `actuator.mjs`'s default | 7–18 | 23 | 0 | 0 | 0 | 0 | 0 | 0 |

**The knee is at the 2-to-3 frame boundary and it is a cliff.** Uniform
lateness is free to 41 ms (2 frames, 200/200 on every night) and collapses at
42 ms (3 frames: n6 10/200, n7 0/200). A per-anchor re-roll behaves the same
way: anything inside 0–40 ms holds, and 0–50 ms is already gone. The
millisecond thresholds are only meaningful to ±8 ms, because the model
quantises every draw to a 60 fps frame — quote the frame count.

**Halving the mean buys nothing, and that is not the interesting failure.**
205 → 110 ms leaves Nights 2–7 at 0/200; so does 205 → 83 ms. Nor does the
spread help while the mean is high: at a 205 ms mean, ±0 and ±95 ms are both
0/200 on every night but the first. That retires `actuator.mjs`'s header claim
("the mean is nearly free … the SPREAD costs nights") for this route, as
plans/12 already began to. **Both are the same statement**: what matters is
total displacement in frames, and 205 ms is 12 frames before any spread is
added.

#### The fix is the fork, and it has been measured on the phone

`wait_until` sleeps to 20 ms before target and then busy-polls `date +%s%3N`.
A device probe on 2026-08-26 timed the pieces:

| | cost | note |
| --- | ---: | --- |
| `date +%s%3N` | **21 ms** | fork+exec; 100 calls in 2126 ms, consecutive-gap max 35 ms |
| `sleep 0` | ~20.8 ms | fork+exec, same class |
| `read u _ < /proc/uptime` | **0.36 ms** | builtin + redirect, no fork; 100 reads in 36 ms |

So `wait_until`'s granularity *is* one `date` fork, and its landing error is
that plus the final `sleep`'s own fork. Re-probed against 20 targets 200 ms
apart it lands **49–106 ms** late, reproducing the 49–93 ms above — this time
**with the game running a live Night 1**, which is the control the original
bench measurement (empty wallpaper, no game) did not have. Widening the
busy-wait window does not fix it, because the fork cost is per iteration:
thresholds of 40/100/150/250 ms give mean errors of ~67/37/32/36 ms.

The same loop against `/proc/uptime` landed **0 ms late on 15 of 15 targets**,
also with the game running. "0" means within one 10 ms centisecond tick, not
sub-millisecond. That is 0–1 frames, inside the two-frame budget with margin.

Three things this does **not** yet establish, and none should be assumed:

- **It changes a clock domain.** `/proc/uptime` is monotonic while `T0`, every
  log line and the HID trace alignment are epoch ms from `date`. plans/09
  tracks those domains explicitly; the swap needs the crossing measured, not
  inferred.
- **A bare shell loop is not the runner.** The real cycle also runs `hid_mark`,
  the HID writes and the classifier. The per-boundary cost with those in the
  loop is unmeasured.
- **`read -t 0.02 < /dev/null` is not a fork-free sleep.** It returns instantly
  on EOF — 20 nominal 20 ms sleeps took 12 ms in total.

#### What it would be worth, stated honestly

Inside the budget the route recovers **Nights 1–5 outright** (197–200/200) and
Night 6 to **171/200**. Night 7 goes 0 → **25/200** and stays a one-frame phase
island, which is the same thing plans/12 found from the other direction: moving
the cycle-opening `tap monitor` by +16 ms takes exact Night 7 replay from 20/20
to 0/20. **The clock fix is not a Night 7 clear and must not be sold as one.**
It unblocks the ladder up to Night 6; Night 7 still needs a route whose sweep
tolerates a frame.

#### Why the macro architecture is load-bearing to the frame

`--ablate` delays one class of press and leaves the rest exactly on time. It is
a diagnostic, not a phone model — the phone is late on every boundary it
wall-times — but it says something the aggregate cannot:

| | n1 | n2 | n3 | n4 | n5 | n6 | n7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **everything** +1 frame | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| only the monitor press +1 frame | 200 | 112 | 200 | 200 | 53 | **0** | **0** |
| only the sweep +1 frame | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| only the sweep +2 frames | 200 | 54 | 61 | 21 | 0 | 0 | 0 |

Delaying *everything* by a frame is free; delaying the **monitor press alone**
by one frame kills Nights 6 and 7 outright. The mechanism is visible in the
counts: 280 camera selects land while the monitor is still `raising` and the
engine throws them away — the zero-margin `MONITOR_ANIM_UP` collision this
document's sibling already found in the plan and gated with
`test-device-input-gaps.mjs`.

So the cliff is **relative displacement, not lateness**. That is precisely the
error mode the single-macro-per-cycle architecture exists to prevent: inside a
macro every boundary is a `hid_delay` at ±2 ms, so the monitor press and the
sweep that follows it share one draw and cannot slide against each other. This
table is what a regression to per-press wall-timing would cost — the same
regression that once drifted a cycle anchor 434 ms — priced to the frame. Two
frames of *uniform* budget is what the shell has to hit; zero frames of
*differential* is what the macro already guarantees.

## Trap 1: UHID open is earlier than Android input readiness

The `hid` command returns from registration after the kernel sends
`UHID_START` and `UHID_OPEN`. That does not mean `InputReader` has attached the
new touchscreen. On this phone the measured gap was about **5.1 seconds**:

```text
01:20:41.483  hid process opens/registers the UHID device
01:20:46.585  InputReader: Device added ... sources=TOUCHSCREEN
```

Reports sent in that gap are silently lost. A two-second sleep therefore
registered a touchscreen that Android could list later, while every early game
input appeared to do nothing.

Do not pay this delay inside a live night. Start the persistent HID process on
the title screen, then gate on the device name appearing in `dumpsys input`.
Only start the night after that framework-level readiness signal. A fixed
seven-second delay is acceptable for an isolated fixture; the real runner
polls readiness with a timeout.

This is the same distinction called out by AOSP's
[`hid` documentation](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/cmds/hid/README.md):
kernel readiness does not account for inputflinger, and a controller must wait
for the input-device-added notification before issuing reports.

## Trap 2: Contact Count describes records in the packet

The report descriptor carries two finger collections. Each finger occupies
five bytes:

```text
flags/contact-id, X low, X high, Y low, Y high
```

The low two flag bits are Tip Switch and In Range. The upper six bits are the
Contact Identifier. Therefore these are the important first bytes:

```text
0x03  contact ID 0 active
0x07  contact ID 1 active
0x00  contact ID 0 inactive
0x04  contact ID 1 inactive
```

The failed stream changed from two active fingers to one like this:

```text
contact_count = 1
ID 0 active
ID 1 inactive
```

Linux stopped after consuming the one record promised by `contact_count`, so
it never read ID 1's inactive record. Contact 1 remained down. Later camera
"taps" became `ABS_MT_POSITION` moves in the same slot, and even the nominal
all-up packet released only contact 0.

The working transition includes both records even though only one remains
active:

```text
contact_count = 2
ID 0 active at the held light coordinate
ID 1 inactive at its last camera coordinate
```

That produces `ABS_MT_TRACKING_ID = -1` for slot 1. The next camera packet can
activate ID 1 again and receives a fresh tracking ID. Releasing everything uses
two inactive records for the same reason.

This matches Linux's hybrid multitouch implementation: the contact-count field
sets how many contact collections the driver expects to consume from the
report. It also matches mature automation interfaces such as
[`minitouch`](https://github.com/DeviceFarmer/minitouch), which model every
contact's down/up lifecycle explicitly and warn that a lost touch-end corrupts
the stream.

## Trap 3: a zero-length delay is a fatal command, not a no-op

`hid` does not treat `{"command":"delay","duration":0}` as "wait for nothing".
It rejects the duration outright, and the rejection kills the whole process:

```text
E HID: HID injection failed.
E HID: java.lang.IllegalStateException: Delay has missing or invalid duration
E HID:   at com.android.commands.hid.Event$Builder.build(Event.java:220)
E HID:   at com.android.commands.hid.Event$Reader.getNextEvent(Event.java:298)
E HID:   at com.android.commands.hid.Hid.run(Hid.java:76)
```

Because the runner drives `hid` as an mksh co-process, the death is silent
until the *next* write, which fails with `print: -p: no coprocess`. Everything
the current action still had to send -- the rest of its hold, its release --
is never written.

This cost night 6-22 at 18 s, and its signature on the phone was not a timing
error but a dead control. `plan_emit`'s `hallraise` branch emitted the light
lead with `hid_delay "$SWEEP_LIGHT_LEAD_MS"`, and that lead is **0** in the
shipped zero-lead sweep geometry. So the hall light went down, the delay killed
`hid`, and the hall's own 133 ms hold and release never arrived. The device
owner watching the phone reported it before any log was read: *"fails to press
hall light and moves the vision instead"* -- a two-contact touch that changes
coordinates and vanishes in the same frame is a drag, so the office view panned
instead of the light coming on. The trace auditor found both halves:

```text
contact 0 at 1200,540 held 0 ms (floor 100)     <- the hall light
contact 1 at 144,801 held 0 ms (floor 100)      <- the monitor raise
```

Note what made this reachable: `pulsed_cam_burst` already guarded the same
variable with `if [ "$SWEEP_LIGHT_LEAD_MS" -gt 0 ]` and `hallraise` did not.
One guarded call site and one unguarded, on the same value. It also needed both
of two independent changes to appear at all -- the macro emitter, which turns
scheduler gaps into `hid_delay` commands, and the zero light lead. Neither
alone emits a zero delay, which is why two green test suites missed it.

### Four gates, because one is not enough

- **The call site** refuses to write it: `[ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay ...`.
  The emitter is the only place that knows a zero is *legitimate* (a zero lead)
  rather than a *defect* (a zero gap between two different buttons, which is
  the 0 ms released failure this document spends its length on).
- **`hid_delay` itself** returns early on a non-positive duration. A fatal,
  silent, co-process-killing failure deserves a backstop even so.
- **`tools/device/test-plan-interpreter.sh`** fails on any emitted
  `hid_delay <= 0`, and was verified to fail on the pre-fix code before it was
  fixed, so the assertion is not passing vacuously.
- **`tools/device/test-hid-trace.mjs`** reports a zero-length delay as a
  problem, and its self-test requires that it be caught alongside the short
  contact, the zero-gap button change and the latched contact.

The last one is the one that matters most, and the reason is general: a
stubbed interpreter advances a *virtual* clock by 0 quite happily, so no model
of the phone can see this class. Only the artifact can. A delay is a command
that can be rejected, not merely an interval.

## Verified report sequence

For a held-light camera tap:

1. Send one active record for ID 0 at the light coordinate.
2. Send two active records: ID 0 unchanged, ID 1 on the camera button.
3. Hold for at least 100-120 ms so the 30 Hz Fusion runtime sees it.
4. Send a two-record packet: ID 0 active, ID 1 inactive.
5. Repeat steps 2-4 for the next camera.
6. Send a two-record packet with both IDs inactive to release the light.

The kernel trace must show a new `ABS_MT_TRACKING_ID` for slot 1 followed by
`ffffffff` before the next camera. Merely seeing two Android pointer dots is
not sufficient evidence.

## Coordinate mapping on this phone

The virtual descriptor uses 2400x1080 axes, but InputReader exposes it through
the phone's portrait-natural display before rotating the landscape game. The
measured inverse transform from game coordinates is:

```text
rawX = (1080 - screenY) * 20 / 9
rawY = screenX * 9 / 20
```

Keep this device-specific mapping in the controller. Recalibrate it for a
different resolution or orientation.

## Evidence and limits

- The corrected kernel trace emitted independent slot-1 down/up pairs for all
  three camera buttons.
- `camtrace.py` found CAM 10 for 0.30 s, CAM 04 for 0.30 s, CAM 07 for 0.63 s,
  then CAM 11: one complete sweep and no incomplete starts.
- This proves the multitouch primitive, not a complete Night 6 strategy.
- A subsequent 130-second run collected 25 clean unlit CAM 05 frames. They
  were visually unusable for BB detection, confirming the device owner's
  observation. The earlier unlit idea came only from ambiguous video/action
  timing and is rejected; `BB_CAM05_UNLIT` remains a negative-control capture
  switch, not a survival path.
- Omitting every BB read/response is also rejected (0/3000 exact Night 6
  simulations). The intended replacement for CAM 05 is the validated lit
  left-opening read, not a blind cycle.
- The phase-safe left-opening policy passes 10000 ordinary and 3000 worst-luck
  exact Night 6 simulations. Device evidence currently covers only three empty
  classifier cycles; the older staged response table is not a clear claim.
- It does not imply the same flashlight-power budget is affordable on 10/20
  Night 7. The current scope is Night 6.
