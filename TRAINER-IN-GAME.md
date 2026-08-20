# Trainer-in-game: feasibility note

*Analysis note, 2026-08-19 — written down verbatim from the discussion after the
FNaF 2 Android decompile opened. Context: could the Minus 7 trainer's features
be embedded in the game itself via the decompiled MFA?*

In theory yes — but as a **reimplementation**, not a transplant. Two important
clarifications:

## What "trainer inside the game" would actually mean

The trainer is a JavaScript web app; Clickteam Fusion games don't run JS. So
you wouldn't embed the trainer itself — you'd re-implement its features as new
event groups inside the decompiled MFA (`FNaF2_mobile_20250827.mfa`, which we
now have in full). That's very doable in principle, because everything the
trainer grades against is directly readable from inside the game: the
`Multiple Touch` counter is the current camera, the `* AI` counters hold
animatronic aggression, each animatronic's state machine lives in its Active
object's alterable values (state in value 0, the 10-tick countdown in value 2),
and the 5-second movement checks are plain `Every 5000ms` groups. You could add
event groups that read those and drive on-screen text/counter objects: live AI
display, state warnings, input-timing grades against the Minus 7 cycle, even a
"you deviated here" log. That's strictly more powerful than the AI/state
overlay we discussed — the overlay is the minimal version of exactly this idea.

## The practical hurdles

1. **Rebuild fidelity.** Decompiled MFAs don't roundtrip perfectly. Our export
   needed placeholder names for extension objects whose metadata is absent from
   the mobile build (the `UnknownExt` null-guard), and the mobile port uses
   extensions (KYSO, In-App Android, iOS objects, Multiple Touch) whose `.mfx`
   files may not exist for the PC editor — Fusion will complain on open, and
   those objects would need stubbing or replacing. Expect repair work before it
   even builds.
2. **Toolchain cost.** Opening/editing needs Clickteam Fusion 2.5 (paid,
   Windows — Wine is plausible); rebuilding for *Android* specifically needs
   the Android exporter DLC on top. A PC rebuild is much easier, but then
   you're validating on a rebuilt PC-ish version rather than the Android build
   you actually play — which partially defeats the "ground truth for the
   version Pedro plays" principle.
3. **Behavioral fidelity risk.** Any mod that adds event groups technically
   perturbs the game (group ordering matters in Clickteam). Display-only
   additions reading counters are low-risk, but it's another reason the
   readout-only overlay is safer than porting full trainer logic in.

## Where it fits

For validation purposes, the sweet spot is probably the modest version — the
state/AI overlay plus maybe an input-timestamp logger — used together with the
adb-driven bot. Full trainer-in-game is a fun endgame project, but it's the
most expensive path to information we can mostly get cheaper. And as always:
personal use on your own copy only, never distributed.
