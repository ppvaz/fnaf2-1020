# Contacts clean, nights still lost — Night 5, 2026-09-12 (end of session)

The swallowed-tap defect is fixed and the nights are still lost. Both facts
matter and the second is the one that carries into the next session.

## What the contact fix did

`MIN_CONTACT_MS` and `FUSION_POLL_MS` are both 33, so a 33 ms contact had zero
slack against the poll that must observe it. Raising the loop taps to 200 ms:

| run | gates | corrected | survived |
|---|---|---|---|
| strokes1..3, gatefix1 (33 ms) | 17, 25, 16, 6 | 2, 3, 2, 3 | 174, 249, 192, 57 s |
| contact200a attempt 1 (200 ms loop) | 37 | **0** | **372.5 s** |
| contact200a attempt 2 (camdrop still 33) | 19 | 3 | — |
| final2 (200 ms loop + camdrop) | 19 | **0** | 187.1 s |

Peer session fnaf2-1020-36 audited the traces: 0 lost contacts in contact200a's
37 cycles, and all three of attempt 2's corrections were the one contact still
at 33 ms (camdropMonitorMs). That contact is now 200 ms too, and final2 ran
zero corrections. **The mechanism is closed.**

## What it did not do

372.5 s and 187.1 s, on effectively the same policy, with clean contacts both
times. 6 AM is 420 s. Neither number is a level and n=1 on each side; the
session spent the day deciding on single runs and the last two show why that
does not hold.

## How final2 actually ended

Mangle, 2 AM, 187 s — confirmed by eye in the retained video, not by a cause
model. The frame before the jumpscare shows **the monitor up** on Prize Corner,
so the mask was not worn at that instant:

    t=213.00  monitor open, Prize Corner, flashlight full
    t=213.50  Mangle jumpscare in the office

Pedro predicted this from watching the run: "tempo de mascara insuficiente que
nao espantou mangle".

## A hypothesis formed and killed in the same pass

It looked like the tick budget might be short by construction: `VENT_MASK_TICKS`
counts frames at mask state 2, and dump g9 only reaches state 2 after 12 frames
of animation, so the effective window would be the nominal one minus ~200 ms.

**The model already does this.** `minus-toys-plan.mjs`'s `maskWindows` sets
`startFrame: onPressFrame + C.MASK_ANIM_ON`. The budget is satisfied in the
model, so the device discrepancy is elsewhere — a late press, the window's
position, or something device-side the model does not represent. Recorded so
the next session does not re-derive it.

Separately settled from the dump, clearing a live suspicion: both mask
transitions are state-guarded (g270 requires mask==0, g615 requires mask==2,
g274 is the only path to mask==3), so a 200 ms hold cannot double-toggle and
the longer contact does not shorten the mask window.

## Two deaths, two different candidates — neither a contact

Peer session fnaf2-1020-36 graded both, and the answers differ, which is why
"lengthen another contact" is the wrong reflex here.

**final2 (187 s, Mangle).** The hall is NOT the candidate: a video reader
cross-checked against the trace census (it reproduces contact200a's 15-lit and
7-lit sets one for one) shows **12 of 16 hall taps lit, 75%** — better than
contact200a's 42%. The death sits at +185.2 s, the cycle edge where the monitor
has just come down and the mask is going up (+184000 camdrop, +184449 mask
press). Every latched mask window in the video is 4.58 s, uniform, with no
short one. That edge is where the model puts an unevicted Mangle, and a 4.58 s
window crosses 4 or 5 one-second ticks depending on phase — the shared
five-tick budget at a losing epoch. The gate-abort (ambiguous-threshold) at
+188.3 s FOLLOWED the death at +187.1 s; it did not cause it.

**contact200a (372.5 s).** Different shape. Epoch measured at 94.9 ± 33 ms,
outside every loss band but inconclusive by 21.7 ms; the hall lit only 15 of 36;
puppet-band deaths in the model land at 28–108 s so the epoch cannot explain a
5 AM death. Foxy through a dark hall is the hypothesis there.

Both are hypotheses named by the model, neither has an instrument-named cause,
and the epoch on final2 is unmeasured because its frame trace was lost.

## What to do next, in order

1. **Repetition before knobs.** Three or four runs of the current binding to
   get a median. Every decision today rested on a single run, including the
   ones that turned out right.
2. **Choose the epoch** — native origin anchoring. This is the lever that
   covers final2, and it is the largest untouched term: 3000/3000 at epoch 0
   against 1375/3000 drawn, now measurable to ±38 ms.
3. **`hallOffsetMs`** — the lever that covers contact200a. The peer swept
   9500–9900 across nights 5, 1, 2, 6, 7 at 3000 seeds: 25 of 25 rows
   3000/3000 normal and worst. The tap can move up to 400 ms later at zero
   model cost, turning ~56 ms of slack over the mask-off animation into ~450.
   Not bound, not tested. `hallMs` itself stays refused: it breaks night 1
   above 67 ms and night 2 above 133.

## Withdrawn today, so they are not rebuilt

The withered-bonnie visual cause model (24 false positives on a held-out run)
and the hall's 31% drop rate (measured on the camera-monitor screen). Both have
their own evidence pages with the numbers and the reasoning.
