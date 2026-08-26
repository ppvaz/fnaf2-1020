# Public FNaF gameplay-bot census

*Research snapshot: 2026-08-26. This is a best-effort census of publicly
discoverable projects and artifacts, not a proof that no private, deleted, or
poorly indexed bot exists.*

## What was counted

The target is software that chooses or carries out play in an official FNaF
game, a faithful reconstruction, or a closely related FNaF game mode. Search
results were verified against their source rather than classified from the
repository name or README alone. The census separates:

1. **External stock-game bots** — observe the unmodified game and send ordinary
   mouse, keyboard, or touch input.
2. **Modified/in-engine bots** — read or alter the game's internal state, or run
   inside a recreation with direct state access.
3. **Simulation and RL projects** — learn or search in a modeled environment;
   these only count as stock-game players when a real-game bridge also exists.
4. **TAS, chat control, and narrow solvers** — automation, but not an autonomous
   full-night player.
5. **Public demonstrations** — a result can be publicly viewable without its
   implementation being publicly downloadable.

Discord character bots, ordinary fangame enemy AI, save editors, timers, and
keyboard-to-mouse remappers without a decision policy are excluded. “Works”
below means that the published source is coherent or its author demonstrates a
run; it does not mean this survey independently ran a commercial game against
every project.

## Coverage at a glance

| Game/scope | What is publicly available | Strongest verified result |
|---|---|---|
| FNaF 1 | Many external scripts; one live-game PPO project; several simulators | Small external bots demonstrate or claim full progression/4/20; no public RL clear was verified |
| FNaF 2 | Five external source projects, one recreation bot, two modified-game implementations, video-only bots | `jasonclone/fnaf2bot` is the strongest source-available stock-game bot; Shooter25 is the strongest documented in-engine precedent |
| FNaF 3 | One incomplete external branch, Twitch controllers, REKA video | No complete source-available autonomous stock-game player verified |
| FNaF 4 | Early simulator scaffold; REKA video | No source-available full-game autonomous player verified |
| Sister Location | REKA videos | Public demonstration, no source or download located |
| FNaF World | Injected TAS source | A substantial source-available TAS, not an adaptive agent |
| Freddy Fazbear's Pizzeria Simulator | Twitch controller and one minigame solver | No autonomous full-night player verified |
| Ultimate Custom Night | Modified-game patches/executables and videos; empty/broken GitHub projects | Strong public demonstrations, but no working open-source stock-game bot verified |
| Help Wanted through Secret of the Mimic | Mods and unrelated search hits | No credible autonomous player bot verified |
| Fangames/multiplayer | A GMod FNaF mode has player bots | Adjacent result, not a canonical night-game agent |

## FNaF 1: external stock-game bots

| Project | Method | Assessment |
|---|---|---|
| [`The2AndOnly/fnaf-python-bot`](https://github.com/The2AndOnly/fnaf-python-bot) | Python, PyAutoGUI/Pillow, window-relative coordinates, a few pixel tests, menu-star detection | The most complete small external implementation found. It starts or resumes progression, retries deaths, switches to 4/20, and stops at three stars. The author provides a [demonstration](https://www.youtube.com/watch?v=BaX71RpF7rI). A source file declares CC0. |
| [`kevvit/fnafbot`](https://github.com/kevvit/fnafbot) | Fixed 1280×720 PyAutoGUI loop with template matching for Bonnie, Chica, and Foxy | A compact scripted 4/20 bot with a [demo](https://www.youtube.com/watch?v=4cMgEk1Vz5I). It retries from the menu but does not terminate after a win. |
| [`kalebwbishop/FNAF_Bot`](https://github.com/kalebwbishop/FNAF_Bot) | Window-relative input, pixel checks, and a TensorFlow three-class CAM 4B classifier | More ambitious perception than most scripts, but broken as packaged: the program loads `foxy_detector.h5` while the repository supplies `freddy_detector.h5`, and a used window package is absent from requirements. The README only claims attempts at 4/20. |
| [`Screw13/fnaf-bot-2024`](https://github.com/Screw13/fnaf-bot-2024) | PyAutoGUI template matching, dynamic door checks, menu setup, retry loop | A coherent derivative of the common scripted 4/20 strategy; fixed assets and thresholds remain brittle. |
| [`Teldum/FNAF-1-Python-autoplay-bot`](https://github.com/Teldum/FNAF-1-Python-autoplay-bot) | Fixed-coordinate PyAutoGUI, image and pixel checks | A beginner project whose README says it can beat 4/20 with enough retries, not a reliability claim. |
| [`Sebastian1320/Fnaf1_clearMacro`](https://github.com/Sebastian1320/Fnaf1_clearMacro) | Proportional coordinates, pixel colors, menu-star state, CAM 4B loop | Automates the progression from zero to three stars and closely resembles the lifecycle used by The2AndOnly's bot. |
| [`GROTTAKE/FNAFBot`](https://github.com/GROTTAKE/FNAFBot) | C++, Win32 desktop capture/input, OpenCV template recognition, calibration assets | The largest conventional FNaF 1 external codebase found. It is framed as a learning/reference project; fixed coordinates and local calibration still dominate. |
| [`r4hmi/fnaf-auto-play`](https://github.com/r4hmi/fnaf-auto-play) | Small C++ Win32 cursor, pixel, and timer programs | Crude experimental versions rather than a validated end-to-end bot. |
| [`byFranca/bot-automatico-fnaf-1`](https://github.com/byFranca/bot-automatico-fnaf-1) | Proportional mouse coordinates and screenshot/pixel similarity | A short reactive prototype. |
| [`phonehseng/Fnaf-automations`](https://github.com/phonehseng/Fnaf-automations) | PyAutoGUI image recognition with a reusable action framework | Mostly framework and demonstration code; it does not publish a strong clear claim. |
| [`JenMiriel/FredBotPyScript`](https://github.com/JenMiriel/FredBotPyScript) | PyAutoGUI/OpenCV screenshot and control scaffolding | An older GPL-licensed prototype that appears incomplete. |
| [`Maraba23/Fnaf-playbot`](https://github.com/Maraba23/Fnaf-playbot) | PyAutoGUI/OpenCV templates and fixed-resolution scripts for FNaF 1–3 | The FNaF 1 branch is a developing template-driven bot, not a documented high-reliability clear. |

### Live-game learning and perception projects

| Project | Environment and observations | Assessment |
|---|---|---|
| [`LucMazarJR/no-more-jumpscares`](https://github.com/LucMazarJR/no-more-jumpscares) | Stable-Baselines3 PPO over screenshots plus seven tracked values; 17 external PyAutoGUI actions; coordinate and death/win/camera calibration | The most substantial public attempt to train on the real FNaF 1 executable. It includes logging, replay, template re-synchronization, door verification, and behavioral-cloning support. Published logs expose deaths and desynchronization; no convincing clear rate was found. |
| [`pieberrykinnie/fnaf-agent`](https://github.com/pieberrykinnie/fnaf-agent) | BetterCam/MSS capture, canonical 1280×720 frames, a Clickteam memory traversal/oracle, planned vision/audio/RL stages | A serious act-then-verify architecture and research backlog. It is not yet a live player: capture and parts of the oracle exist, while control and policy milestones remain open. |
| [`pieberrykinnie/fnaf-rl`](https://github.com/pieberrykinnie/fnaf-rl) | Screen observer skeleton | Early work-in-progress, not an agent yet. |

### Public FNaF 1 implementations without complete public source

- DanielJMus demonstrates an external C++ 4/20 algorithm in [this video](https://www.youtube.com/watch?v=wW3GBsVED54), but no source/download was located.
- DarkTaurus published a [bot test](https://www.youtube.com/watch?v=p1VANiLIRxE)
  and a [modified-game bot](https://gamejolt.com/games/FNAF1BT/816064).
- JustCosti demonstrates a 2026 Python screen-analysis bot in
  [this video](https://www.youtube.com/watch?v=BE_ByMabJeI); access to the
  program is sold through Patreon, so it is not open source.
- REKA demonstrates an in-engine whole-game bot in
  [this video](https://www.youtube.com/watch?v=ZHFvJUtsPE0), but did not
  distribute that modified game.

## FNaF 2: source-available implementations

This is the most relevant group for this repository. The exact comparison is in
[`FNAF-BOT-IMPLEMENTATION-COMPARISON.md`](FNAF-BOT-IMPLEMENTATION-COMPARISON.md).

| Project | Scope and method | Source-level finding |
|---|---|---|
| [`jasonclone/fnaf2bot`](https://github.com/jasonclone/fnaf2bot) | External C++/Win32 bot for the PC game; `GetPixel`, `SetCursorPos`, `SendInput`, keyboard events, and fixed coordinates | The strongest open-source stock-game 10/20 **attempt** found -- and "attempt" is the correct word. **Corrected 2026-08-26.** This sentence read "the strongest open-source stock-game 10/20 bot found", which is an achievement claim the evidence does not carry. The repository description, fetched and quoted verbatim, is: *"bot **designed to** beat 10/20 mode. Success rate is around 1 in 3."* That is an intent statement plus an unqualified self-report -- no run count, no methodology, no named nights, and no win detection mentioned anywhere. **No 10/20 completion by this bot has been verified by anyone, including us.** The point is sharper than a caveat: this project's own analysis below records that the program "does not stop on a clear" and that "success/failure termination is incomplete", so whatever the 1-in-3 counts, it cannot have been counted by the bot. A human watched. A roughly ten-second phase loop winds, checks vents, handles office blackouts/mask retries, treats Golden Freddy and Foxy specially, and navigates retry menus. The repository description reports success around one run in three. Its hot path is mostly raw pixels despite a template helper. It assumes one layout, has no explicit world model or replay tests, and does not stop on a clear. |
| [`Maraba23/Fnaf-playbot`](https://github.com/Maraba23/Fnaf-playbot) | External Python/OpenCV/PyAutoGUI, fixed 1920×1080 | Winds for fixed intervals, template-matches office/vent/Foxy threats, masks for long fixed holds, and pulses Foxy. Marked under development. |
| [`elyay69/fnaf-ai-code`](https://github.com/elyay69/fnaf-ai-code) | External Python/PyAutoGUI, fixed pixels and deeply nested timing | A brittle experimental routine with vent/mask checks, not a demonstrated general controller. |
| [`TheLividDonut/FNAF2Bot`](https://github.com/TheLividDonut/FNAF2Bot) | External Python/OpenCV/PyAutoGUI prototype at 640×480 | Nonfunctional as published: image paths point to one developer's absolute Windows directories, and the night loop uses a reversed elapsed-time condition, so it does not enter during its timeout window. |
| [`Emikot123/FNAF-2-Bot`](https://github.com/Emikot123/FNAF-2-Bot) | Linux/Wayland design using `xdotool`, MSS, and pixel colors at 1920×1080 | Abandoned/incomplete. The main loop ends in an unfinished call and reaction code references undefined state. |
| [`Couraeel/Fnaf2-Ai`](https://github.com/Couraeel/Fnaf2-Ai) | Pygame recreation with an embedded rule-based player | The cleanest source-available FNaF 2 controller architecture, but not a stock-game bot. It reads internal animatronic positions, box charge, battery, camera/mask state, and uses an emergency-priority tree plus office-check/camera phases. Actions mutate recreation state or use virtual holds. |

### Modified-game and video-only FNaF 2 bots

| Artifact | Availability | Finding |
|---|---|---|
| [Shooter25's FNaF 2 Practice Mod](https://gamejolt.com/games/Shooter25Mods/826595) | Downloadable modified Clickteam game; public [strategy/bot guide](https://www.youtube.com/watch?v=EYtIOKRuQqE) | An embedded direct-state state machine with Wind, Stalling, Checking, Blackout, Toy Bonnie, and Vent Character states. It reads internal danger, blackout, mask, music-box, and character flags and then invokes ordinary game events. Its reported 104–1 Brayden-strategy result is not comparable to black-box stock-game sensing. See the local [forensic reconstruction](../in-engine/SHOOTER25-PRACTICE-MOD.md). |
| REKA whole-game and 10/20 bots | Public videos: [Nights 1–6](https://www.youtube.com/watch?v=76uq8WrgBK8), [10/20](https://www.youtube.com/watch?v=KAypzlB0pFU) | Modified/decompiled Clickteam automation with direct internal conditions. No source or public download was located. |
| MrBigWeenie C++ 10/20 bot | [Public video](https://www.youtube.com/watch?v=UVomtF0oP1I) | Described as an external bot without memory hacking; no source or download was found. |
| Nahsaimon 10/20 at 1.5× | [Public video](https://www.youtube.com/watch?v=AXJmj77qllc) | Method and source availability could not be established. |

## FNaF 3 and FNaF 4

### FNaF 3

- [`Maraba23/Fnaf-playbot`](https://github.com/Maraba23/Fnaf-playbot) has a
  FNaF 3 OpenCV/PyAutoGUI branch for Springtrap detection, audio lures, and
  reboots. It resolves all template locations once at module import, so later
  decisions use stale detections; its main loop is still a hotkey test zone.
- REKA demonstrates an in-engine [whole-game bot](https://www.youtube.com/watch?v=ZjNCfLROJv4)
  and [aggressive Nightmare mode](https://www.youtube.com/watch?v=K7cHldSlUZs).
  No public implementation was located.
- [`ChristianLW/fnaf3bot`](https://github.com/ChristianLW/fnaf3bot) is a Node/AHK
  Twitch-chat voting controller made for AstralSpiff, not an autonomous player.
- [`fewffwa/Fnafbots`](https://github.com/fewffwa/Fnafbots) is a Java
  Twitch/Discord command controller for modified games, not an autonomous
  strategy.

### FNaF 4

- [`Doonguin/fnaf4-sim`](https://github.com/Doonguin/fnaf4-sim) is an MIT-licensed
  simulator scaffold whose stated goal is AI training. Its current source only
  begins Bonnie/Chica behavior; it contains no policy or training loop.
- REKA demonstrates a modified-game [whole-game bot](https://www.youtube.com/watch?v=2nFV9vtFEuE).
  The public description outlines urgency/priority stages, but source and a
  downloadable implementation were not found.

## Sister Location

REKA demonstrates automation of the story and custom nights in
[this video](https://www.youtube.com/watch?v=ykKsJ6nfRlg), and a pre-patch 10/20
run in [this video](https://www.youtube.com/watch?v=IrHqQepmgrQ). The description
says the controller was inserted into the game rather than operating as a
screen-reading script; some menus remained manual and the Baby minigame could
desynchronize. No source or public download was located.

## FNaF World

[`AITYunivers/FNaFWorldTAS`](https://github.com/AITYunivers/FNaFWorldTAS) is a
substantial source-available injected TAS. Its C++ hooks Clickteam input and
events, waits on battles/tokens/cinematics, and manipulates RNG-dependent game
behavior. This is deterministic tool-assisted routing, not an adaptive player.
The repository has no explicit license. The project's speedrunning context is
also discussed on [speedrun.com](https://www.speedrun.com/nl-NL/fnafworld/forums/7e9b1).

## Freddy Fazbear's Pizzeria Simulator

- [`MiniMage7/TwitchPlaysFNAFPizzaSim`](https://github.com/MiniMage7/TwitchPlaysFNAFPizzaSim)
  is an MIT-licensed TwitchIO/PyAutoGUI controller. Chat votes control night,
  salvage, shop, and game modes; immediate WASD is also supported. It assumes a
  fixed 1920×1080 layout and is crowd control, not autonomy.
- [`njGroters/autoclown`](https://github.com/njGroters/autoclown) is a GPLv3
  Rust solver only for the Juice Fountain Clown minigame. It checks both sides
  of a fixed Windows 10/1920×1080 screen and presses Space when the path is clear.
- No credible public full-night autonomous FFPS player was verified.

## Ultimate Custom Night

| Project/artifact | Type | Assessment |
|---|---|---|
| REKA UCN bot | Modified-game direct-state controller | Demonstrated [50/20](https://www.youtube.com/watch?v=Q1hozxgc3Ow), an [updated run](https://www.youtube.com/watch?v=yKoX_NBvFRc), [no Death Coin](https://www.youtube.com/watch?v=Nxmg8HjvMTQ), [all challenges](https://www.youtube.com/watch?v=8oy7SjI4M60), and a [code showcase](https://www.youtube.com/watch?v=lRzxM2Q8lYM). A [delta patch](https://drive.google.com/file/d/1zP4Xow0S3Q5omCwOq8iIHDNAs7qI2d89/view?usp=sharing) is public, but source is not. It reads game state and implements character-specific rules rather than perceiving the stock screen. |
| Remarkable-Fly-1182 UCN AI | Modified executable | The author posted a [public download thread](https://www.reddit.com/r/technicalFNaF/comments/uhem7p/if_anybody_wants_to_try_the_bot_for_themselves/) and [MediaFire executable](https://www.mediafire.com/file/8a06zxgwngj4odc/Ultimate+Custom+Night+ai+0.2+power+fixes.exe/file). The thread identifies it as a decompiled/modified Clickteam game, claims four wins in five for one revision, and records bugs and abandonment. It is an untrusted executable and was catalogued, not run. |
| Scabinic external bot | External input with non-visual state assistance likely, exact mechanism uncertain | A [50/20 video](https://www.youtube.com/watch?v=9JERV6c7OHU) survives, but the old download is gone. The method cannot now be audited and should not be called open source. |
| [`tschuma3/UCN-AI`](https://github.com/tschuma3/UCN-AI) | Purported RL source | Broken placeholder: its only program is unfinished generic DoomCorridor RL code, not a UCN environment. |
| [`rKnuck565/ucnAi`](https://github.com/rKnuck565/ucnAi) | Purported source | Effectively empty beyond repository metadata. |
| [`MycoalDough/FNAF-RL-Agent`](https://github.com/MycoalDough/FNAF-RL-Agent) | Unity reconstruction and Python RL | Includes UCN in the reconstruction, but the supplied agent/training target is FNaF 1; it is not a demonstrated UCN player. |

There is therefore strong public evidence that UCN can be automated, and even a
public patch/executable, but no working **open-source external stock-game** UCN
bot was verified.

## Simulation, reconstruction, and reinforcement learning

| Project | Model | Agent/training | Transfer boundary |
|---|---|---|---|
| [`Dankiel23/fnafAI`](https://github.com/Dankiel23/fnafAI) | Detailed FNaF 1 Gymnasium simulation; a 77-value full observation and an 87-value CV-oriented partial observation; 17 actions | Stable-Baselines3 PPO/algorithm comparisons, curriculum, replay, tests | Explicitly has no real-game bridge. This is the strongest conventional Python simulation/RL work found, but its wins are simulator wins. |
| [`Gyrozaid/fnaf`](https://github.com/Gyrozaid/fnaf) | Simplified FNaF 1 MDP: two animatronics, four-room linear map, direct state, six actions, 535 steps | DQN/A2C/PPO, heuristic baseline, Optuna | Useful learning experiment with a large mechanics and observation gap from the commercial game. |
| [`MycoalDough/FNAF-RL-Agent`](https://github.com/MycoalDough/FNAF-RL-Agent) | Unity reconstruction of FNaF 1/UCN with direct socket state | Python dueling double DQN, noisy layers, prioritized replay; 19 inputs and 16 actions | A reconstructed-game agent, not a stock-game controller. |
| [`Couraeel/Fnaf2-Ai`](https://github.com/Couraeel/Fnaf2-Ai) | Pygame FNaF 2 recreation | Handwritten priority policy | Good controller decomposition, but its direct-state policy bypasses perception and several stock mechanics. |
| [`Doonguin/fnaf4-sim`](https://github.com/Doonguin/fnaf4-sim) | Early FNaF 4 simulator | None yet | Scaffold only. |
| [`LucMazarJR/no-more-jumpscares`](https://github.com/LucMazarJR/no-more-jumpscares) | The real FNaF 1 game, with screenshot and tracked-state observations | PPO and behavioral cloning | Avoids a simulator transfer gap, but pays for slow, fragile live interaction and has no verified public clear rate. |
| This repository | Source-derived FNaF 2 Android event model with deterministic RNG, mechanics ledgers, replay/search tools, and actuator error layers | Exact-policy simulation, enumeration/hill-climb, worst-case and seed sweeps rather than neural RL | Deliberately keeps the simulator separate from stock-device black-box validation. It has strong model evidence but no full-night stock-device clear yet. |

The important split is not “AI versus scripts.” It is whether an agent succeeds
against the commercial game's hidden state and timing, or only against the
state distribution its own simulator generates. Simulator throughput enables
curricula, search, and millions of transitions; without a calibrated bridge,
that does not establish a stock-game clear.

## Other automation scopes

- **TAS:** `FNaFWorldTAS` is deterministic, injected, and route-specific.
- **Crowd control:** `TwitchPlaysFNAFPizzaSim`, `ChristianLW/fnaf3bot`, and
  `fewffwa/Fnafbots` translate human votes/commands into game actions.
  [`gregoriousTechorious/FNAF-1-Twitch-Bot`](https://github.com/gregoriousTechorious/FNAF-1-Twitch-Bot)
  is another concrete example: its C# program executes the winning command from
  a three-second Twitch vote window through fixed Win32 coordinates.
- **Narrow minigame solver:** `autoclown` solves one FFPS arcade task.
- **Multiplayer player-bots:** the GMod workshop mode
  [Fazbear's Hunt](https://steamcommunity.com/sharedfiles/filedetails/?id=3741650368)
  advertises AI for animatronic hunters and survivors, based on Leadbot. It is a
  FNaF-themed multiplayer mode, not a canonical night-game bot.
- **Trainer rather than player:** this repository's browser app teaches and
  grades a human executing Minus 7. Its device tooling is a separate automation
  scope and is not evidence that the trainer itself plays the game.

## Games with no verified autonomous player

The search found no credible autonomous player bot for **Help Wanted, Curse of
Dreadbear, Special Delivery/AR, Security Breach, Ruin, Help Wanted 2, Into the
Pit, or Secret of the Mimic**. This means none was verified in public GitHub and
web results as of the snapshot date; it does not prove absence. Results for
these games were overwhelmingly mods, speedruns, NPC AI, or conversational bots.

No credible full-night autonomous player for a Fanverse title was verified
either. The Observation Duty bot sometimes returned by searches is for a
different franchise.

## False positives and exclusions

| Search hit | Why it is excluded |
|---|---|
| [`GigaNerdTech/fnafbot`](https://github.com/GigaNerdTech/fnafbot) | Discord minigame bot |
| [`Eren-coder363/fnaf-bot`](https://github.com/Eren-coder363/fnaf-bot) | Discord/conversational bot |
| [`vyrusgames/HelpyBot`](https://github.com/vyrusgames/HelpyBot) | Discord bot despite “FNaF AR Bot” wording |
| [`IKONIK-STUDIO/autoFnaf`](https://github.com/IKONIK-STUDIO/autoFnaf) | Semi-automation/remapping; autonomous decisions remain WIP |
| [`dippy34/fnaf-ai`](https://github.com/dippy34/fnaf-ai) | Browser recreation's animatronic AI, not a player bot |
| [`Donpapu151/Gordobot-Fazbear`](https://github.com/Donpapu151/Gordobot-Fazbear) | Fangame-news/RSS-to-Discord notifier, not gameplay |
| “No STAFF Bots” Security Breach mods | Remove or alter NPCs; they do not play the game |

Some discarded repositories also contained credentials or webhook material in
their public trees. Nothing from those files is reproduced here.

## Local inspection, licensing, and safety

Candidate repositories were shallow-cloned under
`/Users/pedro.junior-ext/Projects/fnaf-bots/` and inspected locally. Commercial
games were not installed or launched for this census, and untrusted downloadable
executables were not run. The research checkout is outside this repository and
is not a vendored dependency.

The local source-bearing/adjacent checkout set is:

| Group | Local checkout names |
|---|---|
| Stock external bots and prototypes | `GROTTAKE--FNAFBot`, `JenMiriel--FredBotPyScript`, `LucMazarJR--no-more-jumpscares`, `Maraba23--Fnaf-playbot`, `Screw13--fnaf-bot-2024`, `Sebastian1320--Fnaf1_clearMacro`, `Teldum--FNAF-1-Python-autoplay-bot`, `The2AndOnly--fnaf-python-bot`, `TheLividDonut--FNAF2Bot`, `byFranca--bot-automatico-fnaf-1`, `elyay69--fnaf-ai-code`, `jasonclone--fnaf2bot`, `kalebwbishop-FNAF_Bot`, `kevvit-fnafbot`, `phonehseng--Fnaf-automations`, `pieberrykinnie--fnaf-agent`, `pieberrykinnie--fnaf-rl`, `r4hmi--fnaf-auto-play` |
| Simulation, reconstruction, RL, and TAS | `AITYunivers--FNaFWorldTAS`, `Couraeel--Fnaf2-Ai`, `Dankiel23--fnafAI`, `Doonguin--fnaf4-sim`, `Gyrozaid--fnaf`, `MycoalDough--FNAF-RL-Agent`, `rKnuck565--ucnAi`, `tschuma3--UCN-AI` |
| Crowd control and narrow automation | `ChristianLW--fnaf3bot`, `fewffwa--Fnafbots`, `gregoriousTechorious--FNAF-1-Twitch-Bot`, `MiniMage7--TwitchPlaysFNAFPizzaSim`, `njGroters--autoclown` |
| Semi-automation | `IKONIK-STUDIO--autoFnaf` |
| Screened false positives | `Donpapu151--Gordobot-Fazbear`, `Eren-coder363--fnaf-bot`, `GigaNerdTech--fnafbot`, `GROTTAKE--ObserverIOODBot`, `Mauyi0907--Bot-FNAF`, `Mauyi0907--fnaf-bot-v2`, `Sandroo10--MarionetteBotShowcase`, `Sr-agente208--Bot_fnaf`, `dippy34--fnaf-ai`, `vyrusgames--HelpyBot` |

The Jason checkout contains the complete controller source used in this review,
but an interrupted partial clone left some large tracked binary/build assets
absent. Those assets were neither needed nor executed. The finding is based on
the controller and project source, not on a locally reproduced clear.

Most inspected repositories do **not** contain an explicit license. Publicly
readable source is not automatically reusable source: unless a license grants
permission, treat it as all-rights-reserved and use it only as research prior
art. No code from these projects was copied into this repository.

## Bottom line

- Public FNaF bots are concentrated in FNaF 1 and FNaF 2. Most external bots
  are timed PyAutoGUI/Win32 macros with a thin layer of pixels or templates.
- Direct-state modified games produce the strongest demonstrated reliability,
  but solve an easier sensing problem than an unmodified game.
- RL work is concentrated in FNaF 1 and splits between rich simulations with no
  bridge and fragile live-game training with no published clear rate.
- `jasonclone/fnaf2bot` is the nearest open-source stock-game comparator for
  this project. Shooter25 is the nearest reliable FNaF 2 controller comparator,
  but it is embedded in a modified game.
- No project found combines this repository's mechanics provenance and exact
  testing with a demonstrated external FNaF 2 10/20 clear. Conversely, this
  repository has not yet matched the end-to-end real-game evidence published by
  the better external bots.
