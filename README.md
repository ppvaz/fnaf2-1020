# fnaf2-1020

An evidence-driven study of the modern Android *Five Nights at Freddy's 2*
target: `com.scottgames.fnaf2` v2.0.7, release-7 / Fusion build 296. Its vision
is a faithful, inspectable understanding of 10/20; its mission is to understand,
derive, embody, and prove control without turning a model result into a device
claim.

The canonical target is Android. PC equivalence, device-general calibration, and
a live controller result above its evidence rung are not claimed. Game assets
and decompiled content are never distributed.

## Where this stands — 2026-09-17

Every story night and Custom Night 10/20 have reached 6 AM on the phone. The
handset is a Moto g56 `ZF525F5BH5` running `com.scottgames.fnaf2:2.0.7+26` under
profile `hid-mediaprojection`.

| Night | First 6 AM | Record |
|---|---|---|
| 1–2 | 2026-09-07 | [`victory-night1`](docs/evidence/victory-night1-20260907.json), [`victory-night2`](docs/evidence/victory-night2-20260907.json) |
| 3–4 | 2026-09-08 | [`victory-night3`](docs/evidence/victory-night3-20260908.json), [`victory-night4`](docs/evidence/victory-night4-20260908.json) |
| 5 | 2026-09-12 | [`night5-first-6am`](docs/evidence/night5-first-6am-20260912.md) — four Night 5 clears are recorded |
| 6 | 2026-09-13 | [`night6-first-6am-anchoredh`](docs/evidence/night6-first-6am-anchoredh-20260913.md) — Custom Night unlocked |
| 7 (**10/20**) | 2026-09-14 | [`night7-first-6am-k2`](docs/evidence/night7-first-6am-k2-20260914.json) — `golden-freddy`, all ten dials 20 |

Read those numbers precisely. Each run is retained at `DEVICE_MEASURED` for its
own terminal, and **no Plan 12 promotion edge has been recorded for any of
them**, so nothing above is a promoted claim. Night 7's reliability is one
predeclared ten-run cohort: [**3 wins, 7 deaths**](docs/evidence/night7-cohort-k2-result-20260914.json).
A single clear and a reliability claim are different claims, and
[Plan 12](plans/12-end-to-end-evidence-campaign.md) owns the ladder between them.

**What is open.** The bottleneck is model fidelity, not execution. The model had
been killing every censused seed on nights the phone won; on 2026-09-17 that was
traced to an instrument error rather than a rule — the reconstruction compared
the host's wall clock against the phone's, 1374.8 ms apart, and placed the whole
schedule 1.37 s late. Corrected to one clock, the same route reaches 6 AM on all
65,536 seeds. That record explicitly does *not* claim the model now predicts the
phone ([`night6-model-gap-two-clocks`](docs/evidence/night6-model-gap-two-clocks-20260917.json)).
Still load-bearing: the census assumes a constant 16.667 ms frame, and the next
physical test is one binding re-run with `--frame-trace` so the phone's own frame
deltas replace that constant.

Current state is maintained in [`plans/PROGRESS.md`](plans/PROGRESS.md); the
rung-by-rung reading of what "solved" would even mean is in
[`docs/research/SOLVING-FNAF2.md`](docs/research/SOLVING-FNAF2.md).

## Bootstrap

From a clean checkout:

```sh
npm ci
npm test
npm run build:trainer
npm run serve:trainer
npm run research -- --help
npm run device:dry-run -- --profile fixture-hid-screencap
```

Everything after `npm ci` is safe without a phone or proprietary assets. The
fixture device run resolves a versioned profile, uses semantic commands, emits
telemetry, and retains a replayable result under ignored `artifacts/`.

Focused lanes include `npm run test:core`, `npm run test:contracts`,
`npm run typecheck` (strict TypeScript plus checked JavaScript sources),
`npm run test:affected`, `npm run policy -- --json`, `npm run evidence -- list`,
and `npm run test:device:dry`. Live execution is a separate, explicit lane and
requires `--live --confirm-live`; the local executor owns release, abort, leases,
deadlines, and capability checks.

## Choose a route

- **Player:** open the [Minus 7 trainer](https://ppvaz.github.io/fnaf2-1020/) or
  read [the strategy](docs/strategy/MINUS-7-STRATEGY.md).
- **Researcher:** start with [what solving this game would mean](docs/research/SOLVING-FNAF2.md),
  then the [research architecture](docs/research/ARCHITECTURE.md) and the
  retained known negatives.
- **Model developer:** read the [Android source status](docs/android/ANDROID-SOURCE-STATUS.md)
  and [`@fnaf2-1020/core`](packages/core/README.md).
- **Device developer:** read the [device architecture](docs/architecture/README.md),
  the [profile contract](docs/operations/DEVICE-SAFETY.md), and
  [HID-MULTITOUCH.md](docs/device/HID-MULTITOUCH.md) before claiming anything
  about a run's configuration or its failure. Run dry fixtures first.
- **Reviewer:** inspect the [contract register](docs/architecture/generated/contract-register.json),
  the [evidence policy](docs/evidence/README.md), and
  [Plan 12's gates](plans/12-end-to-end-evidence-campaign.md).

## How the repository is shaped

Five layers, one program:

```text
Truth          Android source evidence and labelled mechanics
Understanding  trainer and human-readable model
Decision       policies, controllers, and research
Embodiment     stock-device and future in-APK adapters
Proof          replay, telemetry, grading, and Plan 12 promotion gates
```

Ownership is directional:

```text
                    @fnaf2-1020/core
              /            |            \
          trainer       research       device
                                          -> runtime -> adapters
```

The canonical package is [`@fnaf2-1020/core`](packages/core/README.md). It owns
mechanics and semantic contracts; the [trainer](apps/trainer/README.md),
[research package](packages/research/README.md), and [device app](apps/device/README.md)
are consumers. The browser entry and presentation modules live behind the
trainer application boundary, and the root `src/` compatibility surface has been
removed after import equivalence.

Current products are the touch trainer, the exact sourced simulator, the
policy/search lab, and the guarded device foundation. A result is labelled
`MODEL_ONLY`, `FIXTURE`, or `DEVICE_MEASURED`; labels do not promote one another.

## More

- [Documentation index](docs/README.md) — every page, routed by question.
- [Project charter](PROJECT-CHARTER.md) — scope, claim discipline, admission rule.
- [Glossary](docs/GLOSSARY.md) — the names to use, shared with
  [`vocabulary.js`](packages/core/src/control/vocabulary.js).
- [Plans](plans/README.md) and the [roadmap](plans/ROADMAP.md).
- [Architecture decision records](docs/decisions/0001-workspaces-and-core.md).
- [Contributing](CONTRIBUTING.md).

The old front-door narrative is retained in
[`docs/research/ROOT-README-HISTORY.txt`](docs/research/ROOT-README-HISTORY.txt)
for historical context.
