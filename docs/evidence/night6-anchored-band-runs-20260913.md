# Night 6 anchored, inside the band: three runs, three deaths, two measurements (2026-09-13)

After the Golden Freddy correction (g778) the model's only surviving Night 6
family moves the mask off to 8960 and the flash to 9560 (bindings
fnv1a-94baf687 / 5d414fce / 1292e481, same knobs, three aims). All three runs
released anchored to the millisecond; two carried `--frame-trace`.

| run | aim (register) | delivered epoch (frame trace) | effective (delivered + ~50 ms input latency) | alive | killer |
|---|---|---|---|---|---|
| `night6-anchoredb1-20260913T022819Z` | 0 + 1 period, k=1 | not traced (latched onset + 5001) | ~4985 | 320 s | Withered Foxy at the post-mask flash (g573), 4 AM |
| `night6-anchoredc1-20260913T023830Z` | 4917, k=0 | 4842 ms | ~4890 | 81 s | Balloon Boy in the office at the drop, then Foxy, 1 AM |
| `night6-anchoredd2-20260913T024735Z` | 240 + 1 period, k=1 | 5175 ms | ~5225 (the band's centre) | 150 s | Balloon Boy in the office at the drop, then Foxy, 2 AM |

**Two measurements.**

1. **Latency register.** The 253 ms "monitor-up press-to-effect" used as the
   anchor's latency on the first Night 6 entries includes the raise animation
   the model already has. The input latency is the hall-lit press-to-effect:
   n=31, min 1, median 47, max 82 ms (night5-hallfix audit). Mask-on 262 and
   mask-off 314 are the animations plus ~60 ms; monitor-down 600 against the
   model's 367 ms lowering is the one effect the model under-states.
2. **Onset bias.** The helper's latched night onset leads the frame trace's
   first night frame by 65-75 ms (c1: fired at latched + 4917.5, delivered
   4842; d2: fired at latched + 5240.2, delivered 5175). Effective epoch =
   aim + k x period - 70 + latency.

**The band is real for Foxy, wrong for Balloon Boy.** b1 and c1 sat below the
model's low edge (5033) and died as the model dies there (b1: Foxy at the
flash, the model's mode at 4983; c1: inside-office). d2 sat at the centre,
where the model wins 3000/3000, and Balloon Boy walked in at 150 s. The mask
window of this family is 4.71 s pressed, ~4.5 s fully on: four one-second
ticks of g907, not the five g294 needs, and the sourced 10 %/s early leave
(g292) did not save it. Every window that held Balloon Boy on this phone --
four Night 5 6 AMs and the two 20-cycle Night 6 runs -- was the 5.2 s window
(mask off 9460). The model lets him leave short windows too often, or lets
him in too rarely: open, and the next model correction.

**Consequence.** The mask window returns to 9460 (hallfix knobs). With the
g778 model those knobs win only where the second five-second tick falls
between the flash (10.06 + latency) and the raise (10.1 + ~260 ms): effective
epochs ~4800-4900, a 0.2 s band. Binding e aims there:
`docs/evidence/night6-anchor-aim-e-20260913.json`.
