# Night 6 binding f: the longer camdrop light did not change the death (2026-09-13)

`night6-anchoredf3-20260913T173905Z` (fnv1a-3554e353: hallfix knobs, camdrop
light held 200 ms past the monitor tap, aim 4870, delivered 4802 by frame
trace) died at 165.5 s (2 AM), Withered Foxy on the 10 s tick right after the
post-mask flash -- the same death as binding e at 155.5 s. Two attempts before
it did not run: f1 (tail 450) was refused by the executor because the mask
tap fell inside the light hold, and f2 never captured because f1's audio
reader had kept the PCM (both fixed in `capture-bt-audio.sh`).

Per-cycle ledger ([`night6-anchoredf3-cycle-ledger-20260913.json`](night6-anchoredf3-cycle-ledger-20260913.json),
`tools/device/cycle-ledger.py`): no occupant at any drop through cycle 12;
cycle 12's window defended (office 3.4) with a DIM-then-FLAT flash; cycle 13
an unlabelled hue-57 occupant; cycle 14 defended, flash FLAT; **cycle 15 flash
FLAT with no encounter** (office 15.8); cycle 16 the death. The audio agrees:
the blackout loop (s0010) from schedule 118-122 s and 138-142 s (cycles 11-12
and 13-14), the scream at 151.1 s in a capture that lost 8.2 % of its samples
(aptX-HD again; the phone was not yet on SBC). The mask-on touch sound gives
eight per-cycle anchors, 25 ms spread.

Reading. The camdrop tail did not matter (e2 and f3 die alike), so the
camdrop reset is not what is missing -- or is missing for a reason the tail
cannot fix (Foxy not at hall stage 1 when the light meets `viewing` = 0, in
which case g864 only decays D by one per 500 ms). What both deaths share is a
run of post-mask flashes that did not fire: e2 cycles 12-13 (FLAT, DIM), f3
cycles 14-15 (FLAT, FLAT). A FLAT flash with no encounter is the mask-off
latency tail: mask-off press at 9.46, effect 307-352 ms later, off animation
244 ms, so `mask` = 0 at 10.01-10.06 against a flash press at 10.06 + ~50 ms
input latency: a 50-100 ms margin that the tail of the latency distribution
eats. After 2 AM one un-reset cycle puts D >= 6 at the mid-cycle roll and the
lock follows with 20 % per tick, certainty at D >= 10.

Next binding (g): mask off 100 ms earlier (9360) for a 150-200 ms flash
margin, with the mask window still 5.1 s fully on; the model scores it below.
