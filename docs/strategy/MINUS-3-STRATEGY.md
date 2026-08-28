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

**On Android (2026-08-26):** the same state exists and is reachable — it is
`viewing` (the counter driving the picture, the label and the flash-immunity
gate) disagreeing with the `your view` marker (driving the stun target and the
cam-stall). The arming input is the same one, with a window of up to 200 ms
instead of a single frame. See §5 item 2 and §8.

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

**Device-transfer result (2026-08-28, `n2-minustoys-0117`).** The engine port
(`tools/minustoystest.mjs` / `tools/device/minus-toys-plan.mjs`, 200/200 in the
deterministic model) was run open-loop on the Moto g56, Night 2. **It died at
~2 AM to Balloon Boy walking into the office, then Foxy** -- and the model
explains why: shrinking the mask window by ±500 ms in the sim drops Night 2 to
35/300, ~190 of those `BB-inside → foxy`; the cadence never reaches more than 4
of the 5 mask ticks it needs to *cleanly* evict Balloon Boy. That is the
**~0.66 s margin above, measured** -- and the device port cannot hold it. It is
anchored to `T0` (first HUD frame), not to the game's :X0/:X5 phase; the
per-instruction margin map (`tools/device/minus-toys-margin.mjs`) puts the
whole-schedule phase tolerance at **33 ms early / 99 ms late**, against an epoch
bracket the run measured at **302 ms** -- three to nine times the margin before
any per-cycle jitter or the −184 ms/min game-vs-wall drift the run also
measured. Under the
full clock-error model, Nights 3-5 open-loop are 0/600; an AM-digit re-anchor
every 70 s recovers only to ~17-35 %. The Toys themselves *did* appear held on
the phone (no Toy reached the office in any frame). Full record:
`docs/device/ON-DEVICE-VALIDATION.md` §"The Minus Toys open-loop policy is
refuted on the phone". **Open-loop Minus Toys is not a viable device policy;**
the paths that remain are an external hybrid (AM re-anchor + reactive vent read
+ mask verify/retry, ceiling ~1/3 per the mapped `jasonclone` bot) or the
in-APK read-internal-state route (`plans/17`).

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

*The anchor is the whole difference between a trainer and a phone bot.* A human
in the rhythm lane reads the on-screen clock and never loses the :X0/:X5 phase.
The 2026-08-28 device port lost it — it anchored to `T0` and drifted (§3
device-transfer result). "Timer-anchored" is only a strength when the timer is
the game's, not the pilot's wall clock.

Gaps in `src/engine.js` (all load-bearing for this family, none exercised by Minus 7):

1. **Cam-stall** — ~~does not exist in the engine~~ **sourced & implemented
   2026-08-20**: the marker look-hold (groups 344-360) pins the Withereds
   (persisting monitor-down via the parked marker) and monitor-up Mangle.
   Note it does NOT cover the Toys — Minus Toys' cam-stall claims need
   re-checking against that set.
2. **Double camera glitch** — ~~**checked against source 2026-08-20**: no
   two-camera state exists in the Android data model (one `viewing` counter,
   one marker, set atomically per touch; the light input is blocked while
   masked). The PC glitch is an input-layer artifact that does not visibly
   transfer to this build; glitch-dependent Minus Toys steps need on-device
   confirmation before being assumed possible on Android.~~
   **Retracted and reversed 2026-08-26 — it transfers.** A retained on-device
   frame (Night 1, 1 AM, run `n1-full-1640`, moto g56 5G, build 2.0.7+26) shows
   **CAM 04 and CAM 07 highlighted at once** while the picture and label read
   Party Room 4. Re-read against the dump, the selection is **two** fields:
   `viewing` (counter 55) and the `your view` marker (126). A touch writes both
   plus a clear latch (g16-27 / g39+40); the **monitor-raise restore (g1 → g2)
   writes only `viewing`**, from a `last viewed` that g263 samples on a **200 ms**
   timer. Select a camera and drop the monitor inside that window and the raise
   leaves `viewing` on the previous camera with the marker parked on the new
   one — both buttons lit, because g45 is the only clearer and fires on the
   touch latch alone. It persists until the next camera touch. Full sourcing,
   controls and the open items are in
   [`ANDROID-SOURCE-STATUS.md`](../android/ANDROID-SOURCE-STATUS.md)
   §"the double-camera glitch *does* transfer".
3. **CAM 08/09 custom-night flash immunity** — **sourced 2026-08-20**: the
   flash groups carry unconditional `viewing <> 8` (Withereds), `<> 9`
   (Toys), `<> 11` (Mangle) exclusions; whether night 7 changes anything
   remains to confirm (the groups look night-independent).
   **Qualified 2026-08-26:** those gates read `viewing`, but *who* gets stunned
   in the same groups (450-457) is `your view` overlapping the character. With
   item 2's desync armed the two disagree, so the exclusions are bypassable
   exactly as on PC — park the marker on CAM 09 with `viewing` elsewhere and a
   held light stuns all three Toys (g453-455). The exclusions are unconditional;
   they are simply not immune to a split selection.
4. **Golden Freddy interval avoidance** — the engine has `GF_UNFAIR_WINDOW`, but not
   the full "never enter cams during an interval" spawn model, the first-frame hall
   flash on monitor-down, or the 1-frame blackout flash window.
5. **RVC mask timing** — the extra ~0.5 s mask hold clearing vent animatronics needs
   checking against `MASK_LEAVE_FRAMES` / cumulative-mask-time modelling.
6. **Right vent light stalls Toy Bonnie** (Shooter25) — ~~vent lights are widgets
   only~~ **sourced & implemented 2026-08-20 (second pass)**: group 428 requires
   `right light` = 0 on his vent hop; `canAdvance` now enforces it.
7. **CAM 03 stalling Toy Bonnie + Withered Freddy** — confirmed by the
   Technical-FNaF wiki's flashlight page (source 8), whose strategy table lists
   Minus 2 as "Camera Light, Cam 3, Toy Bonnie and Withered Freddy, glitchless".
   ~~What remains open is only *our route table*~~ **Resolved 2026-08-20**: the
   post-XOR re-derived routes put CAM 03 on both — Toy Bonnie's first hop and
   Withered Freddy's second — exactly matching this claim. (The old table was
   built on scrambled identities.) The same page also confirms the stun-immunity exceptions (Withereds in
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

## 7. 2026-08-20 Android probe verdict (plan 02 step 2)

`tools/minus2test.mjs` encodes the family's only Android-viable member —
glitchless Minus Two, adapted with every available trick (sourced right-vent
Toy Bonnie stall, boundary-aligned Foxy flashes during holds, reactive
mask-hold branches, observable-only controller) — against the corrected
Android model:

- ~~**Minus Toys cannot transfer**: the double-camera glitch has no Android
  data-model state (§5 item 2) and CAM 09 is unconditionally flash-excluded
  (§5 item 3).~~ **Withdrawn 2026-08-26 — both halves of that sentence were
  wrong.** The glitch state exists (`viewing` vs. the `your view` marker, §5
  item 2), and the CAM 09 exclusion gates on `viewing` while the stun targets
  the marker, so a split selection bypasses it (§5 item 3). **This does not make
  Minus Toys work on Android — it makes it unprobed.** `minus2test.mjs` never
  modelled the glitch and still does not; the engine has no two-camera state, so
  the probe below measured the *glitchless* member only, and its result stands
  on its own terms. What the retraction changes is that the family was closed
  for the wrong reason. The consecutive-tick mask-clear semantics below break
  the probed **Minus Two** policy; they are not yet a Minus Toys verdict. See
  the 2026-08-28 correction at the end of §8; the “engine has no state” sentence
  above records the 2026-08-26 checkpoint and is now superseded.
- **Minus Two: 16/200 normal seeds** (deaths inside-office via Toy Chica);
  the pin-all-six `--cams=3,5,6` extension scores 0/200. The pinned
  worst-luck 100/100 is a diagnostic artifact (pinning freezes the escape
  RNG too), not a proof.
- **Why it fails structurally on Android**: Foxy's lock rolls land on the
  5 s boundaries and demand a hall flash roughly every cycle; each flash
  resets the sourced *consecutive* mask counters (group 293), so Toy Chica's
  five-tick guaranteed clear cannot complete before her five-second opening
  timer arms, and any later monitor raise admits her to marker 123. On PC
  the mask repels vent animatronics near-instantly, which is why the
  published family works there; the Android consecutive-tick semantics are
  the transfer-breaker. Adding flash depth to protect Toy Chica re-derives
  Minus 7's {4,7,10} cut set.
- **Caveat**: this closes the probed policy shape on the *current model*.
  The consecutive-tick mask-clear semantics are the single highest-value
  target for on-device validation — if the real device clears vent
  animatronics faster, the family reopens.

For plan 02 this means a "Minus 3 family" trainer mode on Android is either
a best-odds practice mode (~8% even played perfectly, per the probe) or PC
history — not a zero-RNG drill like Minus 7.

## 8. 2026-08-26: the glitch transfers, so §7's first bullet is withdrawn

Sourced from the event sheet and forced by a retained on-device frame — the
mechanism, the device provenance, the pixel control and the group citations are
all in [`ANDROID-SOURCE-STATUS.md`](../android/ANDROID-SOURCE-STATUS.md)
§"2026-08-26: the double-camera glitch *does* transfer". The strategy-side
consequences:

- **Minus Toys is positive in the Android model, not yet proved on-device.**
  `tools/minustoystest.mjs` arms the split through the real 200 ms sampler and
  runs the published 10 s cadence: **200/200 normal + 100/100 pinned
  worst-luck**, against a **0/200 no-split control**. Deliberate device arming
  is proved below; actual Toy stun transfer and repeatability remain open.
- **The glitched hold does stack, in source.** With the marker parked on CAM 09
  and `viewing == 11`, one held flashlight both stuns all three Toys (g453-455,
  gate `viewing <> 9`) and blocks the Puppet's escape roll (g494, `viewing == 11`
  + `lit?`). That is the routine's central trick, and it reads as intact.
- **Do not import Minus Two's transfer-breaker into Minus Toys.** §7's
  structural failure was Toy Chica reaching the opening in the glitchless
  CAM-03 policy and failing to clear before the next raise. Minus Toys' whole
  premise is that the glitched CAM 09 light pins Toy Chica, Toy Bonnie and Toy
  Freddy on the Show Stage. The glitch therefore targets the exact character
  that killed Minus Two. Android's five-consecutive-tick rule is still
  load-bearing for Mangle and BB, so a glitch-aware probe can still fail, but
  not by simply citing the old Toy Chica trace.
- **Device arming is now proved once (2026-08-28).** On the target Moto g56,
  one scheduled HID attempt used 33 ms contacts plus a 17 ms released gap from
  CAM 09 to monitor-down. The next raise showed the CAM 11 Prize Corner feed
  and wind control with both CAM 09 and CAM 11 lit. Artifacts:
  `captures/n2-doublecam-hid-0003.{png,hid}`. This proves the split state and a
  working 50 ms actuator geometry, not the glitched stun or an all-night policy.
- **What it would take to settle the strategy:** the engine state and policy
  probe are complete. What remains is a repeatability sweep around the proved
  HID geometry and an on-device observation that the glitched CAM 09 light
  actually holds the Toys. Until those exist, quote this as "model-positive and
  deliberately armed on Android; device stun unmeasured", never as "works".
- **Legitimacy caveat unchanged**: this is the glitch-based half of the family.

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
