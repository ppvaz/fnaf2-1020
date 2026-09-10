# fnaf2-1020

An evidence-driven study of the modern Android *Five Nights at Freddy’s 2*
target: `com.scottgames.fnaf2` v2.0.7, release-7 / Fusion build 296. Its
vision is a faithful, inspectable understanding of 10/20; its mission is to
understand, derive, embody, and prove control without turning a model result
into a device claim.

The canonical target is Android. PC equivalence, device-general calibration,
and a live controller result above its evidence rung are not claimed. Game
assets and decompiled content are never distributed.

```text
Truth       Android source evidence and labelled mechanics
Understanding  trainer and human-readable model
Decision    policies, controllers, and research
Embodiment  stock-device and future in-APK adapters
Proof       replay, telemetry, grading, and Plan 12 promotion gates

                    @fnaf2-1020/core
              /          |          \
          trainer      research      device
                                -> runtime -> adapters
```

The canonical package is [`@fnaf2-1020/core`](packages/core/README.md). It
owns mechanics and semantic contracts; the [trainer](apps/trainer/README.md),
[research package](packages/research/README.md), and
[device app](apps/device/README.md) are consumers. The browser entry and
presentation modules now live behind the trainer application boundary, and the
root `src/` compatibility surface has been removed after import equivalence.

## Bootstrap and five safe commands

From a clean checkout:

```sh
npm ci
npm test
npm run build:trainer
npm run serve:trainer
npm run research -- --help
npm run device:dry-run -- --profile fixture-hid-screencap
```

The last five commands are safe without a phone or proprietary assets. The
fixture device run resolves a versioned profile, uses semantic commands, emits
telemetry, and retains a replayable result under ignored `artifacts/`.

Focused lanes include `npm run test:core`, `npm run test:contracts`,
`npm run typecheck` (strict TypeScript plus checked JavaScript sources),
`npm run test:affected`, `npm run policy -- --json`, `npm run evidence -- list`,
and `npm run test:device:dry`. Live execution is a separate, explicit lane and
requires `--live --confirm-live`; the local executor owns release, abort,
leases, deadlines, and capability checks.

## Choose a route

- **Player:** open the [Minus 7 trainer](https://ppvaz.github.io/fnaf2-1020/)
  or read [the strategy](docs/strategy/MINUS-7-STRATEGY.md).
- **Researcher:** start with the [research architecture](docs/research/ARCHITECTURE.md),
  experiment results, and retained known negatives.
- **Model developer:** read the [Android source status](docs/android/ANDROID-SOURCE-STATUS.md)
  and [`@fnaf2-1020/core`](packages/core/README.md).
- **Device developer:** read the [device architecture](docs/architecture/README.md),
  [profile contract](docs/operations/DEVICE-SAFETY.md), and run dry fixtures first.
- **Reviewer:** inspect the [contract register](docs/architecture/generated/contract-register.json),
  [evidence policy](docs/evidence/README.md), and [Plan 12 gates](plans/12-end-to-end-evidence-campaign.md).

Current products are the touch trainer, exact sourced simulator, policy/search
lab, and guarded device foundation. A result is labelled `MODEL_ONLY`,
`FIXTURE`, or `DEVICE_MEASURED`; labels do not promote one another.

More detail is routed through the [documentation index](docs/README.md),
[architecture decision records](docs/decisions/0001-workspaces-and-core.md),
and [plans](plans/README.md). The old front-door narrative is retained in
[`docs/research/ROOT-README-HISTORY.txt`](docs/research/ROOT-README-HISTORY.txt)
for historical context.

## Glossary

These are the names a new reader should use. The same vocabulary is exported
from [`packages/core/src/control/vocabulary.js`](packages/core/src/control/vocabulary.js)
so prose, policies, artifacts, and device profiles can share one meaning.

| Term | Meaning |
|---|---|
| **Android target** | `com.scottgames.fnaf2` v2.0.7, release-7 / Fusion build 296; the only device target this project claims. |
| **actuator** | The component that sends a semantic control to the game. It may be simulated, fixture-backed, ADB-based, or HID-based; it does not prove that the game accepted the input. |
| **camera feed** | The selected camera view shown after raising the monitor. |
| **camera selection** | A semantic `cam:N` control, such as `cam:9`; it changes the selected feed and is distinct from flashing that feed. |
| **cameraFeedLight** | The physical camera-feed flash control. On the current Moto g56 profile it is `{900,540}`, the calibrated cam-flash/hall-flash intersection position. |
| **hallLight** | The physical standalone office/hall beam control. On the current profile it is `{1200,540}` and is intentionally distinct from `cameraFeedLight`. |
| **leftVentLight / rightVentLight** | The actual office vent-light controls, not camera flashing. The left control is `{350,615}` and the right control is `{2050,615}` on the current profile. |
| **wind** | The music-box winding control. The short name is retained because it is the game’s established action; it never means a flashlight or vent light. |
| **mask** | The Freddy mask transition control. |
| **monitor** | The camera-monitor raise/lower transition control. |
| **model `light`** | A simulator-only, source-faithful context-dependent action: camera flash while the monitor is up, hall flash while it is down. It must not be used as a modern physical profile name. |
| **artifact** | A content-addressed, validated semantic handoff for one or more device-night plans. It contains no strategy reconstruction or raw coordinates. |
| **device profile** | The versioned physical binding from canonical semantic controls to screen points, plus actuator/sensor calibrations. |
| **bundle** | The host-built package containing the selected winner, plans, resolved profile, manifest, replay data, and compiled artifact. |
| **plan** | A finite timed schedule before compilation; it names semantic controls and timing, not HID reports or screen coordinates. |
| **winner** | A model-gated policy record whose strategy, knobs, engine hash, seed set, and claim level are bound together. |
| **seed** | The deterministic RNG input for one simulator replay. A seed result is model evidence, not a device result. |
| **qualification** | Evidence authorizing a particular actuator/profile/policy boundary for a stated claim level; changing physical control bindings requires a new qualification or rebind. |
| **claim level** | `MODEL_ONLY`, `FIXTURE`, or `DEVICE_MEASURED`; higher levels require their own evidence and do not inherit from lower levels. |
| **device-measured** | A claim supported by a real stock-device observation under the named profile and calibration, not merely by a successful model replay. |
| **desync** | The controller’s believed monitor/mask state no longer matches the game’s observed state; open-loop parity must not be treated as truth after this point. |
| **arm verification** | The opening check that confirms the required camera highlights/viewing state before the timed night loop is allowed to continue. |
| **Mangle marker 122 / opening** | The sourced intermediate Mangle state at the office entrance. A monitor raise after she reaches it can move her inside; it is not the same as an already committed attack. |
| **rung** | The Plan 12 evidence level a run advances. A complete model gate or host-side refactor is not a 6 AM device success. |
| **consequential artifact** | For this project, a graded on-device run bundle, real device evidence, a promotion, or trainer code. Plans, docs, and host-only gates are bookkeeping until paired with that evidence. |

The old spellings `light`, `hall`, `ventL`, `ventR`, and `ventl` may still
appear in simulator or historical compatibility code. They are not synonyms in
the modern device vocabulary: in particular, `ventl` must never silently mean
the physical `leftVentLight`, and the simulator’s `light` must never silently
choose between `cameraFeedLight` and `hallLight` at the profile boundary.
