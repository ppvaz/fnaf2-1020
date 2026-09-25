# Archived routes and removed tools

Code that left the tree because nothing ran it, and the one place that says
where it went. Everything below is still in git: the tag
**`archive/2026-09-24`** points at `069495f`, the last commit that carries all
of it. Restore any path with

```sh
git checkout archive/2026-09-24 -- <path>
```

The findings these routes produced stay where they were written — the linked
pages are evidence and understanding, and archiving the code does not retract
them. A route listed here is **parked, not refuted**, unless its row says so.

## Archived routes (2026-09-24)

| Route | Paths | Last commit before archive | Where its results live |
|---|---|---|---|
| In-engine recompile (Plan 17, route 5): owned CCN → Chowdren → arm64 research APK | `tools/recompile/` (build-296 `mmfparser` patch, Chowdren config, two probes, Android CMake draft) | 2026-08-28 | [`in-engine/IN-ENGINE-PILOT-RECOMPILE.md`](in-engine/IN-ENGINE-PILOT-RECOMPILE.md), Plan 17 |
| ESP32 audio bridge: A2DP sink on an ESP32-WROOM-32 forwarding PCM to the APK over Wi-Fi | `firmware/esp32-audio-consumer/`, `tools/cue/esp32-audio-authority.py`, `tools/cue/test-esp32-audio-authority.py`, `tools/cue/pack-esp32-cues.py` | 2026-08-31 | [`device/ANDROID-AUDIO-CAPTURE.md`](device/ANDROID-AUDIO-CAPTURE.md), [`device/AUDIO-WITNESS-MAP.md`](device/AUDIO-WITNESS-MAP.md), Plan 08 |
| Custom Night invention engine (Plans 05 and 21): rule-list policy language, genetic search, ablation and anatomy reports | `tools/invent/` | 2026-09-02 | Plan 05, Plan 21, [`../plans/PROGRESS.md`](../plans/PROGRESS.md) |
| HUD-signature down/mask/up probe (parked 2026-09-01) | `research/sandbox/hud-signature-probe.py`, `research/sandbox/hud-signature-n1-minustoys-calib-01.json` | 2026-09-01 | [`../research/sandbox/README.md`](../research/sandbox/README.md) |

The ESP32 route superseded: rendered audio now reaches the host over A2DP
directly (`tools/cue/bt-audio-link.sh`, `tools/cue/bt-audio-collector.py`).
The Cue Helper APK still carries its ESP32 receiver path and the `pcm-udp-v1`
wire contract; neither was removed with the firmware.

## Removed tools (2026-09-24)

Search and report scripts with no caller, no test and no npm script. Their
searches were already closed.

| Tool | What it did | Closed by |
|---|---|---|
| `tools/gatesearch.mjs`, `tools/gatebot.mjs` | Gate-aware visible-state policy search | Plan 06, no survivor — [`strategy/GATE-SEARCH.md`](strategy/GATE-SEARCH.md) |
| `tools/strategysearch.mjs` | Fixed camera-cover strategy enumeration | [`strategy/CAM-6-7-STRATEGY.md`](strategy/CAM-6-7-STRATEGY.md) |
| `tools/knobsweep.mjs` | `NightPolicy` knob factorial over a held-out cohort | Plan 20; `tools/nightloop.mjs` remains |

## Closed device probes (2026-09-24, second pass)

Nineteen tools and their eight no-device tests, chosen by a reference graph
over every tracked file plus three weeks of agent command history: nothing
that runs calls them, none ran after 2026-09-15, and each one's question is
closed, with the answer already held by a constant, a gate or a page. The same
tag carries them unchanged (`git checkout archive/2026-09-24 -- <path>`).

| Tools | What they measured | Where the answer lives now |
|---|---|---|
| `hid-maskraise-probe.mjs`, `hid-monitorraise-probe.mjs`, `hid-raise-probe.mjs`, `hid-transition-probe.mjs`, `hid-sweep-probe.sh`, `maskraise-grade.py`, `monitorraise-watch.py`, `calibration-stability.py`, `frame-clock.py` | Mask/monitor seam windows, camera sweep spacing, animation transitions | [`device/HID-MULTITOUCH.md`](device/HID-MULTITOUCH.md) ("the phone accepts 120 ms spacing"); the floors in `tools/device/artifact-commands.mjs` and `actuator.mjs`'s `SEAM_BANDS`, held by `test-seam-slack.mjs` |
| `pan-probe.sh`, `pan-path-capture.py`, `pan-path-capture.sh`, `region-probe.sh`, `region-classify.py` | Office pan and what a touch does per screen region | `pan-shift.py` stays as the measuring stick; the scroll is read from the dump |
| `grid-signature.py` | Frame signatures for a live check | Superseded by the fitted `*-calibrate.py` rules (`monitor-rule-v1`, `camera-rule-v1`) the executor reads |
| `night5-modal-observer.mjs` | Dual-modality sampling on Night 5 | [`evidence/night5-monitor-raise-loss-20260909.json`](evidence/night5-monitor-raise-loss-20260909.json); Night 5 is won |
| `watch-vent-cue.sh` | Balloon Boy at the vent, by the helper's audio | The A2DP capture and `tickphase.py` ([`device/AUDIO-WITNESS-MAP.md`](device/AUDIO-WITNESS-MAP.md)) |
| `touch-contamination-guard.sh` | Physical touches during a run | Never wired into `night-run.sh`; a guard nothing calls guards nothing |
| `seed-clock.mjs` | Host/phone wall-clock samples for seed recovery | Superseded by `seedpin/` and `office-seed-bracket.py`; [`device/RNG-SEED-RECOVERY.md`](device/RNG-SEED-RECOVERY.md) |

`hid-sweep-probe.mjs` stays: despite its name it is the `COORDS`/`toRaw`
library the live intersection gate and `test-screen-map.mjs` import.
`gate-worker.mjs` and `minus-toys-jitter.mjs` stay too — the `night matrix`
and `vent reactive` checks load them.

## Kept on purpose

Minus 7 is **not** archived: Pedro means to bring it back as a second
device-bot strategy (2026-09-24). `tools/minus7/`, `tools/model/`,
`tools/cyclesearch.mjs`, `tools/constrainedsearch.mjs`, `tools/flicksweep.mjs`
and `tools/phase-tolerance.mjs` stay, and the engine checks the current model
fails on it are named in `BACKLOG` in [`../tools/test.mjs`](../tools/test.mjs)
as the recovery list.
