# First Night 5 6 AM on the phone — night5-anchor2, 2026-09-12

The Minus Toys route won Night 5 on ZF525F5BH5: the campaign observed the 6 AM
screen and the save advanced. This is the first positive Night 5 terminal on
this handset. Every number below comes from the generated record
[`night5-first-6am-20260912.json`](night5-first-6am-20260912.json), which reads
the retained run files and carries their hashes. The cost of getting here is
counted on its own page,
[`night5-first-6am-cost-20260912.md`](night5-first-6am-cost-20260912.md).

## The run

| | |
|---|---|
| run | `night5-anchor2-20260912T204002Z` (campaign `campaign-2026-09-12T20-40-15.008Z`) |
| binding | `minus-toys`, winner `fnv1a-81b5e51c`, bundle `artifacts/night5-contact-final` |
| qualification | `qualification-hid-mediaprojection-night5-20260912-contact-final.json` |
| arm mode | `observe-once` |
| code at launch | `f31e646` |

## What was observed

- **6 AM, positively.** `device-campaign-result-v1` attempt 1 is `WIN`:
  terminal `sixam`, `terminalVerification.positive: true`. The lifecycle
  observer read `state=sixam` 419 056 ms after the schedule's release, and the
  executor published the same terminal 165 ms later.
- **The save advanced.** Back on the menu the campaign observed Continue and
  the 6th Night entry (`sixthNightVisible: true`, `menuReturned: true`).
  `campaign-proof-v1` holds: `proof: true`, `proofHash fnv1a-e017f7c9`.
- **The video agrees.** The survival grader reads `TERMINAL: clear -- sixam at
  449.0s`; the night HUD first appears at 28.5 s. The retained recording is
  `captures/night5-anchor2-20260912T204002Z.mp4`, sha256 `161f0b6a…0bba3f`.
- **The schedule held without help.** 42 cycle gates, all `AGREED`; 0
  corrections, 0 gate aborts. The peer audit of the frame trace
  (fnaf2-1020-c5) counts 84 contacts landed, 0 lost, 0 sent with the button
  absent; hall 22 lit, 19 dark.

## What this run is evidence for — and what it is not

anchor2 released **unanchored at a drawn epoch**, with no post-hoc epoch, so
**the win is evidence for the route and the contact floors only.**

- The anchor refused: `origin.anchor unavailable`, reason `k-unreachable`. Its
  plan came 2179 ms after the latched onset because it waited for the lifecycle
  classifier (1.8–1.9 s to answer), and `maxK = 2` refuses k = 3 (epoch 3233
  scores 2673/3000 by the model). The schedule was released at once.
- The delivered epoch is `UNKNOWN`. The frame trace was started on
  `hid.night-go` and opened after the release; `phase.json` reads
  `errorVersusFirstNightFrameMs UNKNOWN` with a 1583 ms lifecycle bracket. The
  phone drew this night's epoch, as it did on every earlier run.
- n = 1. Earlier runs of the same binding in the same session died to Mangle and
  Balloon Boy; one win does not make a rate, and none is quoted here.

## Open

1. **The anchor is unverified on the phone.** It has released on its aim once
   (night5-anchor1, 233.45 ms, but at k = 3) and refused on the three runs
   since. anchor3 lost its clock probe to a blocked event loop (fixed,
   `febbe1a`); anchor4 read the latch 36 times and it never latched, because
   frames captured while a frame trace runs take a lightweight path that never
   fed the latch (fixed in source, not yet installed).
2. **The helper's latch cleared on in-night camera views.** anchor2's trace has
   520 `FNAF2_MENU` frames inside the night; the re-arm on that identity is
   removed in source and not yet installed.
3. **No trace has yet covered an onset.** The trace trigger now waits for
   `evidence.started`, about 16 s before the onset.
4. `npm run evidence -- show` cannot open a campaign directory (its RUN_ID check
   rejects the `.` in the id, and it expects a session manifest); this page
   cites the campaign result's `proofHash` instead.
