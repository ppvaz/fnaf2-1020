# FNaF 2 — 10/20 Mode: The Right Vent Camp Lineage
### State-of-the-art research notes (plan 01), researched 2026-08-19

> **What it is:** the classic 10/20 strategy family — camp in the office with the
> mask, exploiting that **5 consecutive seconds of mask wear guarantees both office
> and vent animatronics leave**, so the left side never needs checking. It evolved
> from pure reaction play into a **timer-anchored, blackout-timed cycle** that
> manipulates Foxy's kill checks.
>
> **State of the art (2024–):** brayden's timer strategy — RVC + Foxy blackout
> manipulation + Golden Freddy interval avoidance + Shooter25's right-vent-light Toy
> Bonnie stall. **Not zero-RNG** (~99%, measured by a bot over 105+ nights), but by
> its author's own framing: *"on average this is the best strategy for a human if
> all they want is consistency"* — far easier than Minus 7.
>
> Glitchless throughout — no legitimacy caveats anywhere in this lineage.

---

## 1. Timeline of the lineage

| Date | Development | Author | What it added |
|---|---|---|---|
| ~2019 | "T Path" era | DJ Sterf et al. | pre-RVC camera-heavy play; obsolete post-patch (1.033). |
| ~2020–21 | **Right Vent Camp** | the "Tactical Crew" (Random FNaF Player, Ambience, Tru3P1ay3r, Chezzball34, ZombieGabriel, Toy Bonnie 360 — per DJ Sterf's credits) | the core insight: a 5 s mask hold clears everyone, so *only the right vent* (Toy Bonnie) ever needs checking. |
| 2021-09-29 | In-Phase / Out-of-Phase systematisation | DJ Sterf | the theory video (1 h 38): "in-phase" = let the ~10 s blackout forcedowns pace the cycle; "slightly out-of-phase" = deliberate offset for faster mask work. Documented Foxy's exposure meter and the 16-frame post-mask no-flash window. |
| 2021-12-06 | **Foxy blackout manipulation** | Shooter25 | Foxy's kill opportunity exists only at 10 s multiples, and a blackout (or a flash within the last 50 frames) denies it — so *time the monitor-down at :X5 to force the blackout across the check*. Turns RVC from reactive to clock-driven. |
| 2023-10-06 | Consolidated guide | Guzzy | the modern base-RVC digest: exact cycle offsets, Toy Bonnie handling, puppet flash-stall, the 2-cycle Toy Bonnie skip. |
| 2024-06-09 | **brayden's timer strategy** | brayden (8brayden8) + Shooter25 | adds Golden Freddy interval avoidance and Shooter25's discovery that **holding the right vent light stalls Toy Bonnie** — the lineage's last remaining chaos source. Validated by Shooter25's in-game bot: 104 wins / 1 death. |
| 2025 | still current | — | base RVC still being run and taught (Eerier Fish, 2025-03); the 2025 zero-RNG strategies (see `MINUS-3-STRATEGY.md`) borrow RVC's mask timing rather than replacing the family. |

## 2. The mechanics the family stands on

- **The mask rule.** Office ("desk") animatronics leave after 5 consecutive masked
  seconds; vent animatronics get a per-second leave chance and are *guaranteed* gone
  at 5 consecutive seconds. Practical play holds the mask ~0.5–0.75 s past the
  blackout to cover the vents. Toy Bonnie is the exception: masked, he waits a
  *random* delay before a fixed 5 s attack animation — the strategy's main RNG.
- **Foxy's checks** *(resolved 2026-08-19 against the Technical-FNaF wiki's
  decompile-derived page — see source 6)*. Two cadences coexist, which is why the
  sources seemed to conflict. His equation `21 + random(0–4) − D < AI` is **checked
  every 5 s interval**: true in Parts/Service → he enters the hall; true again in
  the hall → he is marked "GOT YOU". Once GOT YOU, the jumpscare **executes on your
  next hall flash or at the next 10 s interval — unless a blackout covers it**. The
  RVC sources describe the execution half; the Minus 7 material describes the check
  half. D rises ~1/s (2/s masked with no threats, paused during blackouts), resets
  to 0 on a hall flash while he's in the hall, and drops 1 per 0.5 s of flash while
  he's in Parts/Service. He also has the exposure meter: 100 × night-number frames
  of flash forces a retreat for 500–999 frames. The wiki adds a Clickteam quirk —
  each blackout shifts D's tick 1 frame earlier ("D offset", ~0.5 s over an RVC
  night) — and claims this accident is "the only reason 10/20 is even possible
  without very modern strats".
- **Forcedown pacing.** Blackout animatronics can only force the monitor down at
  10 s intervals — the metronome "in-phase" play locks onto.
- **Small print** (DJ Sterf): ~16 frames after mask-off where the flashlight won't
  fire; mask+flash simultaneously was removed after v1.0; Mangle's right-vent
  presence is audible (static), no light needed; the puppet's rise can be stalled by
  *holding* (not tapping) the flash while entering CAM 11.

## 3. The state of the art: brayden's timer strategy (June 2024)

From the author's video (transcript) — the cycle, condensed:

- Timer from office load-in. First 20 s: wind and flash Foxy before each 5 s
  interval; idle 20–24 s; flash at 24; cams at 25, wind.
- At :X9.5: hold flash, drop the monitor and mask *simultaneously* — the held flash
  hits Foxy through the blackout without risking Golden Freddy. Mask off just after
  :X5, flash Foxy just after :X7, then **hold the right vent light to stall Toy
  Bonnie**; cams at :X0, wind to :X4.5. Repeat all night.
- Toy Bonnie in the vent anyway: wait for the next :X9, flash hall, mask, ride his
  blackout; afterwards wind flat-out (skip the vent light) until the box is full —
  optimally two cycles — then resume stalling.
- No blackout on monitor-down: if Toy Bonnie is there, flash hall + mask and use
  *his* blackout; if BB/Mangle/Toy Chica, mask at :X2/:X7 for 5 full seconds, then
  mask off + Foxy flash + vent light; if nobody, just wind to the next :X4.5/:X9.5.

Consistency: Shooter25's bot playing this strategy perfectly went 104–1 (~99%),
including 100 wins in a row. The author is explicit that it is **not** 100% like
Minus 7 — the residual RNG is real but rare — and that its value is
consistency-per-unit-skill, not perfection.

## 4. What the trainer's engine does and doesn't model

The 2024 strategy is far more clock-anchored than plan 03 assumed — a fixed cycle
with a *decision fork* on monitor-down (blackout / Toy Bonnie / vent guest / nobody),
not free-form reaction play. The reactive-coach redesign shrinks to a
branch-prompt problem.

Gaps and conflicts in `src/engine.js` / `src/config.js`:

1. **Foxy's check cadence** — ~~conflict~~ **RESOLVED** (see §2): the equation runs
   at 5 s intervals, the GOT-YOU kill executes at 10 s intervals or on a hall flash,
   blackout-gated. The engine already implements both halves (`engine.js:203-208`,
   flash-triggered kill at `engine.js:146`). Residual nuances to verify: the wiki's
   equation is strict `<` where the engine uses `<=` (one second of D difference);
   D pausing during blackouts and dropping 1 per 0.5 s of flash while in
   Parts/Service are not obviously modelled; the D-offset Clickteam quirk is not
   modelled at all.
2. **Forcedowns only at 10 s multiples** — TheBones5's dissect confirms the office
   queue attacks at most every 10 s; whether the engine enforces that pacing needs
   checking.
3. **Toy Bonnie's unique behaviour** — random pre-attack delay, fixed 5 s animation,
   the 2-cycle post-attack immunity, and the right-vent-light stall: none modelled
   (vent lights are currently widgets with no effect).
4. **Mask-leave rules** — engine has cumulative mask time (`MASK_LEAVE_FRAMES`) with
   a 10%/s early-leave chance; sources describe *consecutive* seconds with a
   guaranteed leave at 5 s and a reset on unmask. Needs verification which is right.
5. **Puppet flash-stall** (holding flash freezes the rise) — not modelled.
6. **Post-mask 16-frame flash lockout** — not modelled; matters for the mask-off →
   Foxy-flash beat the cycle depends on.
7. **Foxy exposure meter** — partially present (`FOXY_EXPOSURE_TO_RETREAT` matches
   DJ Sterf's 100 × night figure); the RVC-specific "hold rather than tap" exposure
   accounting should be checked.

## 5. Implications for plan 03

- Teach **brayden's 2024 strategy**, not classic reactive RVC — it is the lineage's
  end state and mostly clock-anchored, so the rhythm lane carries more of the load
  than plan 03 feared. The reactive part reduces to grading a four-way decision on
  monitor-down plus Toy Bonnie episodes.
- The "RNG deaths are not failures" grading premise in plan 03 stands: ~1% of
  perfectly-played nights lose. The bot's 104–1 gives a calibration target for the
  simulator once the engine gaps close.
- Gap 1 (Foxy 5 s vs 10 s) is the first thing to resolve — it is cheap to check
  against the community AI breakdowns and everything else hangs off it.

## Sources

1. DJ Sterf — *In-Phase and Out-of-Phase Right Vent Camp Strategies*, 2021-09-29:
   <https://www.youtube.com/watch?v=g-qH4IopvpY> (theory + credits naming the
   Tactical Crew as RVC's pioneers); older *Golden Freddy Mode Strategy w/ Diagrams*,
   2019-09-01: <https://www.youtube.com/watch?v=iaFs1lD659k>
2. Shooter25 — *Beating FNaF 2 10/20 with My New Strategy*, 2021-12-06:
   <https://www.youtube.com/watch?v=h7xUl16h8KQ> (Foxy blackout manipulation,
   written out in the description)
3. Guzzy — *Easy Guide … Extended Right-Vent-Camp Strategy*, 2023-10-06:
   <https://www.youtube.com/watch?v=CJ4lPuLrHwg> (modern base-RVC digest)
4. brayden — *A Brand New FNaF 2 Strategy (Guide + FNaF 2 Bot)*, 2024-06-09:
   <https://www.youtube.com/watch?v=EYtIOKRuQqE> (the state of the art; Shooter25
   bot stats; right-vent-light Toy Bonnie stall)
5. Eerier Fish — *FNAF 2 10/20 Mode With Base Right Vent Camp Strategy*, 2025-03-19:
   <https://www.youtube.com/watch?v=X-JUh9dzCto> (base RVC still current)
6. Technical-FNaF wiki — *Withered Foxy (Fnaf 2)*
   <https://technicalfnaf.fandom.com/wiki/Withered_Foxy_(Fnaf_2)> (decompile-derived;
   the D variable, the GOT-YOU model, the D-offset quirk). Note for future research:
   Fandom blocks plain fetches, but the MediaWiki API works —
   `curl "https://technicalfnaf.fandom.com/api.php?action=parse&page=<Title>&format=json&prop=wikitext"`.
7. TheBones5 — *How FNAF 2 Works: Complete Guide/AI Breakdown*, 2023-10-25:
   <https://www.youtube.com/watch?v=FizTzjyGP3U> (office queue pacing, Toy Bonnie's
   50%-per-0.5 s / 1-in-3-per-s wait rolls, the RVC mask-timing rationale)
