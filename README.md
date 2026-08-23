# Minus 7 Trainer

A touch-first browser trainer for the **Minus 7** strategy in *Five Nights at Freddy's 2*'s
10/20 mode. It is not a clone of the game: it is a drill machine for the input routine, built on a
reimplementation of the mechanics the strategy actually depends on.

**Canonical target:** the modern Android release-7 build (Fusion build 296,
August 2025). PC/community material is supporting research, not the simulator's
fidelity target.

Open it on a phone, turn sideways, and work down the lessons.

**[Play it →](https://ppvaz.github.io/fnaf2-minus7-practice/)**

![lesson brief](docs/brief.png)

## What Minus 7 is

The classic strategy flashes **CAM 10**, **CAM 04** and **CAM 07** every five
seconds to hold seven animatronics on their routes. Foxy, Golden Freddy and
Balloon Boy are handled by hand.

The core loop, on every time ending in **2** or **7**:

> cams down → mask flick → flash the hall → cams up → CAM 10 → CAM 04 → CAM 07 → CAM 11 → wind

> **Android provenance (2026-08-20):** the 400-frame (6.67 s) camera-flash
> stall is **decompile-confirmed on the owned release-7 binary** — the flash
> groups load it from a `stun time` counter that nothing ever rewrites. A
> same-week audit briefly declared it disabled; that reading came from the
> runtime's XOR-scrambled object-handle table, now corrected in the tooling
> (a discovery that affects every Clickteam Android decompile). The corrected
> source model passes the shipped schedule 200/200; see
> [`ANDROID-CAMERA-STALL.md`](ANDROID-CAMERA-STALL.md).

Ten inputs in about 1.5 seconds, then three and a half seconds of winding. Full mechanical detail,
with sources, is in [MINUS-7-STRATEGY.md](MINUS-7-STRATEGY.md).

Strategy by **Niko Frost** (13 December 2023). This repo is a practice tool, not the strategy.

## Why a trainer

Minus 7 has no unwinnable RNG — every loss is a mechanical mistake. That makes it exactly the kind
of skill a drill machine can teach, and exactly the kind that is miserable to learn inside a
7-minute run where one slip ends the night.

## The lessons

Ten steps, each adding one thing and hiding every control it doesn't need:

| # | Lesson | Adds |
|---|---|---|
| 1 | The beat | tapping on `:X2` / `:X7`, nothing else on screen |
| 2 | The sweep | CAM 10 / 04 / 07 with the camera light |
| 3 | Sweep, then wind | CAM 11 and the hold-drag to WIND |
| 4 | Down and back | the office half: cams down, mask, hall flash, up |
| 5 | The whole cycle | both halves, nothing lethal |
| 6 | The cycle, for real | Foxy and Golden Freddy live |
| 7 | Hearing Balloon Boy | cams down across every 5s interval |
| 8 | The duel | the ~0.7s reaction window after his leaving bang |
| 9 | Full night | 7:00, real RNG |
| 10 | Worst luck | every roll pinned to the worst case |

Each needs N clean passes in a row to unlock the next. A rhythm lane shows the upcoming inputs
scrolling toward a hit line with their tolerance windows, the control you should touch next gets a
ring, and every input is graded in milliseconds.

Every screen is a night-shift console: phosphor amber on warm black, and anything you are timed on
— clock, offsets, stun bars, the lane — set in mono with tabular figures, so a digit never shifts
under your eye. Each control keeps one colour everywhere it appears: the chip on the lesson brief,
the glyph on the rhythm lane and the button under your thumb all agree. `How it works` is the whole
strategy on one board — the ten-input pass, why the 6.66 s stun never lapses, the three rooms, and
what has to be handled by hand.

The two faces, **Chakra Petch** and **IBM Plex Mono**, ship with the repo as latin-subset woff2 in
`assets/fonts/` (both SIL OFL), so the trainer looks right on a phone with no internet.

**Timing is never slowed down.** The whole skill is absolute timing, so practising at 0.8× would
build the wrong reflexes. Lessons get easier by removing controls and threats, never by distorting
the clock — only the grading tolerance is loosened early on.

## Calibration

Button placement is the point of a touch trainer, so every control — all 12 cameras, both lights,
mask, monitor, vents and wind — can be dragged to move and resized by its corner handle.

`Settings → Calibrate layout` opens an inert session with the simulation stopped and game input
disabled, so dragging a control never doubles as pressing it. Overlapping controls are flagged red,
because overlapping touch targets silently swallow inputs.

`Settings → Save this layout as the code default` posts the layout to the dev server, which writes
it into `src/config.js` and rebuilds. Anywhere else, it hands you the JSON.

The shipped camera map is traced from a screenshot of the real in-game map and sized to that
image's aspect ratio, so the thumb path between 11 / 10 / 04 / 07 matches the game.

## Sound

Cues are synthesised — no audio files ship with this repo. Each control has its own pitch, so a
correct cycle has a recognisable tune and a wrong one is audibly wrong. There is an optional
metronome on the `:X2` / `:X7` anchors and haptic feedback on every input.

If you own FNaF 2 you can load sounds from your own copy into `Settings → Your own sounds`. They are
stored in IndexedDB on your device, are never uploaded, and are not part of the page. **No game
assets are distributed here.**

## Running it

The published copy is at **<https://ppvaz.github.io/fnaf2-minus7-practice/>** — served straight from
`master`, because the source runs as ES modules with nothing to build. Being https it is a secure
context, so wake lock and vibration work there; the LAN URL below is plain http and they do not.

No dependencies, no build step for development:

```sh
python3 tools/serve.py 8731      # serves the repo, and accepts saved layouts
```

Then open `http://<your-ip>:8731/index.html` on your phone, on the same network. The source runs
directly as ES modules — there is nothing to build for development.

For a single self-contained file (one HTML with every module, the CSS and the fonts inlined,
nothing external):

```sh
python3 tools/build.py           # -> dist/index.html
```

`dist/` is not committed. The bundler derives module order from the imports, so adding a file needs
no list to be updated.

Note that a plain-`http` LAN URL is not a secure context, so wake lock and vibration are disabled.

A run insists on full screen: browser chrome appearing or disappearing resizes the viewport, and
every control is placed as a percentage of it, so the buttons you calibrated would move under your
thumbs mid-run. If the request is refused or you leave full screen, a bar says so and the next touch
on the stage asks again.

## Tests

All headless, all dependency-free — the browser ones drive Chrome over the DevTools Protocol
(Node 22's built-in WebSocket), no Puppeteer.

Before adding a new script, check the canonical [tool index](tools/TOOLS.md).
It covers every maintained developer, simulator, browser, device, and
source-dump tool, including which commands assert and which only report.

```sh
node tools/test.mjs              # the whole suite
node tools/test.mjs --engine     # engine checks only — about a second
node tools/test.mjs --browser    # Chrome checks only — about four minutes
node tools/test.mjs --reports    # also print the diagnostic tools
```

The engine checks are the ones to run on every edit. The browser checks are slow
for a reason that will not go away: the trainer never slows the clock, so driving
a lesson to a pass costs that lesson's real duration. Engine checks run concurrently,
so that group costs its slowest member rather than the sum. Browser checks run
serially by default so CPU contention cannot corrupt timing grades; `--parallel`
opts into a faster but less isolated run.

Chrome is found at the macOS bundle path or on `PATH`; `$CHROME` overrides. The
runner builds `dist/` and starts `tools/serve.py` itself unless one is already
answering on 8731.

Two common focused runs are:

```sh
node tools/simtest.mjs --sweep   # a perfect cycle vs. 200 seeds
node tools/bbtest.mjs 200        # ...including Balloon Boy; --worst for worst-luck
                                 # --assert to fail rather than just print
node tools/bbtest.mjs 60 --jitter=200   # how much lateness is survivable
```

The [tool index](tools/TOOLS.md) is the complete command catalog, including the
search, browser, Android-device, visual-classification, and source-dump tools.
The three strategy-search tools share `tools/pool.mjs`; `--serial` pins them to
one worker, which must produce identical output.

What they establish:

- A correctly played cycle clears **200/200 seeds**, and **100/100 on worst luck**, with zero stun
  lapses — matching the community's claim that Minus 7 has no unwinnable RNG.
- The difficulty curve is real: survivable up to ~120 ms late, ~35% at 200 ms, dead past 300 ms.

## Accuracy

The canonical mechanics source is the owned modern-Android event-sheet extraction.
[Reading the source dump](SOURCE-DUMP-GUIDE.md) explains what that extraction is,
how it is organised, the XOR-28 handle scramble that makes it readable, and the
`tools/dump/` commands used to source a rule from it — read it before citing a
group number. Community PC reverse engineering is retained as attributed supporting research, not
silently merged into Android rules. Constants are marked `[SOURCED]`, `[CALIBRATED]`,
or `[INFERRED]` in `src/config.js`; the live implementation gaps are tracked in
[Android source status](ANDROID-SOURCE-STATUS.md). The
[office endgame audit](ANDROID-OFFICE-ENDGAME.md) pins the exported camera/mask
states and the 45-frame defense / 300-frame resolution chain. The
[PC confirmation ledger](PC-DECOMP-CHECKLIST.md) is deferred and non-blocking.
Post-chokepoint routing remains an approximation: it only runs once you have already
broken the stun loop.

The forensic comparison with Shooter25's embedded PC practice bot—and why
Minus 7 stays time-driven while reactive policies need vision or direct game
state—is in [Shooter25 practice mod](SHOOTER25-PRACTICE-MOD.md). Its extracted
controller registers, actuator mapping, and state transitions are in the
[Shooter25 bot state machine](SHOOTER25-BOT-STATE-MACHINE.md). The staged
Android instrumentation proposal is in those notes and
[Trainer-in-game](TRAINER-IN-GAME.md).

## Licence

MIT, for this code. The bundled fonts are under the SIL Open Font License 1.1 — see
`assets/fonts/`. *Five Nights at Freddy's 2* is © Scott Cawthon; no game assets are included.
