# Night 6, first 6 AM on the device (2026-09-13)

`night6-anchoredh1-20260913T180208Z` reached 6 AM: the executor's terminal
is `sixam`, the recording shows the 6 AM screen at 448.5 s after at least
420.2 s alive, 42 of 42 cycle gates AGREED, and the title the phone returned
to offers **Custom Night** for the first time. Record:
[`night6-first-6am-anchoredh-20260913.json`](night6-first-6am-anchoredh-20260913.json).

Binding h (fnv1a-37278c63): the Night 5 hallfix knobs with the post-mask flash
at 9960 (was 10060), the mask off at 9260 (was 9460), the camdrop light held
200 ms past the monitor tap, released anchored at aim 4870 on the five-second
Foxy roll grid (k=0, 0.45 ms late; delivered epoch 4816 by frame trace).

What won it, in order, all measured on this phone today:

1. Night 6 is lost or won by where Withered Foxy's five-second roll ticks fall
   in the 10 s cycle; the epoch fixes that for the whole night, and the model
   sees it only on the 5000 ms period (bands 2.9-4.95 s, then 4.77-4.92 s once
   Golden Freddy's g778 read was added).
2. At AI 15 (2 AM on) one un-reset cycle is a lock: D >= 6 at a roll with
   Random(5) = 0. The post-mask flash is the reset that matters, and it must
   LIGHT before the roll that follows it. With the flash pressed at 10060 it
   lit 47-82 ms later against a roll at ~10.19: three deaths (e 155.5 s, f
   165.5 s, g 195.5 s) each on the 10 s tick after that roll.
3. Pressing the flash at 9960 and taking the mask off at 9260 put the light
   ~150 ms ahead of the roll with the fully-on mask window still 5.06 s.

Audio (Bluetooth A2DP, aptX-HD, 1.3 % samples lost): 65 vent bangs at NC up
to 0.83, 37 blackout-loop onsets, 20 mask-on anchors, no scream. The per-cycle
ledger is in the run directory.
