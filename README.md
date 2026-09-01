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
