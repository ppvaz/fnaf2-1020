# Android release-7 source status

This is the canonical accuracy ledger for the project. The target is Pedro's
modern Android FNaF 2 release-7 build: Fusion build 296, project revision dated
August 2025. Community PC mechanics and strategies are useful leads, but a rule
enters the Android simulator only when the Android event sheet, an Android
experiment, or an explicitly labeled approximation supports it.

## 2026-08-20: handle-scramble correction pass

The APK's runtime XORs every object handle with 28 at load
(`COI.loadHeader`); events address objects post-XOR. Every dump before
2026-08-20 therefore carried bijectively swapped object names — including
every Toy↔Withered pair — while all numeric constants (they live in event
parameters, not the item table) were unaffected. The dump has been
regenerated with true names; see `ANDROID-CAMERA-STALL.md` for the proof
chain.

Consequences for this ledger:

- **Corrected and re-verified:** the camera-light stall (400 frames from
  `stun time`, groups 450-457) is live; the look-hold (groups 344-348, 357)
  covers the Withereds and monitor-up Mangle, persists monitor-down via the
  parked marker, and Toys are ordered by Show Stage co-occupancy instead.
- **Name glosses now resolved:** `Multiple Touch`→`viewing`,
  `white button`→`lit?`, `old freddy` marker→`your view`,
  `chicalookatyou`→`office occupied`, `danger 2`→`being attacked by`,
  `monitorFrame`→`mask` (confirming the earlier inference), markers
  120/121/122/123→`hall stage 1`/`hall stage 2`/`in office`/`got you box`,
  `new bonnie` light latch→`viewing hall light`, `old chica` office
  latch→`in danger`, battery counter `cam 9`→`battery life`,
  fuse chain `stun time`→`mute call` is really `time allowed`→`time left`.
- **Re-derived and re-verified same day (2026-08-20, second pass):** the full
  route graph was re-extracted from the true-name dump (regenerated
  `route-graph.txt`) and the `STALLED` table rebuilt from it. Every start
  room, vent assignment, and the 4-7-10 flash cut-set match the real game
  and the corrected source: Withereds + W. Foxy start CAM 08 Parts/Service,
  Toys CAM 09 Show Stage, Mangle CAM 12, BB CAM 10, Puppet CAM 11; internal
  camera ids equal display CAM labels 1:1 (the old fitted 8↔9/4↔7/2↔1
  bijection is retired). Confirmed swaps now in the engine: the inverted
  monitor-DOWN final (plus the `right light` gate) is **Toy Bonnie's**; the
  1000-100*night opening cooldown and 500 ms office-cue roll are **Toy
  Bonnie's**; the six-tick opening arm is **Toy Chica's**; the `office
  occupied` mutex / cams-up streak four are **W. Freddy, W. Bonnie,
  W. Chica, Toy Freddy**; the hall-light-gated edges belong to WF/WB/TF/TC/
  Mangle/W.Foxy while **W. Chica and Toy Bonnie are exempt**. Independent
  validation: the Technical-FNaF wiki's "Minus 2 stalls Toy Bonnie and
  Withered Freddy at CAM 03" matches the corrected routes (TB's first hop
  and WF's second hop are CAM 03); the old table had neither. All engine
  suites pass on the rebuilt model (bbtest 200/200, androidstalltest sourced
  200/200 + 100/100, simtest scenarios re-bound and green).
- **Subsystem re-reads completed in the 2026-08-20 backlog sweep:** Foxy,
  BB, Puppet/music box, Paper Pals, forcedown queue, vent lights, and most
  of Golden Freddy — findings recorded in the extraction backlog below.
  The `ANDROID-OFFICE-ENDGAME.md` prose rewrite is done (item 19); still
  open: the hall-GF kill-threshold group, same-frame input ordering (item 7)
  and the display-map artwork closure (item 23).
- **The dump is reproducible on this machine (2026-08-20).** The extracted
  `application.ccn` plus a CTFAK build carrying our own `EventTextDumper`
  regenerate the true-name event sheet locally in about six seconds; see
  [`SOURCE-DUMP-GUIDE.md`](SOURCE-DUMP-GUIDE.md) and `tools/dump/`. Group
  numbering matches the citations already in this ledger. Item 7 (same-frame
  ordering) is therefore answerable here; item 23 still needs image export,
  which this logic-only dumper does not do.

## 2026-08-20: the mask kills every office light

`lit?` is set by g75 (hall, `viewing = 0`) and g84 (its touch twin), and both
require `mask` = 0; the vent-light clicks (g302/304) carry the same condition.
The camera light (g76/77/85/86) has no mask condition because the mask and a
raised monitor are mutually exclusive anyway. So on this build **a masked
player can do nothing but take the mask off** — there is no holding the light
through a mask.

That contradicts the PC Phase B technique quoted in `MINUS-7-STRATEGY.md` §6
("keep CTRL held: the flashlight costs no power while the mask is on"). The
engine had modelled the *power* half of that claim and not the effect; it now
gates `hallLightOn`, `lightLogical` and `anyOfficeLightHeld` on the mask being
off. Consequence for any Balloon Boy defence: the five-second mask window is a
five-second hole in Foxy cover, which is exactly why Markiplier's variant
evicts Foxy before letting BB arrive (§9.3).

## 2026-08-20: Balloon Boy approach pipeline, re-sourced

Prompted by a strategy claim that keeping the cameras down across the 5 s
boundary *prevents* BB's last move. The event sheet says it defers it:

| Group | Rule |
| --- | --- |
| 342 | Every 5000 ms, `Random(20) < Balloon Boy AI` → `A = 1`. **No monitor, camera or light condition** — the roll is never blocked |
| 359 | `A = 1` and `B = 0` → `A = 2`, `C = 10` (look-hold row already in `ANDROID-CAMERA-STALL.md`: BB has no camera exclusion) |
| 413-416, 418 | `A = 2` + current marker → hop, `A = 0`. Route is **CAM 10 → 07 → 03 → 01 → 05**, no monitor gate anywhere |
| 417 | `A = 2` + on `cam 5` + `viewing > 0` + monitor-up complete → `in office` (122) |
| 290/291 | at 122, raise seen → `v6 = 1`; raise completes → `got you box` (123) |
| 292/294 | at 122 + mask fully on: 10%/s roll, or `v12 >= 5` consecutive ticks → back to `cam 10` |
| 907/293 | `v12` counts fully-masked seconds for Toy Chica, Mangle and BB; re-entering the mask state resets it |

**He is five moves away, not four, and the first one is silent.** Only
g414-416 write his vocal selector (`cam 01` v6 = `Random(3)+1`, played and
re-rolled by g608-611 from samples 21/24/23); g413 (CAM 10 → 07) writes
nothing, and g417 plays only sample 17, the movement thud *every* character's
hop shares (g691-694). So the community's "three laughs then he is in the vent
camera" counts his 2nd, 3rd and 4th moves, and his 5th is the one that needs
your cameras up. The engine previously modelled four moves, making him arrive
sooner than the real game. The vocal is picked at random per move — it does not
depend on which camera he is on. His in-office taunt is a **different** sample
(16), played on every input he blocks while at 123: flashlight key (g78),
flashlight hitbox (g88), the vent-light clicks (g302/304), and g311.

`A = 2` is a **latch, not a moment**: only group 417 gates on the monitor, and
nothing clears the latch while the cameras are down, so a cameras-down 5 s
boundary postpones the hop into the vent opening until the next completed
monitor raise — which the music box forces you to perform. This confirms the
engine's `bb.pending` model (`src/engine.js`) rather than the "cams down = no
move" reading in the community write-ups; see `MINUS-7-STRATEGY.md` §6.

## Labels

- **Implemented** — Android source rule is represented and regression-tested.
- **Confirmed / pending implementation** — event rule is located, but the engine
  does not reproduce its full state machine yet.
- **Partially decoded** — relevant events are located but object identity, ordering,
  or counter meaning is incomplete.
- **Model-only** — useful approximation; not source evidence.

## Implemented Android mechanics

| Mechanic | Evidence / implementation status |
| --- | --- |
| Night clock and movement cadence | Global 1000 ms ticker, 70 ticks/hour, movement opportunity every 5000 ms |
| Movement RNG and Night-7 AI cap | `Random(20)+1 <= AI`; stalled movers capped at 15 |
| Main route graph | Re-extracted 2026-08-20 from the true-name dump, including the off-camera `hall stage 1`/`hall stage 2` transit markers (120/121) |
| Per-edge monitor gates | Final approaches use cams-up conditions; Toy Bonnie's polarity is inverted (monitor DOWN + `right light`); Toy Chica's final hop is unconditioned |
| Office-light movement latch | Physical light state is immediate; the `viewing hall light` latch persists to the next one-second event and guards only specific route edges (W. Chica and Toy Bonnie exempt) |
| Shared office-light battery behavior | Only `lit?` drains `battery life` (g284, backlog item 16) — vent lights are free; night 5+ capacity is 3000 frames. (An earlier version of this row had vent lights sharing the drain; corrected 2026-08-20 second pass.) The vent lights still share the engine's movement-latch model [MODEL] |
| Camera and hall light separation | A short physical tap no longer produces a fake one-second Foxy/GF exposure |
| UI state identity | The camera selection/up counter is literally named `viewing`, and the four-state Freddy-mask object is literally named `mask` — the pre-XOR inferences were correct and are now nominal |
| Shared office defense sequence | Marker-122 encounter starts a 45-frame Night-7 fuse and resolves after 300 frames; only a fully-on mask before fuse expiry defends it |
| Character-specific threshold branches | The streak four (Withereds + Toy Freddy), Toy Bonnie, and Toy Chica use separate sourced marker-122 rules instead of a generic instant mask repel |
| Mangle office endgame | Marker 122 clears after five continuous fully-masked scheduler ticks, while completing the next monitor raise sends her to marker 123 |
| Marker-123 attacks | Per-family Android attack triggers and the shared 40-frame `danger 2` transition are represented |
| Toy Bonnie endgame + repel destinations | Implemented 2026-08-20 (second pass): his B is the unified opening timer / flash stun / repel cooldown; endpoint resolution repels land on the sourced rooms (WB CAM 07, WC CAM 04, TB CAM 03, TC CAM 07) with B = Random(500)/night, and marker-123 leaves write B = 500 |
| Foxy subsystem | Implemented 2026-08-20 (second pass) from backlog item 12: `<=` roll vs AI 17, D +1/s (+1/s more masked), zeroed all night 1 and until 2AM night 2, per-frame exposure vs 100*night, B=50 hall pin gating eviction and the lock-on roll, 500+Random(500) return, GOT-YOU 10 s / instant monitor-down hall flash |
| Threshold mutex | `office occupied` (ex-`chicalookatyou`) serializes final entry for the four shared-streak attackers: W. Freddy, W. Bonnie, W. Chica, Toy Freddy |
| Monitor and mask animation durations | Derived from the Android animation bank and represented as asymmetric frame counts |

## Confirmed or located, but not fully implemented

| Priority | Mechanic | What remains |
| --- | --- | --- |
| P0 | Office threshold/inside state machine | Core marker-122/123 behavior is implemented; finish exact same-frame visual and input ordering around attack transitions |
| P0 | Office queue pacing | The four-attacker mutex and shared encounter latch are anchored; determine exact ordering when W. Bonnie, W. Chica, or Mangle coexist with them |
| P0 | ~~Toy Bonnie Android endgame~~ **Implemented 2026-08-20** | B-as-opening-timer unified with the flash-stun/cooldown field; repels land on CAM 03 with the sourced B cooldowns (see Implemented table) |
| P0 | ~~Foxy~~ **Implemented 2026-08-20** | All backlog-item-12 nuances are in the engine: night-1 / pre-2AM-night-2 dormancy, per-frame exposure vs 100*night, and the B=50 hall pin gating both eviction and his lock-on roll (see Implemented table) |
| P0 | Golden Freddy | **Mostly decoded 2026-08-20 (backlog item 11)**: cams-up spawn roll, fractional AI seeds, mask fade-out, lethal raise AND lethal hall-light with GF present, empty-hall exposure. Still open: hall kill threshold group and the sourced raise-window replacement |
| P0 | Mask counter semantics | **Decoded 2026-08-20 (backlog items 5, 17, 21)**: consecutive-tick counters for TC/Mangle/BB, 10%/s rolls, auxiliary counters all named. BB storage abstraction remains engine-only [MODEL] |
| P0 | ~~Selected-camera movement gate~~ **Implemented 2026-08-20** | Post-XOR: the `your view` marker holds pending rolls for the three Withereds (344-348, no monitor condition — persists monitor-down via the parked marker) and monitor-up Mangle (357). Toys have Show Stage leave-order gates instead (350-356). Engine default `selectedCameraGate: true`. |
| P0 | ~~Dormant camera-light countdown~~ **Resolved 2026-08-20: live** | Groups 450-457 feed B from `stun time` = 400 (never written); the pre-XOR audit was reading the wrong counter. `STUN_FRAMES = 400` is Android-sourced, with per-group camera exclusions (8/9/11) and the Paper-Pals `- night*50` variant. See [`ANDROID-CAMERA-STALL.md`](ANDROID-CAMERA-STALL.md). |
| P1 | Display-camera mapping | Replace the two route-fitted low-confidence room mappings with direct Android UI/object anchors |
| P1 | ~~In-office auxiliary mover~~ **Resolved 2026-08-20** | The pre-XOR "`in office` object" is Balloon Boy himself (dump oi 102 = `balloon boy`); his 122/123 monitor-raise branch is BB's office behavior, not an extra mover |
| P1 | Puppet | Implement Android's post-box roaming route. (The supposed CAM 11 flash-stall event, group 457, actually targets Paper Pals with `stun time - night*50`; the Puppet has no flash group.) |
| P1 | Balloon Boy inside-office behavior | ~~Route/latch/opening behavior is modeled~~ **Sourced 2026-08-20**: roll g342, look-hold g359, hops g413-418 (g417 is the only monitor-gated edge), office entry g290-291, mask clears g292/294. Still open: flashlight disable and eventual departure after a failed defense |
| P2 | Input event ordering | Establish same-frame order for monitor, mask, hall light, and vent-light touch objects |
| P2 | Sound cue frames | Tie bangs, laughs, static, and blackout cues to source state transitions for reaction training |
| P2 | Auxiliary counters | The office encounter latch is literally named `in danger`; `Active 21` is really `decide path` (route-branch selector, used by W. Freddy g376-377 and Mangle g396-397); decode `Sockpuppet AI`, `time of the night` edge cases, and remaining counters |

## Decompile extraction backlog — what unblocks each plan

The exhaustive list of sourced facts needed by the plan documents. Most were
extracted from the corrected (post-XOR) dump in the 2026-08-20 backlog sweep;
each resolved item records the finding. Remaining open items are marked OPEN.

**Cross-cutting (plans 02, 03, 06):**

1. ~~Camera look-hold semantics~~ — done (groups 344-360).
2. ~~Flash-stun duration, source counter, per-group camera immunities~~ —
   done (groups 450-457).
3. ~~True-identity route graph and per-edge gates~~ — done (route-graph.txt,
   `STALLED` rebuilt).
4. ~~Toy Bonnie marker-120→122→123 state machine~~ — decoded: final hop g428
   (monitor DOWN + right vent light off) parks him at 122 with his own
   B = 1000-100*night as the opening timer (drained ~1/frame by g367);
   g546: B=0 + monitor UP → marker 123. Overlay: g436 (masked, unengaged,
   every 500 ms, Random(2)=1) creates `Active 19`, whose existence sets the
   `in danger` encounter latch (g443); g437 masked+engaged 1-in-3/s repel to
   CAM 03; overlay animation completing also repels him (g441). At 123:
   danger on monitor-lowering (g568) or every 10 s cams-up (g722).
   Return immunity = the B cooldown written on every repel
   (Random(500)/night at 122 endpoints, 500 on a 123 leave).
   *Engine: fully implemented 2026-08-20 (second pass) — B is one unified
   counter (opening timer / flash stun / repel cooldown) and repels land on
   the sourced mid-route rooms.*
5. ~~Mask-leave semantics~~ — decoded: at 123 the streak four leave on a
   masked 10%/s roll (g747-750, engine matches). At 122 the five-continuous-
   masked-tick guaranteed leave belongs to Toy Chica, Mangle AND Balloon Boy
   (g294: BB v12>=5), each with a 10%/s early roll (g292). "Cumulative vs
   consecutive": source is consecutive (counters reset when the mask state is
   re-entered). BB storage abstraction remains engine-only [MODEL].
6. ~~Office queue / forcedown ordering~~ — decoded: `drop everything` is the
   forcedown flag; set every 10 s while a streak-four attacker waits at 122
   with cams up (g718-721), on any attack start (g624), by the Puppet's
   arrival at 123 (g574), and by the player's drop button; g262/g274 execute
   it on monitor and mask in the same tick, and g612 clears it. Exact
   same-frame order = group order (262 < 274 < 612 < 614-624 < 718-721).
7. OPEN — same-frame input/event ordering for monitor, mask, hall light and
   vent lights beyond the group-order anchors above (P2; only matters for
   frame-perfect coaching claims).

**Minus 3 / Minus Toys (plan 02, `MINUS-3-STRATEGY.md` §5):**

8. ~~Double-camera glitch~~ — no such state exists in the Android data model:
   one `viewing` counter, one marker, set atomically per touch (group 40);
   mask/monitor transitions zero `viewing` without moving the marker but the
   light is input-blocked while masked (g75/76 require mask v0=0). The PC
   glitch is an input-layer artifact that does not transfer to this build's
   event data; glitch-dependent Minus Toys steps need on-device confirmation
   before being assumed possible on Android.
9. ~~Night-7 variants of the flash immunities~~ — none: groups 450-457 carry
   no night conditions; the 8/9/11 exclusions are unconditional.
10. ~~CAM 03 stalling Toy Bonnie + Withered Freddy~~ — resolved: both routes
    pass CAM 03 in the corrected graph, matching the wiki's Minus 2 claim.
11. Golden Freddy — partially decoded: office GF (`yellowbear`) spawns on the
    5 s clock while cams are up (Random(20) < `Golden Freddy AI`, no existing
    GF, monitor-raise finished, g336); GF AI is seeded fractionally by night
    (1/1000 nights 2-3, 1/100 nights 4-5, 1/10 then 3-at-2AM night 6,
    custom-night value night 7); mask fully on flags him away with an alpha
    fade (g776, g1040-41: +3.761/frame to 255); raising the monitor OR
    holding the office hall light with him present is lethal (g777/g778).
    Hall GF: exposure golden.v0 += 1/frame only while the hall light is held
    on an EMPTY hall (g779). OPEN: the exact kill threshold group for
    golden.v0 and the calibrated 18-frame raise window replacement.

**Right Vent Camp (plan 03, `VENT-CAMP-STRATEGY.md` §4):**

12. ~~Foxy subsystem~~ — decoded with true names: roll (g337, every 5 s)
    `(21 + Random(5)) - D <= old Foxy AI` (operator `<=`), where D (v3) is
    his aggression accumulator: +1/s while unengaged (g824) **plus** +1/s
    more while masked with the vent/office threshold clear (g825); D is
    zeroed all of night 1 (g872) and until 2AM night 2 (g873-874); his AI
    caps at **17** (g829, unlike the shared 15). Route: CAM 08 → hall
    stage 1 (hall light off) → straight to marker 123 (g389-390). At hall
    stage 1 with the hall light held: D=0, exposure v9 += 1/frame (g745) and
    B is pinned to 50 (g855); v9 > 100*night with both lights off and B=0 →
    retreat to CAM 08 with B = 500+Random(500) and `hall movement` = 300
    (g846). In Parts/Service, each 500 ms of hall light drains D by 1
    (g864). GOT-YOU: at 123, every 10 s regardless of monitor state
    (g571-572) or instantly on a monitor-down hall flash (g573), gated on no
    other engagement. Exposure is per-frame proportional — no 1 s
    quantisation (also closes plan 04's residual).
13. ~~Puppet flash-stall~~ — real, and it gates the RISE: with the box empty
    the escape-stage roll (every 1 s, Random(20) <= `Sockpuppet AI`,
    stage < 3) is blocked while viewing CAM 11 with the light ON (g494); off
    CAM 11 it rolls freely (g495). Puppet AI by night: 1/5/8/9/10/15/15
    (g815-821). Reaching 123 sets danger and forces the monitor down
    (g574).
14. ~~Post-mask flash lockout~~ — the light input requires mask state 0
    (fully off), so the lockout equals the mask-off animation length; no
    separate 16-frame counter exists.
15. ~~Foxy exposure quantisation~~ — per-frame proportional (see 12).
16. ~~`right light` semantics~~ — the right VENT light state (v0), held by
    touch (g303/g320), force-cleared every 200 ms (g299) and on monitor
    transitions (g13/14); Toy Bonnie's CAM 06 → 122 hop requires it to be 0,
    so holding the right vent light stalls his vent entry. Vent lights do
    NOT drain the battery — only `lit?` does (g284).

**Search reopeners (plans 05/06):**

17. ~~Auxiliary counters~~ — `in danger` = encounter latch (set by overlay
    existence g443 / arrivals, cleared at endpoint resolution g538-555);
    `office occupied` = the streak-four mutex; `Sockpuppet AI` = the
    Puppet's own AI level (writes g815-821); `decide path` = 1-or-2 route
    fork selector (W. Freddy g376-377, Mangle g396-397); `chicalookatyou`
    (a REAL second object) = Toy Chica's office overlay, created by the
    still-unexplained mask-state-99 branch (g438); `DEMO?` (pre-XOR "cam 6")
    = demo-build flag — the night-3 faster box drain is demo-only;
    `mute call` v0 arms 29 s into the night (g758) — the phone-call mute
    button, closing the 29000 ms timer thread.
18. ~~Roaming rare event~~ — it is Paper Pals, not the Puppet: `Paperpals AI`
    is seeded at 1 with P=1/100 per night (g822), rolls on the shared 5 s
    clock, and has a single office hop (g412) plus the `- night*50` flash
    variant. The 1/1000-style fractional seeds belong to Golden Freddy's AI.
19. ~~`ANDROID-OFFICE-ENDGAME.md` prose rewrite against true names~~ — done
    (the 2026-08-20 rewrite landed with the handle-scramble commit; verified
    free of pre-XOR names, ledger closed 2026-08-20 second pass).

**Minor threads:**

20. ~~BOX_WIND discrepancy~~ — resolved: winding below 300 snaps to 300
    (g639/645), then +5 per frame (+300/s, g638/643); 2000 from empty is
    (2000-300)/300 ≈ 5.67 s — the trainer's Markiplier-calibrated 5.66 s was
    right, and the earlier 6.67 s figure forgot the snap-up floor.
21. ~~BB inside-office~~ — at 123 BB force-clears `lit?` every frame (g96)
    and blocks light/camera touch inputs (g75-88, g301-320, clicks play his
    laugh); no departure group from 123 exists — BB is permanent once
    inside. At 122 he behaves like Toy Chica/Mangle: monitor-raise
    completion advances him (g290-291), five continuous masked ticks or a
    masked 10%/s roll return him to CAM 10 (g292/294).
22. ~~`cam 6` counter / 29000 ms timer~~ — see 17 (`DEMO?` and `mute call`).
23. OPEN — belt-and-braces display-map closure via UI button artwork (five
    identity anchors already fix it).

## Research rules

1. Android event data outranks PC/community descriptions for this project.
2. A community strategy may seed an Android policy test, but its published PC win
   rate is never an Android calibration target.
3. Simulator sweeps search policies; they do not establish mechanics. Any policy
   that depends on a model-only rule stays a hypothesis.
4. Every source interpretation gets a focused deterministic regression before it
   changes search conclusions.
5. A negative result closes only the modeled policy family and the decoded Android
   mechanics it actually exercises.
6. An unresolved source detail stays on this ledger rather than entering the
   engine unless it can change survival, player timing, or a policy under test.

## Current strategic verdict

- Minus 7 remains the only human-executable policy with a fully surviving
  regression control, and that control is Android-sourced again as of
  2026-08-20: the 400-frame camera-light stall is live in the owned binary
  (`stun time`, groups 450-457) and the corrected model — flash stun plus the
  Withered/Mangle marker hold — scores 200/200 normal seeds and 100/100
  pinned worst-luck seeds. The stall-free and hold-only controls still score
  0/200, confirming the flash stall is the strategy's load-bearing mechanism.
  See [`ANDROID-CAMERA-STALL.md`](ANDROID-CAMERA-STALL.md).
- Six-Seven has no two-camera cover on the extracted Android route graph and stays
  refuted for the target platform.
- The Minus 3 family (plan 02) is not zero-RNG on Android: Minus Toys cannot
  transfer (no double-camera state, CAM 09 flash-excluded) and the adapted
  glitchless Minus Two probe scores 16/200 normal seeds with a structural
  Toy Chica failure (`tools/minus2test.mjs`, `MINUS-3-STRATEGY.md` §7). The
  consecutive-tick mask-clear semantics are the highest-value on-device
  validation target — they are what breaks the whole imported family. The
  adb harness and first results live in
  [`ON-DEVICE-VALIDATION.md`](ON-DEVICE-VALIDATION.md).
- The apparent 150/150 monitor-denial reopening is **retracted**. It came from
  reading groups 538-555 as continuous mask polling; they actually resolve the
  latched defense state at the end of the 300-frame office sequence. The corrected
  observable controller scores 0/150 across every tested gate-aware family.
- The office audit is documented in
  [`ANDROID-OFFICE-ENDGAME.md`](ANDROID-OFFICE-ENDGAME.md). W. Chica's state-99
  branch, auxiliary movers, and exact non-mutex ordering remain ledgered gaps;
  they do not justify more engine complexity without a reachable policy or
  observable Android test that depends on them.
