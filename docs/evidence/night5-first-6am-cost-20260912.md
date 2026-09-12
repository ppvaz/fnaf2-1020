# What the first Night 5 6 AM cost — a ledger, 2026-09-12

`night5-anchor2-20260912T204002Z` reached 6 AM: `state=sixam` observed at
+419.06 s after release, 42 cycle gates all AGREED, zero corrections, campaign
exit 0. The win itself — the graded bundle, its qualification and the Plan 12
rung — is written up by the session that held the phone in
[`night5-first-6am-20260912.md`](night5-first-6am-20260912.md). This page
is the other half Pedro asked for: **what it cost to get here**, counted from
the repository, not from memory. Every number below has a path.

Two cautions carry over from the win page. anchor2 released **unanchored**
(`origin.anchor` unavailable, `k-unreachable`, planned 2179 ms after the onset),
so the epoch it won at was drawn by the lifecycle classifier, not chosen; and
its frame trace began 1.6 s after the release (the old `hid.night-go` trigger),
so `phase-reconstruct --frame-trace` refuses to name that epoch. The win is
evidence for the route and the contact floors. It is not evidence for the
anchor, and it does not say which band it landed in.

## The calendar

| date | what | where |
|---|---|---|
| 2026-08-26 | Night 1 cleared on device (`n1-full-1640`, 420.2 s) | `plans/PROGRESS.md` dashboard, Plan 13 |
| 2026-09-08 | first Night 5 device attempt and qualification | `docs/evidence/night5-attempt-20260908.json`, `qualification-hid-mediaprojection-night5-20260908.json` |
| 2026-09-09 | "Night 5 loses input below the application (measured)"; the monitor raise fails; the Marionette collects | `plans/PROGRESS.md` §2026-09-09 |
| 2026-09-11 | phase measured and controlled; the origin, not the arm, is the error; best run on record 285 s | `plans/PROGRESS.md` §2026-09-11 (four entries), `night5-delivered-phase-20260911.json` |
| 2026-09-12, 00:00–05:00 | strokes runs, the lost press read from the trace, the tick budget, longer cycles refuted, the hall retracted twice | `night5-phase-measured-and-hall-open-20260912.md`, `night5-longer-cycle-refuted-20260912.md`, `night5-mask-window-tolerance-20260912.md` |
| 2026-09-12, 05:00–08:00 | contacts to 200 ms; 372.5 s, then 187.1 s | `night5-contacts-clean-still-losing-20260912.md`, `qualification-…-contact200.json`, `…-contact-final.json` |
| 2026-09-12, 19:00–21:00 | four repetitions (109–193 s, all BB → Foxy), the anchor, the first 6 AM | `night5-anchor-aim-20260912.json`, `artifacts/runs/night5-rep*`, `night5-anchor*` |

Four days from the first Night 5 attempt to the first clear; four Claude
sessions on 2026-09-11/12 (`git log --format=%b | grep Claude-Session`);
58 commits since 2026-09-11 00:00, 21 of them carrying device evidence under
`docs/evidence/` or `artifacts/`, 37 bookkeeping (tools, gates, docs).

## The nights

Every run directory under `artifacts/runs/` created on 2026-09-12, with the
executor's own facts (`verdict.txt`) and, where a person looked at the frames,
the killer. "By eye" means confirmed from the retained video by a session and
recorded in a message or evidence page; no cause model named any of these.

| run | gates (agreed / corrected / aborted) | ended | killer |
|---|---|---|---|
| smoke, baseline, armcheck, tracecheck, dryanchor, final1 | no night, or setup only | — | — |
| observeonce | 0 | device ANR at ~50 s | — |
| originfix, gatesplusphase, gatesplusphase2 | 0 | arm unresolved / read unavailable | — |
| gatesfired | 0 | `startGateLedger is not defined` (a code defect) | — |
| gatesfired2 | 24 (21 / 3 / 0) | static at ~243 s | Mangle, 3 AM (`night5-mangle-attribution-20260911.json`) |
| repeat1 | 15 (13 / 2 / 0) | static at ~150 s | BB in the office, then Foxy (operator) |
| perfetto1 | 28 (23 / 5 / 0) | static at ~290 s | — (the night spent on an input trace the phone cannot produce) |
| seamfix1 | 16 (12 / 4 / 0) | static at ~157 s | — (the seam hypothesis, refuted by this run) |
| strokes1 | 17 (15 / 2 / 0) | terminal not observed in time (last=title) | — |
| strokes2 | 25 (21 / 3 / 1) | mask-state-unavailable abort at ~249 s | Withered Bonnie (by eye; the model built on it was withdrawn the same day) |
| strokes3 | 16 (14 / 2 / 0) | static at ~192 s | BB in the office, then Foxy (by eye) |
| strokes4 | — | refused at preflight; its verdict was strokes3's (the `analyze()` ghost) | — |
| gatefix1 | 6 (2 / 3 / 1) | mask-state-unavailable abort at ~57 s | — |
| contact200a, attempt 1 | 37 (37 / 0 / 0) | static at 372.5 s | not named; dark-hall Foxy is the hypothesis |
| contact200a, attempt 2 | 19 (16 / 3 / 0) | static | — (all three corrections were the camdrop still at 33 ms) |
| final2 | 19 (18 / 0 / 1) | static at 187.1 s | Mangle, monitor up (by eye) |
| rep1 | 11 (11 / 0 / 0) | static at 109.2 s | BB in the office, then Foxy (by eye); epoch 885.6 ± 24.7, a winning band by the model |
| rep2 | 15 (15 / 0 / 0) | static at 149.6 s | BB, then Foxy (by eye); epoch 365.1 ± 23.9, a 4-tick BB band |
| rep3 | 19 (19 / 0 / 0) | static at 193.1 s | BB, then Foxy (by eye); epoch 556.8 ± 23.1, a 4-tick BB band |
| rep4 | 12 (12 / 0 / 0) | static at 123.1 s | BB, then Foxy (by eye); trace lost to logcat rotation |
| anchor1 | 25 (24 / 0 / 1) | static at ~244 s (the abort followed the death) | Mangle, 3 AM (by eye); released at k=3, an 89% epoch |
| **anchor2** | **42 (42 / 0 / 0)** | **6 AM at +419.06 s** | **none** |

Thirty run directories; seventeen nights reached the steady loop; one reached
6 AM. After the contact fix (final2 onward) the loop ran **124 gates with zero
corrections** across seven nights and won once — 1 in 7 at drawn epochs, where
the model prices a drawn epoch at 41–46 %. That gap is still open: rep1 died at
an epoch the model wins 100/100, so something about Balloon Boy's eviction on
the device is not in the model yet.

## The wrong turns, and what each cost

Counted in nights, instruments, or the number of times the same lesson had to
be learned. The mistake register in `CLAUDE.md` grew from 6 entries to 13 over
these two days; the entries below are the ones with a price tag.

| turn | what was believed | what was true | cost |
|---|---|---|---|
| Perfetto input trace | a dispatch trace would explain the lost press | this handset advertises no `android.input.inputevent`; recorded as a negative on 2026-08-30 and rediscovered | one full night (perfetto1) and a default-on 900 s trace on every attempt until 5938e57 |
| the lost MASK press | ~12.5 % of mask presses were lost, a Bernoulli rate no estimator fixes | the lost contacts were 33 ms MONITOR taps; the mask tap then hit a raised bar; `MIN_CONTACT_MS` = `FUSION_POLL_MS` = 33, zero slack | every night from 2026-09-09 to the morning of 09-12 carried it; the seam hypothesis (seamfix1) and the gate's read-back hold (8953ffa) were both built on the wrong reading |
| the hall drop, measured twice | the hall light failed on 31 % of cycles, perfectly separated by reveal onset | the instrument scored the camera-monitor screen; a second filter selected the same frames | a day's instrument (`hall-flash-metric.mjs`), built and removed; the true rate (40 % dark at 33 ms mask-off, 58–61 % at 200 ms) came later from the schedule + strokes |
| the Withered Bonnie model | a one-run jumpscare model could name a killer | 24 false positives on the next run, silent on the real Foxy; a brightness detector wearing a label | built and withdrawn the same day; the euclid-vs-cosine finding survives |
| longer loop cycles | 15 s or 20 s cycles would buy slack | 0/3000 at both: the mask window's recurrence is what evicts | one model sweep; closed the route space |
| the gate's read-back | holding the stream to watch the correction was free | it released up to 1000 ms late against a ±185 ms window | priced at 5.5 % per attempt; and the correction it watched was already too late to save the cycle either way |
| the flicker as BB's entry | a 10 Hz stroke flicker during the wind dated BB walking in | by eye, BB was inside before it; the flicker is a raise drawn with tear bands, on the raise BB entered at | no night; one hypothesis withdrawn and one kept as a marker candidate |
| k is free | the epoch response is periodic, so releasing whole seconds later costs nothing | 233/1233/2233 are 3000/3000; 3233 is 2673/3000 (BB) | anchor1 released at k=3, an 89 % epoch; `maxK: 2` is now in the register |
| the trace trigger | starting the frame trace on `hid.night-go` catches the night's start | on an anchored run T0 follows the onset, so the trace opened after it | anchor1 and anchor2 (the win) have no post-hoc epoch; fixed in 524ae34 |
| the survival grader | death static is bright and rough (mean > 90, edge > 40) | on this handset it is a mid-grey noise field (mean 34–37, decorrelated frame to frame) | final2, rep1 and anchor1 graded "ALIVE, a lower bound"; fixed in a8536b7 by a temporal rule |
| the pipeline's own blind spots | the instruments ran on every run | the frame-trace glob missed `RUN-<startNs>.tsv` for a session; `analyze()` took the newest campaign dir (strokes4's ghost; contact200a's hidden 37-cycle attempt); the phase step never received the trace | every epoch cited before fe48d16 was read by hand |

## What was built to get here

Instruments added under `tools/device/` since 2026-09-11 (`git log
--diff-filter=A`): `capabilities.mjs`, `night5-run.sh`, `run-report.mjs`,
`phase-reconstruct.mjs`, `fact-register.mjs`, `tap-stall-audit.mjs`,
`framesource.py`, `decode-once.py`, four death-cause models (one withdrawn),
seven tests; removed: `hall-flash-metric.mjs` and the withdrawn model. The
Cue Helper gained `NightOnsetLatch.java`; `packages/adapters` gained
`button-strokes.js` and `night-onset.js`. The post-run pipeline went from
700–2300 s to 209 s on the same run with identical verdict lines
(`docs/operations/GRADE-PIPELINE-STEPS.md`). Eighteen evidence pages were
written on these two dates, three of them refutations or withdrawals.

## What actually moved the night

In order of measured effect:

1. **Contacts from 33 ms to 200 ms** (loop taps, then the camdrop): from 2–5
   corrections per night to zero in 124 consecutive gates. This is the change
   the win sits on.
2. **Keeping the phone out of the analysis** (`on_exit` reorder, the shared
   grading slice, decode-once): a night every ~10 minutes instead of every
   ~40, which is what made four repetitions and three anchor attempts fit in
   one evening.
3. **Reading the traces instead of the summaries**: the lost-monitor-tap
   finding, the hall census, the epoch measurements and the death-static rule
   all came from data that had been on disk before anyone looked.

Not yet moved, and the next cost: the epoch is still drawn (anchor3 is the
first run that can verify the anchor against the trace), Balloon Boy's
eviction is not fully in the model (rep1), and the actuation latency L is
still a stated 30–110 ms rather than a measured one.
