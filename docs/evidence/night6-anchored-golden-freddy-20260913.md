# Night 6 anchored, twice refuted by Golden Freddy (2026-09-13)

Binding fnv1a-bc5e044c (hallfix knobs, anchored at effective epoch 3850 on
the five-second Foxy roll grid, model 3000/3000) ran twice:

| run | anchor | alive | killer | how |
|---|---|---|---|---|
| `night6-anchored2-20260913T015520Z` | released k=0, 0.16 ms late | 199.2 s | Golden Freddy | camdrop at 226.8 s (video), mask on 227.6, his face at 228.0, jumpscare 228.3 |
| `night6-anchored3-20260913T020127Z` | released k=0 | 219.0 s | Golden Freddy | camdrop at 246.2 s with Withered Freddy in the office, mask on 246.6, jumpscare 247.3 |

Both the second after a camdrop, both after 2 AM (Golden Freddy AI 3, g684).

**Sourced mechanism.** g336 creates `yellowbear` on a five-second tick while
`viewing` > 0 (cameras up) with Random(20) < AI; g601 hides him while the
cameras are up and g775 shows him at the drop. g778: `yellowbear` present AND
`viewing hall light` = 1 AND alt0 = 0 -> he takes the got-you box, and g570
attacks a second later. The Minus Toys camdrop holds the camera light THROUGH
the drop; the instant `viewing` reaches 0 with the light held, g489 latches
`viewing hall light` and g778 fires. g776 dismisses him only once `mask` = 2,
which the route reaches 0.45 s + the put-on animation later -- too late.

**Model error.** `plant-model.js` read g778 only on a light PRESS
(`onLightPress`), never while a held light met the drop, and cleared him at
the mask press instead of at `mask` = 2. Corrected on 2026-09-13: `tickLight`
re-reads g778 every frame; the dismissal moved to the mask-on completion.
Under the corrected model the refuted binding scores 8/600 at its epoch
(592 Golden Freddy). At that phase a five-second tick lands at cycle phase
1.15 s, with the cameras up: 15 % per cycle after 2 AM, 1 % survival over the
remaining 28 cycles.

**Route consequence.** Neither five-second tick may see the cameras up, and the
post-mask flash must precede the second tick: mask off at 8960 and the flash
at 9560 put the winning band at effective epochs 5033-5417 (binding
fnv1a-94baf687, `docs/evidence/night6-anchor-aim-b-20260913.json`).
