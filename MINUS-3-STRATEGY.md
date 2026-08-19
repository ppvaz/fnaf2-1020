# FNaF 2 — 10/20 Mode: The "Minus 3" Family
### State-of-the-art research notes (plan 01), researched 2026-08-19

> **What it is:** a lineage of 10/20 strategies built on **cam-stalling** — animatronics
> in certain rooms cannot leave while that room's camera is *selected* — usually held
> open all night via the **double camera glitch**. The name comes from the original
> version removing the 3 stallable Withereds from the night entirely.
>
> **State of the art (2025):** Zach_Scream's **"Minus Toys"** — the *second ever*
> zero-RNG 10/20 strategy after Minus 7, and by community consensus far easier to
> execute. A glitchless zero-RNG variant ("Minus Two") also exists.
>
> **Legitimacy caveat:** everything glitch-based in this family is considered a
> questionable win by part of the community. Minus 7 and Minus Two are glitchless;
> Minus 3 and Minus Toys are not.

---

## 1. Timeline of the lineage

| Date | Strategy | Author | What it added |
|---|---|---|---|
| pre-2023 | Right Vent Camp (RVC) | community | the baseline: mask-camping with an extra ~0.5 s of mask time to clear vent animatronics. Loses to RNG. |
| 2023-07-27 | **Minus 3** | insstaa (+ Yunivers) | double camera glitch keeps CAM 08 (Parts/Service) selected all night → Withered Bonnie, Chica and Freddy never leave. Not RNG-proof, but far easier. |
| 2023-12-13 | Minus 7 | Niko Frost | glitchless flash-loop; first zero-RNG strategy (see `MINUS-7-STRATEGY.md`). |
| 2024-06-09 | brayden's timer strategy | brayden (8brayden8) + Shooter25 | timer-anchored RVC descendant: Golden Freddy 5 s-interval avoidance + Shooter25's discovery that the **right vent light stalls Toy Bonnie**. Not zero-RNG (~99% — measured by a bot, see §4). |
| 2025-05-13 | **Minus Toys** | Zach_Scream | double camera glitch onto CAM 09 (Show Stage) makes it *flashable*; flashing it stuns all 3 Toys in place all night. Combines GF-interval play and RVC mask timing. **Zero RNG.** |
| 2025-05-14 | Minus Two (glitchless) | Zach_Scream | same plan without the glitch: flash CAM 03 to stall Toy Bonnie + Withered Freddy. **Zero RNG, glitchless**, but much less music-box slack. |
| 2025-10-18 | Minus 3 Toys run | Tru3P1ay3r | independent completion of Minus Toys; verdict: "100% beatable every single time … way, way easier" than Minus 7. |

## 2. The two exploited mechanics

**Cam-stall.** Animatronics in Parts/Service cannot be light-stunned there, but they
cannot *leave* while their camera is selected (Withered Foxy excepted). The Toys on
the Show Stage similarly never move while CAM 09 is both selected and flash-stunned.

**Double camera glitch.** Clicking a different camera button and dropping the monitor
on the same frame leaves the game with *two* cameras selected (both buttons highlight).
The player watches and winds on CAM 11 while the glitched second camera (08 or 09)
stays "selected" — and, crucially, the flashlight input registers on the glitched
camera, which bypasses the custom-night rule that CAM 08/09 cannot be flashed.
The glitch is re-armed once before 0:05 and persists.

## 3. The state of the art: Minus Toys (Zach_Scream, May 2025)

From the author's own write-up (source 5) — the full routine, condensed:

- Before 0:05, glitch the cameras so CAM 09 is selected while viewing CAM 11.
- Never enter the cameras during a Golden Freddy 5 s interval; enter just *after*
  each interval, exit at the next :X4/:X9.
- While exiting, hold the flashlight: the held flash stuns CAM 09 (all three Toys,
  6.66 s stun vs ~5 s cycle) *and* flashes Foxy during the mask/monitor animation —
  safe only because GF was never allowed to spawn.
- Blackout after monitor-down: wait it out with the mask on until just before the
  next 5 s interval (the RVC extra-half-second clears whoever entered).
- No blackout: assume someone is in a vent; mask until right before the next
  interval, flash Foxy on exit, re-enter after the interval. **Vent lights are never
  used** — Toy Bonnie never moves off the stage, so the right vent stays empty.
- Slack budget: leaving cams at :X4/:X9 against a 6.66 s stun and a
  just-after-interval re-entry leaves **~0.66 s of error margin** per cycle.

Claimed and independently replicated as zero-RNG: "This along with Minus 7 are 100%
beatable every single time, although this strat is way, way easier" (Tru3P1ay3r).
Foxy is nullified, Toy Bonnie never vent-camps, the music box "never went below half."

**Minus Two (glitchless variant):** identical plan, but with no glitch CAM 09 cannot
be flashed, so instead CAM 03 is flashed before every monitor-down, stalling Toy
Bonnie and Withered Freddy; the player then swaps back to CAM 11 to wind. Zero RNG,
legitimate, but the extra camera swap costs most of the wind slack — the author calls
it "pretty damn annoying."

## 4. Prior art note: the Shooter25 bot

brayden's 2024 guide was validated by an in-game bot mod written by Shooter25
("FNaF 2 Practice Mod" on Gamejolt) that plays the strategy perfectly: 104 wins /
1 death at recording time, including 100 wins in a row. Hand-coded, not ML — but it
is the community doing exactly what this repo's simulator does: measuring a
strategy's consistency by removing the human. (Cross-referenced in plan 05.)

## 5. What the trainer's engine does and doesn't model

Fit: every strategy in this family is **timer-anchored on the 5 s intervals**, like
Minus 7, so the rhythm-lane coaching model fits — Minus Toys especially, since it is
a fixed cycle with two branches (blackout / no blackout).

Gaps in `src/engine.js` (all load-bearing for this family, none exercised by Minus 7):

1. **Cam-stall** — "selected camera prevents leaving" does not exist in the engine.
2. **Double camera glitch** — no concept of two selected cameras, nor of the
   flash-redirect that makes CAM 08/09 flashable.
3. **CAM 08/09 custom-night flash immunity** — the rule the glitch bypasses.
4. **Golden Freddy interval avoidance** — the engine has `GF_UNFAIR_WINDOW`, but not
   the full "never enter cams during an interval" spawn model, the first-frame hall
   flash on monitor-down, or the 1-frame blackout flash window.
5. **RVC mask timing** — the extra ~0.5 s mask hold clearing vent animatronics needs
   checking against `MASK_LEAVE_FRAMES` / cumulative-mask-time modelling.
6. **Right vent light stalls Toy Bonnie** (Shooter25) — vent lights are widgets only;
   they have no stalling effect in the engine.
7. **CAM 03 stalling Toy Bonnie + Withered Freddy** — confirmed by the
   Technical-FNaF wiki's flashlight page (source 8), whose strategy table lists
   Minus 2 as "Camera Light, Cam 3, Toy Bonnie and Withered Freddy, glitchless".
   What remains open is only *our route table*: Withered Freddy's `STALLED` path
   never passes room 3, so the engine's post-chokepoint routing must be wrong for
   him. The same page also confirms the stun-immunity exceptions (Withereds in
   Parts/Service, Toys on the stage sans glitch, Mangle in the prize corner) and
   endorses the zero-RNG claim: the camera-light strats are "the only ones to have
   a hypothetical 100% consistency", all by stalling Toy Bonnie, "the source of
   all RNG".

## 6. Implications for plan 02

- "Minus 3 mode" should mean **Minus Toys** — it is the family's state of the art,
  zero-RNG like Minus 7, and the thing worth drilling. The 2023 original is of
  historical interest only.
- It is *not* the pure-data drop-in plan 02 hoped for: items 1–6 above are new engine
  mechanics. Still far smaller than plan 03's reactive coach — the routine remains a
  fixed clock-anchored cycle with a two-branch decision (blackout or not), which the
  lane can represent.
- The trainer should surface the legitimacy caveat, and Minus Two is the natural
  "legit rules" sibling mode if the CAM 03 stall (item 7) can be sourced.

## Sources

1. insstaa — *Completing Golden Freddy With a Brand New Strategy (Minus 3 strat)*,
   2023-07-27: <https://www.youtube.com/watch?v=f4xoDEAfpMQ> (discovery account in the
   description; note it mislabels CAM 08 as "the right vent camera" — CAM 08 is
   Parts/Service)
2. FNAF Gameplayer — *BRAND NEW WAY to BEAT 10/20 MODE (Minus 3)*, 2023-08-10:
   <https://www.youtube.com/watch?v=oeG7ymLNyJM> (console how-to linked there:
   <https://youtu.be/BJHUcIV5pC8>)
3. arso0628Stuff — *How to do the Minus 3 Strategy*, 2024-06-15:
   <https://www.youtube.com/watch?v=dbUYWgAdcjQ> (the glitch input, step by step)
4. brayden — *A Brand New FNaF 2 Strategy (Guide + FNaF 2 Bot)*, 2024-06-09:
   <https://www.youtube.com/watch?v=EYtIOKRuQqE> (timer strategy; Shooter25 bot;
   right-vent-light Toy Bonnie stall)
5. Zach_Scream — *My New Strategy: "Minus Toys" 10/20 Mode (World's First, No Vent
   Lights, Zero RNG)*, 2025-05-13: <https://www.youtube.com/watch?v=pO9nkzXmAWs>
   (the authoritative routine write-up, quoted in §3)
6. Zach_Scream — *"Minus Two" Glitchless 10/20 Mode, Zero RNG*, 2025-05-14:
   <https://www.youtube.com/watch?v=Pbiqv6MJNkM>
7. Tru3P1ay3r — *FNaF 2 - 10/20 Mode (Minus 3 Strategy)*, 2024-07-12:
   <https://www.youtube.com/watch?v=dXvSt6_lqwI>; *… (Minus 3 Toys Strategy)*,
   2025-10-18: <https://www.youtube.com/watch?v=yk-umol18Rs> (independent
   replication and comparison against Minus 7)
8. Technical-FNaF wiki, flashlight mechanics (cam-stall and P/S light immunity):
   <https://technicalfnaf.fandom.com/wiki/(Fnaf_2)_Flashlight_Mechanics.>
