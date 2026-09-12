# Second Night 5 6 AM, with a mask window above five seconds — night5-mask5plus, 2026-09-12

The Minus Toys route won Night 5 a second time on ZF525F5BH5, on a new binding
whose one intended change is a mask window longer than the game's five-tick
eviction count. Every number below comes from the generated record
[`night5-second-6am-mask5plus-20260912.json`](night5-second-6am-mask5plus-20260912.json),
which reads the retained run files and carries their hashes. The first win is
[`night5-first-6am-20260912.md`](night5-first-6am-20260912.md); the cost
ledger that covers both is
[`night5-first-6am-cost-20260912.md`](night5-first-6am-cost-20260912.md).

## The run

| | |
|---|---|
| run | `night5-mask5plus-aim172-20260912T220100Z` (campaign `campaign-2026-09-12T22-01-16.359Z`) |
| binding | `minus-toys`, winner `fnv1a-de41e791`, bundle `artifacts/night5-mask5plus/bundle3` |
| knobs vs the first win (`fnv1a-81b5e51c`) | windMs 3230→3030, camdropMs 13850→13650, maskOnMs 4449→4249, maskOffMs 9200→9560, hallOffsetMs 9500→9940 |
| commanded mask interval | 4.751 s → 5.311 s |
| model gate | normal 3000/3000, worst 3000/3000 (at epoch 0) |
| qualification | experimental, operator-selected (`artifacts/night5-mask5plus/qualification-test.json`) — not a `docs/evidence` qualification |
| session | Codex (GPT-5) session of 2026-09-12, resumed from the two Claude sessions' handoffs |

## What was observed

- **6 AM, positively.** `device-campaign-result-v1` attempt 1 is `WIN`, terminal
  `sixam`, `terminalVerification.positive: true`; the lifecycle observer read
  `state=sixam` 419 073 ms after the release. The save advanced
  (`menuReturned`, Continue and 6th Night visible); `campaign-proof-v1`
  `proof: true`. The video grader reads `TERMINAL: clear -- sixam at 450.5s`.
- **The mask window did what it was changed to do.** Of 42 latched-mask
  intervals in the 12 fps video census, 40 last 5.04–5.67 s (median 5.17 s);
  the two below 5 s are the opening window and the 6 AM cut. On the first win
  the same census read 4.50–4.58 s on 29 of 42 windows. Pedro, listening to
  the game audio, witnessed the mask sending Mangle and Balloon Boy away
  repeatedly.
- **The schedule held without help.** 42 cycle gates, all `AGREED`; 0
  corrections, 0 aborts.

## What this run is evidence for — and what it is not

- **Released unanchored, at a drawn epoch, measured post hoc.** The anchor
  planned k = 1 and k = 2 candidates from the helper's latch (aim 172) and
  skipped both: the lifecycle authorization arrived ~2.5 s after the onset,
  past the k = 2 instant. The release then followed authorization
  (`authorization-late`). The frame trace measures the delivered epoch at
  **429 ± 54 ms**, a phase the model scores as a win for this binding.
- **The mask window is a plausible cause, not a proven one.** One win on the
  new binding after one win and seven deaths on the old one is n = 1 against
  n = 8; the model wins Night 5 at every phase except the puppet slices for
  BOTH bindings, so the model cannot say the change mattered. What the trace
  can say is that the device's mask window now exceeds five ticks at every
  phase, where before it did so only in a phase slice.
- **The same run that preceded it measured actuation latency for the first
  time** (`night5-aim940`, below); the numbers make the register's stated
  30–110 ms wrong by 2–5×, and every band argument that used it must be
  recomputed with the measured values.

## The run before it: night5-aim940

`night5-aim940-20260912T213034Z`, binding `fnv1a-81b5e51c`, was the decisive
run the previous sessions asked for (aim 940: puppet death by ~108 s under
Δ = 0, 3000/3000 under Δ = +233).

- The anchor fired at k = 1, `releasedAim` 940.97 ms, 0.97 ms late. The trace
  measures the delivered epoch at **876.7 ± 56.3 ms** — 64 ms short of the
  aim, outside the anchor's own 2.8 ms clock bound. Why the schedule lands
  early against the trace's onset while the anchor believes itself on aim is
  open; the same run's win-side twin (429 measured vs 172 + 2000 planned but
  unanchored) cannot check it.
- It died at ~340 s to Balloon Boy then Withered Foxy, 34/34 gates agreed.
  No puppet death by 108 s, so the literal Δ = 0 prediction failed; with the
  latency below, neither Δ hypothesis is cleanly tested by this run.
- **Actuation latency, measured** (`getevent -lt` kernel timestamps against
  the frame trace, 247 complete contacts, 156 with a visible effect; the
  monotonic clock matched and the boottime clock matched nothing):

  | control | press → effect (median, min–max) | release → effect (median) |
  |---|---|---|
  | monitor-up | 253 ms (102–299) | 55 ms |
  | monitor-down | 595 ms (549–846) | 244 ms |
  | mask-on | 254 ms (103–275) | 55 ms |
  | mask-off | 314 ms (286–374) | 114 ms |
  | hall-lit | 64 ms (23–74) | 28 ms |

  "Effect" is the first trace frame showing the control's visible change, so
  press→effect includes the game's own animation; release→effect is the
  cleaner injection-to-render figure for the toggles.

## Open

1. **Night 6 does not inherit the win.** With these exact knobs the model wins
   Night 6 only at epoch 0 (1 of 20 phases at 50 ms steps; the rest die to
   Foxy or the puppet), and the baseline knobs win it only at 0–300 ms. A
   Night 6 attempt needs a knob set with a wide winning band, or an anchor
   that reliably hits a phase — which tonight's two runs show it does not yet
   (authorization 1.9–2.5 s after onset, k ≤ 2).
2. **Delivered vs aimed epoch disagree by 64 ms on the one run that anchored.**
   Either the trace's onset and the latch's onset differ (they agreed to the
   frame on anchor5), or the schedule's first action lands late.
3. **Latency changes the aim arithmetic.** The register's aim of 172 was
   priced for L in [30, 110]; measured release→effect for the mask is 55/114
   ms and press→effect 254/314 ms. Which edge the game counts is the question
   the eviction budget needs answered.
