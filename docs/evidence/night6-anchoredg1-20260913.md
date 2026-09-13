# Night 6 binding g: five more cycles, the same death (2026-09-13)

`night6-anchoredg1-20260913T174958Z` (fnv1a-e89a28ca: mask off 9360, flash
10060, camdrop tail 200, aim 4870, delivered 4821 by frame trace) died at
195.5 s (2 AM + 55 s), Withered Foxy on the 10 s tick after the post-mask
flash: the death of e (155.5 s) and f (165.5 s), five cycles later.

Per-cycle ledger ([`night6-anchoredg1-cycle-ledger-20260913.json`](night6-anchoredg1-cycle-ledger-20260913.json)):
every flash LIT through cycle 7; encounters (defended windows, office ~3.7)
at cycles 8, 12, 14 (Withered Bonnie at the drop), 15, 17, each followed by a
DIM or FLAT flash; cycles 13 and 16 DIM without an encounter; cycle 18 LIT;
death in cycle 19 at schedule 190.3 s (video 223.7 - 33.46). The blackout loop
(s0010) starts at schedule 78.7, 118.2, 138.2, 148.2, 169.6 s (cycles 7, 11,
13, 14, 16: the cycle whose drop met the occupant, one before the defended
window each time). Scream at NC 0.90; capture lost 5.1 % (aptX-HD still; the
phone was not switched to SBC). A Digital Wellbeing "Used for 55m" bubble sat
over the game from ~2 AM on; not seen to take a touch, but it must be off.

Reading. The kill at 190.19 (the 10 s tick) means the lock came at the roll of
180.19 -- the tick that follows the cycle-18 flash press at 180.06. The flash
lights 47-82 ms after its press, 180.11-180.14; g489/g745 zero D on that frame;
the roll at ~180.19 should see D = 0. It saw D >= 6, so either the flash lit
AFTER the roll (an input latency above ~130 ms, past the measured max 82) or
the roll grid sits ~50-100 ms earlier than the first-night-frame origin puts
it. Either way the post-mask flash lands 50-80 ms before the tick it must
beat, and every Night 6 death since e is that margin failing after 2 AM,
when D >= 6 is enough. The lever is to put the flash further ahead of the
tick: binding h moves the flash and the mask-off 100 ms earlier (9960 /
9260), keeping the fully-on window at 5.06 s.
