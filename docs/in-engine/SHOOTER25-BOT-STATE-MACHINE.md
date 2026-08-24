# Shooter25 bot state machine

*Derived-knowledge ledger, 2026-08-20. This document contains no game assets,
binary, MFA, or raw event-sheet export.*

## Scope and evidence

This is a reconstruction of the embedded `#AI` controller in Shooter25's
`FNaF 2 Practice Mod` release 1.1.0. The source artifact and extraction record
are documented in [`SHOOTER25-PRACTICE-MOD.md`](SHOOTER25-PRACTICE-MOD.md).
Frame 3 (`Frame 1`) contains the main game and 885 event groups. Controller
groups 36-118 implement the policy; later groups splice its outputs into the
game's ordinary mouse/keyboard input paths.

Confidence labels used below:

- **Extracted** — literal object, comparison, assignment, state string, or
  cross-reference visible in the event data.
- **Inferred** — a behavioral name assigned from several extracted uses.
- **Unresolved** — the extraction proves a value exists but not its complete
  intended meaning or expression.

This is **mod-derived PC evidence**, not the mechanics authority for this
project. The modern Android release remains the source of truth. The mod is
most valuable here as prior art for policy design and direct-state practice
instrumentation.

## Architecture

The bot is not computer vision and does not synthesize Windows input. It reads
game objects directly, stores its mode in `#AI` alterable string 0, and joins
the same Clickteam events that normally respond to mouse or keyboard input.

```text
game counters / object positions / danger state
                    |
                    v
        #AI state + substates + countdowns
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
  panel/mask     office pan    three lights
  CAM 11/wind                  (L / hall / R)
```

The state label is also rendered as `Doing: <state>` by the on-screen `AI Do`
diagnostic. Wins, deaths, and streak are persisted through the INI object and
displayed by separate counters.

## Controller registers

| `#AI` field | Reconstructed role | Evidence |
| --- | --- | --- |
| String 0 | Current top-level mode | **Extracted:** `Wind`, `Wind (ShooterStrat)`, `Stalling`, `Checking`, `Blackout`, `Toy Bonnie`, `Vent Character` |
| Value 0 | Five-second phase in milliseconds | **Extracted:** group 37 assigns `Timer mod 5000` |
| Value 1 | Left-vent-light hold countdown | **Extracted:** while `> 0`, group 308 activates `left light`; group 118 decrements it every event loop |
| Value 2 | Right-vent-light hold countdown | **Extracted:** while `> 0`, group 310 activates `right light`; group 117 decrements it every event loop |
| Value 3 | Hall-light hold countdown | **Extracted:** while `> 0`, group 156 sets `lit? = 1`; group 116 decrements it every event loop |
| Value 4 | Per-mode substate | **Extracted:** compared and assigned as steps 0-4 throughout groups 71-113 |
| Value 5 | Consecutive mask-up event-loop count | **Extracted:** reset unless `mask value 0 = 2`, otherwise incremented; thresholds 211 and 305 are used |
| Value 6 | Cycle/branch accumulator | **Unresolved:** incremented by timed/manual branches and reset at several completed responses |
| Value 7 | Five-second Toy-Bonnie-related cooldown | **Extracted:** set to 5 in groups 433/545 and decremented by one every 5000 ms; exact policy name **inferred** |
| Flag 0 | Office-pan direction request | **Extracted:** ON joins groups 261-263, moving `camera follow 2` by -5; OFF joins 264-266, moving it by +5 |
| Flag 1 | Camera-up/CAM-11/wind request | **Extracted:** joins panel-up group 268, CAM 11 selection group 135, and winding groups 621-622 |
| Flag 2 | Camera-down pulse | **Extracted:** joins group 604's `drop everything` path and is then cleared |
| Flag 3 | Mask desired state | **Extracted:** ON joins mask-up group 283; OFF joins the mask-down/drop path in group 605 |
| Flag 4 | Response-complete latch | **Inferred:** set after a 305-count blackout mask and consumed in `Checking`; it has no direct actuator event |
| Flag 5 | No observed role | **Unresolved:** no controller or actuator reference was found |
| Flag 6 | Low-wind branch latch | **Inferred:** set when `music button value 0 <= 200`, cleared on `Wind` entry, and read only inside the controller |
| Flag 7 | Music-box-full latch | **Inferred with strong anchors:** set when `music box counter >= 1950`, cleared on panel transition, and used to choose `Stalling` versus `Wind` |

The three light countdowns are one of the clearest findings from the extraction:
the bot can independently request left vent, hall, and right vent light. Its
office scan is therefore real, but it is implemented by changing the internal
`camera follow 2` X position—not by recognizing a shifted office image.

## Actuator layer

| Output | Event groups | Direct effect |
| --- | --- | --- |
| Raise camera and wind | 268, 135, 620-622 | Create the panel-up action, select viewing camera 11, and repeatedly add to the music-button wind value |
| Drop camera | 604 | Set `drop everything = 1`; clear flag 2 after accepting the pulse |
| Raise/lower mask | 283, 605 | Start mask-up when flag 3 is ON; use the ordinary drop path when flag 3 is OFF and the mask is up |
| Pan toward office left | 261-263 | Move `camera follow 2` X by -5 while flag 0 is ON and the office is available |
| Pan toward office right | 264-266 | Move `camera follow 2` X by +5 while flag 0 is OFF and the office is available |
| Left vent light | 308 | Set `left light` value 0 to 1 while `#AI` value 1 is positive and the view is sufficiently left (`X <= 680`) |
| Hall light | 156 | Set the shared `lit?` counter to 1 while `#AI` value 3 is positive and office safety conditions permit it |
| Right vent light | 310 | Set `right light` value 0 to 1 while `#AI` value 2 is positive and the view is sufficiently right (`X >= 910`) |

This also explains why an external approximation cannot merely tap three fixed
screen coordinates. The embedded policy first pans the office to the required
perspective, then lets the normal hit/input event fire. On Android, an external
reactive controller would need either a reliable perspective guard or direct
instrumented state before attempting the same scan.

## State transitions

The table deliberately preserves the literal thresholds. Repeated Clickteam
conditions carrying OR flags are rendered as alternative branches by the
extractor; where their exact grouping is not fully decoded, the row says so.

### `Wind (ShooterStrat)` — groups 45-52

| Trigger | Result |
| --- | --- |
| `DropCam` fastloop while in this state | Request camera-down, clear camera-up, enter `Checking`, clear the response latch |
| Music-box counter `>= 1950` | Set the box-full latch |
| Panel state becomes 1 | Clear box-full latch; set hall-light countdown to 2 |
| Five-second phase `>= 900` or `<= 300`, with panel down | Request camera-up and clear camera-down |
| Panel state 2 every 5000 ms | Run `DropCam` for 4500 iterations |
| Panel state 2 and old-Foxy value 3 `>= 3` | Run `DropCam` for 500 iterations |

This appears to be an alternate legacy/author strategy entry rather than the
main brayden controller path.

### `Wind` — groups 55-67

| Trigger | Result |
| --- | --- |
| State tick | Clear box-full and low-wind latches; re-evaluate them below |
| Music-button value `<= 200` | Set low-wind latch |
| Phase `< 2000`, left-light countdown expired, panel down | Request camera-up |
| Low-wind latch, phase `< 3000`, left-light countdown expired, panel down | Request camera-up |
| Phase `>= 4800`, panel state 2 | Hall light for 15 ticks, request camera-down, clear camera-up and response latch |
| Music-box counter `>= 1950` | Set box-full latch |
| Frame timer in 19000-20000 ms window | Enter `Stalling` |
| Frame timer `>= 21000` | Enter `Checking` |

The 19-21 second gates appear to govern startup before the steady five-second
phase loop. Their intent is **inferred**; the comparisons themselves are
extracted.

### `Checking` and `Stalling` — groups 70-91

| Substate/trigger | Result |
| --- | --- |
| Substate 0 every 200 ms | Request mask-up |
| `in danger = 1` | Enter `Blackout` |
| Mask fully up, substate 0, no danger | Release mask request; go to substate 1 |
| Toy-Bonnie marker (`Active 19 > 0`) | Go to substate 1 |
| Substate 1, response latch ON, box-full OFF, cooldown positive | Clear pan/response request and return to `Wind` |
| Substate 1, office X `>= 900`, every 100 ms | Go to substate 2; right light for 15 ticks |
| Substate 2, response latch and box-full ON, right-light countdown nearly done | Return to substate 0 and enter `Stalling` |
| Substate 2, right-light countdown expired | Go to substate 3; request leftward pan |
| Substate 3 with response latch | Clear pan/response request and return to `Wind` |
| Substate 3, office X `<= 600`, every 100 ms | Go to substate 4; left light for 10 ticks |
| Substate 4, left-light countdown expired | Clear pan request, reset substate, return to `Wind` |
| Box-full latch ON and value 6 exhausted | Enter `Stalling` |
| Enter `Stalling` | Set right-light countdown to 5 |
| After 21 s, phase `>= 3000`, every 5000 ms | Hall light for 10 ticks |
| After 21 s, phase `<= 300` | End right-light hold, return to `Wind`, increment value 6 |

Groups 71-73 and 112 also contain key-code shortcuts that force `Toy Bonnie`
or `Vent Character`. Those are practice/debug controls, not observations made
by the bot, and are excluded from the policy flow above.

### `Blackout` — group 93

When the mask has remained fully up for at least 305 event loops, the bot resets
value 6, releases the mask request, sets the response-complete latch, and enters
`Checking`. The extraction proves the loop threshold but does not prove an exact
wall-clock duration under dropped or duplicated Fusion ticks.

### `Toy Bonnie` — groups 94-103

| Trigger | Result |
| --- | --- |
| Blackout at its initial stage, or blackout progress `>= 220`, substate 0, no Toy-Bonnie marker | Hall light for 10 ticks; request mask-up |
| Substate 0 and mask count `>= 211` | Hall light for 30 ticks; release mask request |
| Toy-Bonnie marker becomes present | Go to substate 1 |
| Substate 1 and phase `>= 1900` | Request leftward pan |
| Substate 1 and marker disappears | Clear pan, reset counters, hall light for 30 ticks, release mask, return to `Wind` |
| Phase `>= 4750` | Increment value 6 |
| Phase `>= 2000` with music-button value `> 200`, or phase `>= 3000` with it `<= 200` | Request leftward pan, set value 1 to `ceil((5000 - phase) / 16.66) + 4`, run fastloop `Run` once |

The value-1 expression is now fully decoded from Clickteam's expression-token
table: `ceil((5000 - value 0) / 16.66) + 4`. Since value 0 is `Timer mod 5000`
and value 1 drives the left vent light, this holds that light until the next
five-second boundary plus a four-event-loop margin. The literal `16.66`
converts milliseconds to approximately 60 Hz ticks.

`Active 19` is strongly identified as a Toy-Bonnie lifecycle marker: stock
groups use it alongside `new bonnie`, set the controller's five-step cooldown,
and destroy it when the Toy-Bonnie sequence resolves.

### `Vent Character` — groups 106-113

| Trigger | Result |
| --- | --- |
| Pan request ON every 100 ms | Clear it, producing a bounded pan pulse |
| Music-button value `<= 400`, substate 0; or phase 3000-4600, substate 0 | Hall light for 10 ticks, go to substate 1, request mask-up |
| Substate 1, mask count `>= 305` (with an alternate phase `>= 3500` branch) | Hall light for 20 ticks, go to substate 2, release mask |
| Substate 2 and hall-light countdown expired | Right light for 15 ticks |
| Substate 2 with music-button value `<= 400`, or phase `<= 300` | Increment value 6, end right-light hold, reset substate, return to `Wind` |
| Toy-Bonnie marker appears | Switch to `Toy Bonnie`, substate 1 |

## What this teaches this project

1. A fixed Minus 7 loop still needs no live strategy classifier. Absolute-time
   input plus post-run visual grading is the simpler and more faithful design.
2. A visual/reactive strategy does need classified state on the stock game.
   Shooter25 avoids that problem by reading direct objects inside the game.
3. Office perspective is part of the policy state. A stock-device controller
   must confirm or deliberately establish left/center/right perspective before
   using vent-light coordinates.
4. Separate policy from actuators. The controller has explicit modes and small
   countdown outputs; the stock event sheet translates those outputs into game
   actions. That architecture is suitable for an eventual separately signed
   Android research build.
5. Preserve provenance. Shooter25's policy is useful prior art, while Android
   decompilation and untouched-device runs remain this project's mechanics
   evidence.

## Remaining unknowns

- The complete semantic role of value 6.
- Whether flag 5 is dead storage or referenced through an event form not
  recognized by the text dumper.
- Exact Clickteam OR grouping in the longest Toy-Bonnie and Vent-Character
  condition lists.
- Timing equivalence between an event-loop count and wall-clock milliseconds
  under the mod's runtime behavior.

These unknowns do not affect the central architectural result or the proven
actuator mapping.
