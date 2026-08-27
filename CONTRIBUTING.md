# Contributing

Contributions are welcome — bug reports, corrections to the model, strategy
findings, and device measurements especially. This project is mostly an evidence
argument, so the conventions below are about keeping claims traceable rather
than about code style.

If you are looking for what this project owes *other* projects, that is the
separate give-back ledger in [`UPSTREAM-LEDGER.md`](UPSTREAM-LEDGER.md).

## The one hard rule

**No game assets and no decompiled content, ever.** Not sprites, not audio, not
the `.ccn`, not the raw event-sheet dump, not screenshots of the game. This
repository publishes *derived knowledge* — mechanics, numbers, group numbers,
state machines — and stays on the right side of that line deliberately.

Sound cues are synthesised. Captured video and extracted content live in ignored
local directories. If a change would commit game content, it is the wrong change.

*Five Nights at Freddy's 2* is © Scott Cawthon.

## Claims need evidence labels

Constants in `src/config.js` carry a label saying where they came from:

| Label | Meaning |
|---|---|
| `[SOURCED]` | Read from the Android event sheet; cite the group number |
| `[CALIBRATED]` | Measured against the real build on a device |
| `[INFERRED]` | Reasoned, not observed — makes any result a sensitivity analysis |
| `[MODEL]` | Useful community behaviour the Android extraction has not confirmed |

A rule enters the simulator only when it earns one. Before citing a group number,
read [`docs/android/SOURCE-DUMP-GUIDE.md`](docs/android/SOURCE-DUMP-GUIDE.md) —
in particular §4, the XOR-28 handle scramble. Every dump read without that rule
has its Toy and Withered identities swapped, which has already produced one
confidently wrong audit.

New or changed sourced rules belong in the ledger,
[`docs/android/ANDROID-SOURCE-STATUS.md`](docs/android/ANDROID-SOURCE-STATUS.md),
and want a matching assertion in `tools/sourcetest.mjs`. The ledger is enforced,
not decorative: aggregate survival statistics will happily pass with a corrupted
mechanism underneath.

## Checks and reports are different things

- A **check** asserts an outcome and exits nonzero when it fails.
- A **report** prints evidence for a person to interpret and is not a verdict.

Do not present a report as a test. Several tools are reports on purpose; if you
give one an assertion contract, say exactly what it now guards.

```sh
node tools/test.mjs --engine     # about a second — run this on every edit
node tools/test.mjs --browser    # about four minutes, real lesson time
node tools/test.mjs              # everything
```

The browser suite is slow because the trainer never slows its clock, so driving a
lesson to a pass costs that lesson's real duration. That is not going to change.

## Before adding a script

Read [`tools/TOOLS.md`](tools/TOOLS.md) — the canonical inventory — and extend the
closest existing tool instead of adding a parallel one. Reuse `chrome.mjs`,
`pool.mjs`, `screenstate.py`, `coords.sh`, or the `screencheck` pipeline rather
than duplicating browser, worker, device-guard or vision infrastructure. Then add
your tool to that index in the same change, including its side effects and
whether it is safe to run unattended.

## Device tools touch a real phone

Anything marked **device action** sends input to a connected Android device.
Those scripts validate focus, screen state and coordinates, refuse to overwrite a
capture, and abort when the night state is wrong — keep it that way. Coordinates
in `tools/device/coords.sh` are calibrated for one specific handset and layout;
recalibrate rather than assuming.

## There is no prior art below the policy layer

Every external FNaF bot in the [census](docs/research/FNAF-BOT-CENSUS.md) drives
a Windows desktop, where input is synchronous and never dropped. This project is
the only mapped one that actuates a phone, so **the device layer has nothing to
copy from and no baseline to check against.**

Two consequences for anything you write under `tools/device/`:

- **An actuator constraint is a measurement, not a preference.** The 100 ms
  contact floor, the 120 ms camera spacing, and the 180 ms mask→monitor seam
  each came from a night that failed. Do not relax one because a policy would be
  better without it; measure it again on the phone and record what you did.
- **A simulator number is not a device number.** `pilottest`/`hidpilottest`
  count frames, so a press and a `screencap` both look free. Price a policy
  against `tools/device/actuator.mjs` and the model gate before proposing it,
  and say "in the simulator" when quoting a survival figure.

If you find prior art that does actuate a phone, add it to the census — the
negative result is only as good as the search behind it.

## Retractions stay

When a result turns out to be wrong, correct it in place and **keep the original
reasoning** with a dated note explaining what was wrong and why it looked right.
Several documents here are more valuable for their retractions than their
conclusions. Deleting the wrong turn destroys the evidence that the current
answer is better.

## Commits

One logical change per commit, each rollback-safe on its own. Imperative subject
line, 72 characters or fewer. Explain *why* in the body when the diff does not
make it obvious. New behaviour comes with its test in the same commit; a bug fix
comes with the failing test that reproduced it.
