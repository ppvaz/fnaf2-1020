# Research sandbox

Short-lived probes and deliberately incompatible hypotheses may live here.
Nothing under a shared package, runtime, trainer, or device composition root
may import this directory. Promotion requires an owner, stable I/O contract,
fixed seeds or retained observations, machine-readable results, and the
appropriate evidence label.

## Pending promotion: HUD-signature down/mask/up rule (2026-09-01, parked)

`hud-signature-probe.py` (self-test green) fitted the HUD-chrome hypothesis on
`captures/n1-minustoys-calib-01-aborted.mp4`; retained report:
`hud-signature-n1-minustoys-calib-01.json`. One night-1 story run, 90/90
corpus reads: mask uniquely zeroes the clock cell 1 (180,60), right-button
cell 174 (1740,1020) and chrome cell 172 (1500,1020) — margins 172–221;
bottom chrome cell 167 (900,1020) reads identically in down and mask
(175–182) and only dies when the monitor is up; grid luma down 27 / mask
4–6 / up 32–48; anim refuses 32/40, 8 firm votes unaudited. No evidence ID —
sandbox probes do not mint one; the report file is the observation.

Not promotable as measured: the recording is an upscaled 1280x576 transcode
(a different sensor than the helper's native 2400x1080 grid), labels come
from grade-minus7, and the reads are in-sample. Open before any Plan 12
promotion:

1. Native re-fit of signature B ({down,up}|{mask}) on the 42-frame labelled
   corpus — frames live on Pedro's other machine. Copy them here as
   `down=… up=… mask=…` sources and extend `tools/device/monitor-calibrate.py`
   for the second signature; zero device cost.
2. Blackout frames — the mask-vs-blackout discriminator (left button present
   + luma band) has never seen a blackout; `blackout-unproven` stands.
3. Pressed-button and full-night frames (battery drain, clock hour changes).
4. Anim-vote audit against HID press timing (desync-scan alignment).
5. Held-out evaluation, then the schema decision: `monitor-rule-v2` with
   per-signature anchor sets vs a separate `maskOn` fact (core owns the fact
   vocabulary; Plan 12 owns promotion).

Re-run the probe: `python3 research/sandbox/hud-signature-probe.py
captures/<run>.mp4 --out <report>.json`; logic only:
`--self-test`.
