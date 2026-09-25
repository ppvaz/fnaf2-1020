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

## Kept on purpose

Minus 7 is **not** archived: Pedro means to bring it back as a second
device-bot strategy (2026-09-24). `tools/minus7/`, `tools/model/`,
`tools/cyclesearch.mjs`, `tools/constrainedsearch.mjs`, `tools/flicksweep.mjs`
and `tools/phase-tolerance.mjs` stay, and the engine checks the current model
fails on it are named in `BACKLOG` in [`../tools/test.mjs`](../tools/test.mjs)
as the recovery list.
