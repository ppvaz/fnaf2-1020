# In-APK bot — focused same-process campaign

**Status:** opened 2026-08-28 by Pedro's directive. This is a laser-focused
exploration of getting the bot to observe and act from the game process or a
functionally equivalent rebuilt APK. The earlier finding that a straightforward
repackage/re-sign crashes under PAIRIP remains evidence, but no longer closes the
whole path.

## Goal

Produce a personal research APK in which the bot can read authoritative game state
and issue frame-aligned actions without the external screen/ADB loop. Prefer the
retail runtime when technically possible; accept a separately packaged faithful
rebuild only when the record clearly distinguishes it from the stock APK.

Success is not “we can decompile the game.” Success is one installed APK that boots
to a night, exposes a minimal internal state tuple, executes one closed-loop policy
decision in process, and logs enough evidence to compare the result with the
untouched stock game.

## Boundaries

- Personal study of an owned copy only. Do not commit or distribute the APK, CCN,
  extracted assets, signing material, or proprietary game content.
- “By any means necessary” means do not prematurely discard a technically plausible
  route: test static repackaging, runtime/native hooks, rooted instrumentation,
  loader/shim approaches, CCN mutation, and faithful recompilation as separate
  hypotheses. It does not waive device safety, evidence, or the no-distribution
  boundary.
- Preserve the untouched Play-installed package as the fidelity oracle. A modified
  or rebuilt APK is an instrument, never silently treated as stock-game proof.
- Keep every experiment reversible and record the exact package, signature, runtime,
  root/hook requirements and behavior it depends on.

## Known starting point

- Target: `com.scottgames.fnaf2` v2.0.7 / versionCode 26, Fusion build 296.
- The retail package contains PAIRIP (`VMRunner`, license components and
  `libpairipcore.so`); the already-tested conclusion is that ordinary
  repackage/re-sign is not viable.
- The game logic is `res/raw/application.ccn`; the project can decode the event
  sheet and has a build-296 mmfparser forward-port (`tools/recompile/`).
- Chowdren is a viable CCN-to-C++ research route, but it uses a reimplemented
  runtime and has not yet generated and booted this game. A newly re-derived,
  externally held mobile patch now reproduces a clean-clone structural parse of
  the owned build-296 CCN (33 frames / 782 images), including 7 real font records
  and 67 APK audio resources. This build's music bank is empty. It is not yet a
  generated or booted runtime. The 2026-08-28 converter work clears parse, asset
  creation and (with `tools/recompile/fnaf2-config.py`) all of `write_objects`; it
  now stops in event generation — root-caused as a build-293→296 `mmfparser` port
  (numeric loops, parameter codes 67–70, frames 29–32 don't parse). See
  [`IN-ENGINE-PILOT-RECOMPILE.md`](../docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md#phase-2--generate-boundaries-2026-08-28).
- Direct state targets already have names and source mappings: `viewing`, `mask`,
  Foxy `D`, music-box state, office occupants and battery life.

### Repackage/Gadget negative — 2026-08-28

The modified-retail branch has now been run through its smallest complete device
probe on the Moto g56 (arm64-v8a). AntiSplit-M merged the locally installed
v2.0.7 split set. A separate, self-signed research APK then added an ARM64
instrumentation library as a dependency of `libRuntimeNative.so`; the library
was configured to listen only on loopback and not to block normal launch.

- The package manager accepted the signed APK after the stock package was
  removed. APK signature verification passed before installation.
- On its first launch the process loaded `libpairipcore.so` and exited with
  `SIGSEGV`; the only native frame in the tombstone was
  `libpairipcore.so +0x37190`. No instrumentation connection survived long
  enough to enumerate.
- This is a measured failure of ordinary merge/re-sign/repackage on this build,
  not evidence that the game runtime or its exposed state tuple is unavailable.

**Disposition:** retire this exact repackage recipe. Do not retry it with
cosmetic changes and do not add mechanisms intended to defeat the package's
integrity, licensing, provenance, or anti-instrumentation checks. Keep all APKs,
extracted game content, signing keys, and experiment-only utilities outside Git.
Advance the separately named rebuild/recompile route or the existing external
retail-device helper instead.

## The minimal internal state tuple

Shooter25's in-process bot (104 wins / 1 death, `docs/in-engine/SHOOTER25-BOT-STATE-MACHINE.md`)
proves the point of this whole plan: it reads a handful of Clickteam objects
directly and never touches a pixel or a wall clock. It branches on
`music box counter >= 1950`, `mask value 0 = 2` (fully on), `in danger`, the
`drop everything` blackout, `panel state`, `old-Foxy value 3`, and phases off
`Timer mod 5000`. The Android build exposes the same state under different
handles; the sourced mapping already exists in
[`UNIFIED-SOURCED-ENGINE-FACT-INDEX.md`](../docs/android/UNIFIED-SOURCED-ENGINE-FACT-INDEX.md).
Package 3's job is to read this tuple in process and confirm each value against
a visible or source-derived transition.

**Must read** (a closed-loop Minus-Toys-or-better policy is not expressible
without these):

| value | Android handle / groups | why it is load-bearing |
| --- | --- | --- |
| `viewing` | counter, handle **55**; set g16‑27/g39‑40, zeroed g262/g911 | which camera the UI shows; 0 = monitor down. The flash-immunity gate. |
| `your view` marker | Active marker, handle **126** | the stun/cam-stall target. `55 != 126` **is** the double-camera split — the one thing an external reader cannot see (camtrace reads 55 only). |
| `last viewed` | g263 samples `viewing` every 200 ms while `viewing > 0` | the stale sample the split arms against; reading it tells the bot whether an arming attempt will take. |
| mask fully-on | `mask == 2` (g9, 12-frame put-on); `v12` mask-tick counter g907 (one per one-second event) | BB/Mangle/Withered repel is counted in whole masked ticks; the external run failed because it could not confirm 5 clean ticks. In process this is a direct compare. |
| monitor / `panel state` | g262 (down + `viewing`=0), raise animation state | every phase decision keys off it. |
| `blackout` v0 | object handle **131**, slot 0: 300-frame counter, `+dt` while `in danger`=1; g514/g516/g535/g537 | Foxy's 10 s kill check is denied by an active blackout; the greenrun forces one across every check. In process the bot reads the countdown instead of forcing it blind. |
| `drop everything` | set g718‑721/g624/g574, executed g262/g274, cleared g612 then re-set one frame later | the forced monitor-down that silently inverts an open-loop schedule (`RUN-TELEMETRY.md` §10). In process it is observable, not a desync. |
| `in danger` | g443 sets (Toy Bonnie overlay), g530 (0→1 → `got you stage`=1), g533 (defended on `mask`=2) | gates every light (g75/76/77); Shooter25's `Blackout` state entry. |
| music box counter | **2000** at frame start; wind snaps `<300`→300 then +5/frame; g652/g638/g643 | Puppet is the dominant death once the external clock drifts the wind phase; in process the level is a number, not a phase gamble. |
| Foxy `D` | `21 + Random(0..4) − D ≤ 17` at g337 every 5 s; D +1/s (+1 more masked), blackout pauses, 0 until 2 AM night 2, −1 per 500 ms Parts/Service hall light; g824/g825/g864/g872‑874 | tells the bot exactly when a hall reset is actually needed instead of pulsing every cycle on faith. |
| BB `stage` / `inOpening` / `inside` (marker 123) | stage roll g342; opening hop g417 latches to the next raise; `v6`=1 on raise-seen g290, marker 123 on raise-complete g291; inside is **permanent** g96 | the `n2-minustoys-0117` kill: the bot needs to know BB is in the opening *before* it raises the monitor. |
| the one-second game event / frame count | the tick every 200 ms / 500 ms / 1 s / 5 s / 10 s cadence is gated on (g263, g496, g781, g907, g336, g718) | **phase-lock.** This is what the external epoch latch approximates to ±302 ms and drifts; in process it is exact and free. |

**Nice to have** (sharpen the policy, not required for a first closed loop):
`got you stage` / `time left` / `time allowed` (the 100/80/60/55/50/50/45-frame
office fuse, g523‑533); per-character marker positions (g329 home positions,
the route markers 120‑123); `hall movement` latch (g875‑881); Golden Freddy
office roll state (g336, inert below night 6); battery / `power` and the
`FLASHLIGHT_DRAIN` rate; Mangle `insideArmed`; the Puppet route index (g404‑411).

## Online technical refresh (2026-08-28)

Current primary documentation sharpens the route order:

- Google describes Play automatic protection as runtime installer checks plus
  anti-tamper that detects modification and may prevent the app from running. Google
  also explicitly says it cannot guarantee prevention; it raises complexity and
  cost. Therefore the known re-sign crash is expected, while "all runtime attachment
  is impossible" would be an unsupported inference. See [Google Play automatic
  protection](https://support.google.com/googleplay/android-developer/answer/10183279).
- Frida distinguishes **Injected** mode (attach/spawn an existing process through
  `frida-server`) from **Embedded** mode (`frida-gadget` is added to the program).
  Its Android guide treats a rooted device as the simplest injected setup. For this
  target, injected mode is the first high-information probe because it does not
  first modify and re-sign the protected package; Gadget belongs to the repackaging
  branch and inherits PAIRIP risk. See Frida's [modes](https://frida.re/docs/modes/)
  and [Android guide](https://frida.re/docs/android/).
- Magisk documents Zygisk as running module code directly in app processes before
  specialization. LSPosed supports package-scoped Java/native module entries and a
  callback when target native libraries load. Those make a scoped rooted module a
  second concrete injection vehicle, not merely a generic "root may help" idea. See
  the [Magisk developer guide](https://topjohnwu.github.io/Magisk/guides.html),
  [Zygisk sample](https://github.com/topjohnwu/zygisk-module-sample), and LSPosed's
  [modern module](https://github.com/LSPosed/LSPosed/wiki/Develop-Xposed-Modules-Using-Modern-Xposed-API)
  and [native hook](https://github.com/LSPosed/LSPosed/wiki/Native-Hook) docs.
- Android's supported `Debug.attachJvmtiAgent` path throws `SecurityException` for a
  non-debuggable app. JVMTI is therefore a rebuilt/debuggable-APK tool, not a stock
  retail attachment route. See the Android
  [`Debug` API](https://developer.android.com/reference/kotlin/android/os/Debug.html#attachJvmtiAgent(kotlin.String,kotlin.String,java.lang.ClassLoader)).
- ByteDance's [ShadowHook](https://github.com/bytedance/android-inline-hook) can hook
  ARM/ARM64 native functions and newly loaded ELF files, but it must itself already
  be loaded. It is a useful hook engine after Frida/Zygisk/LSPosed/rebuild wins code
  execution, not an injection route by itself.
- The public [Anaconda/Chowdren tree](https://github.com/fnmwolf/Anaconda) advertises
  support only through Fusion build 293 and points newer decompilation toward Nebula;
  the target is build 296. This independently supports keeping the local mobile-CCN
  forward port as a required recompile step rather than expecting stock Chowdren to
  ingest the game.

**Operational consequence:** if Pedro authorizes a sacrificial rooted research
device, probe Frida injected mode first, then a package-scoped Zygisk/LSPosed module.
Do not unlock/root the current target phone implicitly: bootloader unlock commonly
wipes user data and changes the fidelity environment, so it requires a separate,
explicit device decision. Without such a device, advance the faithful-recompile
route while retaining Gadget/re-sign as a lower-priority measured experiment.

## PAIRIP-specific refresh: the anti-Frida layer is real, but the VM is not the wall (2026-08-28)

A follow-up survey specifically on PAIRIP (a.k.a. pairipcore / Play Integrity
Protect) internals and current bypass status, prompted by the question of whether
the in-process route is actually reachable. This tightens the route order above;
it does not report a completed probe. **All external results below are on other
people's devices and, where dated, on older Android/Frida than this target; none
has been reproduced here.** Every figure is CLAIMED until a probe on an approved
research device confirms it.

What PAIRIP actually does, corroborated across three independent write-ups:

- Protected Java methods are lifted into custom **VM bytecode** run by
  `libpairipcore.so`\'s `executeVM()`; each opcode is FNV-1 hash-checked before
  execution and the opcode table is **regenerated per build**, which is why static
  decompilation is incomplete rather than impossible. [CLAIMED — Byteria Lab,
  https://blog.byterialab.com/reversing-googles-new-vm-based-integrity-protection-pairip/]
- A **signature/installation** layer validates that the package came from Play and
  is unmodified — this is the layer the already-recorded re-sign crash hits.
- An **anti-instrumentation** layer: `ptrace`/`prctl`/`clone` anti-debug,
  `/proc/self/maps` scanning, and frida-server port detection. Stock
  `frida-interception-and-unpinning` is reported unable to bypass it. [CLAIMED —
  frida/frida#3316, https://github.com/frida/frida/issues/3316]

Why this **improves** the route ranking rather than confirming a dead end:

1. **The VM is not in the path of this plan.** `plans/17` needs to read Clickteam
   objects (`viewing`, `mask`, music-box counter, Foxy `D`) after a module is
   loaded in-process. Those live in the Chowdren/Fusion runtime, not inside
   `executeVM()`. Defeating the bytecode VM is a licensing/anti-piracy goal; it is
   not a precondition for reading game state once code runs in the process.
2. **The signature layer has a named, public defeat.** `ahmedmani/pairipfix` is an
   **LSPosed module that bypasses PAIRIP signature checks for APKs installed
   outside Play** [CLAIMED — https://github.com/ahmedmani/pairipfix]. That is
   precisely the wall the re-sign crash represents, which raises the
   Zygisk/LSPosed route from "second injection vehicle" to a first-class one: a
   scoped module runs inside the app process *before* the anti-instrumentation
   checks fully arm, and the signature defeat is a module rather than a re-sign.
3. **VM tooling now exists, for the day it is needed.** `MatrixEditor/pairipcore-vm`
   disassembles and decompiles the VM bytecode; `Solaree/pairipcore` collects the
   internals research; working Frida bypass PoCs are reported on **Frida 17.2.17 /
   Android 10** [all CLAIMED — respective repos]. Relevant only if a later package
   needs the licensing path, not for the state read.

**Corrected route order (supersedes the "Frida injected first" operational
consequence above, kept per the retractions rule):** on an approved rooted
research device, the highest-information first probe is a **package-scoped
Zygisk/LSPosed module** (pairipfix-style signature handling + an in-process read
of one state value), *not* naive Frida attach — because the anti-Frida layer is
the one PAIRIP component that is confirmed to bite, while a module that is already
inside the process before specialization sidesteps the detection that stock Frida
tooling trips. Frida injected mode remains a valid probe, but it must carry
anti-detection from the first attempt rather than being tried bare.

**The honest caveat that keeps this from being hope again.** Every result here is
someone else\'s handset, several on Android 10 against a target that is Android
15-era, and PAIRIP is versioned server-side and updated — a bypass that worked in
one write-up is not guaranteed against build 296\'s protection revision. This
section changes *which probe to run first*; it does not claim the probe will
succeed, and the falsification rule in "Focus rule" still governs: run the
smallest read of one value, record exactly what stage broke, move on.

## Why in-process — measured against `n2-minustoys-0117`

The first Minus Toys device night (2026-08-28,
`docs/device/ON-DEVICE-VALIDATION.md`) is the concrete case for this plan. The
external open-loop port cleared the deterministic model 200/200 and still died
at ~2 AM to a Balloon Boy walk-in → Foxy chain. Every failure mode it hit is
one that in-process reading removes:

| external failure | in-process |
| --- | --- |
| epoch latch locates T0 to a **302 ms bracket**, then never re-corrects | the one-second game event / frame count is read directly — phase is exact and free |
| game-vs-wall clock drift (`~-184 ms/min` on the drift trace) walks the wind phase; Puppet becomes the dominant death | the music box counter is a number, not a phase gamble |
| the mask window delivers 4 clean ticks against a 5-tick repel; a fixed cadence cannot confirm | `mask == 2` and the `v12` tick counter (g907) are direct compares |
| `camtrace` reads `viewing` (55) only — the split (`55 != 126`) is unobservable from pixels | the `your view` marker (126) is a readable field |
| a `drop everything` forcedown silently inverts the schedule and reads as a desync | the flag is observable state |
| the strategy's own budget is **~0.66 s/cycle** (`MINUS-3-STRATEGY.md` §3) and half of it is gone before the night starts | no per-cycle timing budget to spend — decisions fire on state edges |

This does not make the external track worthless — it makes the in-process
track the one with a demonstrated ceiling. Shooter25's in-engine bot plays
brayden's timer strategy at **104 wins / 1 death** reading exactly this class
of state; no external screen-driven FNaF 2 bot is documented above ~1/3 on
10/20 (`docs/research/FNAF-BOT-CENSUS.md`,
`docs/research/FNAF-BOT-IMPLEMENTATION-COMPARISON.md`).

## Relation to the external track

The external hybrid — an AM-digit clock re-anchor plus a reactive left-vent BB
read with mask verify/retry, jasonclone-style — and this plan are **parallel
tracks that answer different questions**, not sequential steps. The external
hybrid answers "how far can a screen-and-ADB bot get on the retail package with
nothing installed?" — its ceiling is ~1/3 (jasonclone) and the
`n2-minustoys-0117` sim puts an AM-anchored open-loop Minus Toys at ~17–35 %
before any reactive branch. This plan answers "what does a policy do when it
reads true state and is frame-locked?" — the Shooter25 ceiling. Run whichever
is unblocked; do not gate one on the other. The external track also keeps the
retail package as the fidelity oracle this plan's package 6 needs.

## Runtime attachment (route 2) is not being pursued — Pedro's call, 2026-08-28

The read-true-state route as specced hit a barrier that is not a probe result:

- **Ethical.** Every viable form of it here depends on defeating a PAIRIP layer —
  `pairipfix`-style bypass of the signature/installation check, plus evading the
  anti-instrumentation layer that is the one PAIRIP component confirmed to bite.
  That is circumventing the app's integrity and anti-tamper protection, not
  studying an owned copy, and it is out of scope for this project.
- **Practical.** There is no approved rooted research device, and rooting the
  g56 target is off the table (it wipes user data and destroys the fidelity
  oracle this plan's package 6 depends on).

So routes **2** and **3** (rooted retail observation, loader/shim that has to
sidestep the same protection) are parked. This does **not** close Plan 17: the
goal — an owned research build that reads authoritative state and closes one
loop — is still reachable through the **faithful recompile (route 5)**, which
converts the owned CCN with open-source Chowdren into a separately-packaged
research binary and touches none of PAIRIP. Route 5 is now the active path,
working through the Phase 2 generate boundaries (see the ledger row and
[`IN-ENGINE-PILOT-RECOMPILE.md`](../docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md#phase-2--generate-boundaries-2026-08-28)).
The runtime-attachment survey above is kept per the retractions rule — it
correctly maps the route; it is the route itself that is declined.

## Route matrix

Treat these as parallel hypotheses and kill each only with a reproducible probe.
For each, the cheapest probe that would falsify it is named — a route is
retired on that probe's result, never on a second failed attempt at the same
recipe.

1. **Modified retail package:** smallest possible resource/dex/native change,
   followed by signature/install/launch logging to localize the actual integrity
   failure rather than treating “PAIRIP” as one opaque wall.
2. **Runtime attachment:** rooted/in-process Java or native instrumentation that
   leaves the retail files intact and proves one read-only state observation before
   attempting control. On an explicitly approved research device, the corrected
   first probe is a package-scoped Zygisk/LSPosed module; Frida injected mode remains
   a separately logged later probe, not a prerequisite or a bare retry.
3. **Runtime or loader shim:** load the original runtime/content under a controlled
   wrapper or intercept the narrow state/input boundary, with provenance checks and
   fidelity differences recorded.
4. **CCN mutation and Android rebuild:** modify event logic or add a pilot in an
   independently signed/package-named build when a trustworthy writer/export path is
   available.
5. **Faithful recompile:** forward-port mmfparser into Chowdren, generate native
   code, restore required extensions, package it for Android, and inject the pilot in
   generated C++.

The campaign may add a route when evidence reveals one. It must not keep retrying the
same failed re-sign recipe under a new label.

## Mandatory work packages

1. **Freeze the oracle and probe contract.** Record hashes/version/splits for the
   owned target outside git; define boot, night-entry, state-read, action and timing
   probes; establish a recoverable device workflow. **Gate:** an untouched control
   run and a one-change negative control produce comparable logs.
2. **Build the route harness and failure ledger.** Give every route a repeatable
   build/install/launch command, expected artifact boundary and falsification rule.
   Capture where it fails: packaging, signature/provenance, VM bootstrap, native
   load, CCN parse, frame boot or game event execution. **Gate:** the known naive
   re-sign failure is reproduced and localized enough to choose the next route.
3. **Win same-process observation.** On the first viable route, expose one harmless
   authoritative value and then the minimal policy tuple without changing game
   decisions. **Gate:** logged internal state agrees with a visible/source-derived
   transition across repeated runs.
4. **Win same-process actuation.** Trigger one reversible input or game action at a
   chosen engine frame and record requested versus accepted timing. **Gate:** a
   closed-loop state→decision→action round trip works without external screencap or
   ADB timing as the control path. **Suggested first decision: the Foxy hall
   reset** — read Foxy `D` (g337/g824) and `blackout` v0, and on the frame `D`
   crosses a threshold with no active blackout, assert the hall `lit?` for one
   game second. It is a single scalar read, a single one-frame output, reversible,
   and its effect (`D` drops, or the 5 s roll `21+Random(0..4)−D ≤ 17` stops
   firing) is directly checkable in the same trace. The BB mask
   (read `bb.inOpening` + marker, hold `mask` to `== 2` for 5 `v12` ticks) is the
   natural second — it is the exact decision `n2-minustoys-0117` could not make.
5. **Bake the minimal bot.** Package an explicit, deterministic policy with a kill
   switch, bounded actions and a full decision/action trace. Start with a small
   scenario before a full night. **Gate:** the installed research APK completes the
   scenario repeatably and its trace replays against the sourced model.
6. **Fidelity and strategy campaign.** Compare state transitions and outcomes with
   the untouched stock package, document divergences, then use the in-APK bot to
   evaluate Plan 05 survivors and established baselines. **Gate:** every result is
   labeled retail-runtime, hooked-retail, rebuilt-runtime or model-only; no modified
   result is promoted as stock evidence without a stock cross-check.

### Package-2 route ledger — the command is not the result

The local repository intentionally contains neither the owned APK/CCN nor a signing
key.  A route record therefore belongs with the ignored experiment artifacts, while
this table fixes the *shape* of each repeatable probe.  Record the exact command,
tool/source revision, input hash, device/API level, stdout/stderr, exit/signal and
the first stage reached.  Do not put the proprietary input, a modified package, a
key, or a raw state dump in Git.

| route | smallest permitted probe | first positive evidence | falsification record / next route |
| --- | --- | --- | --- |
| stock oracle | Launch the untouched Play-installed target, enter the same selected night, and collect the normal capture/telemetry manifest. | The package identity, installer/provenance and night-entry evidence agree with the frozen oracle record. | An oracle mismatch invalidates comparison evidence; repair the device workflow before any research build is judged. |
| ordinary repackage | **Retired:** the recorded merged/re-signed research APK is the one probe for this recipe. | None; it is not to be retried cosmetically. | `libpairipcore.so +0x37190` / `SIGSEGV` after native load; move to a separately named route. |
| rooted retail observation | On an explicitly approved sacrificial rooted device, run one read-only, package-scoped observation of a harmless value through a permitted research environment. | A local timestamped value changes with a visible/source-derived transition while the untouched package files remain the fidelity subject. | Record whether failure was device setup, process start, native-library load, or state lookup. Do not turn a failed probe into a sequence of integrity/anti-instrumentation evasion attempts. |
| loader or runtime shim | Boot the original content under a separately packaged controlled runtime and observe one value only. | A frame reaches the title/night boundary and the value has a defined, logged owner. | Record the first incompatible runtime/content boundary; continue to the independent recompile route, not a disguised repackage retry. |
| CCN mutation/rebuild | With a lawful writer/export path, build a distinct package-name research app with one inert diagnostic. | It installs, boots and emits the diagnostic without claiming retail-runtime fidelity. | Record writer/export/boot stage and retain the CCN and package outside Git; the faithful-recompile route remains independent. |
| faithful Chowdren recompile | Run the redacted parser → C++ → desktop-boot contract in [`IN-ENGINE-PILOT-RECOMPILE.md`](../docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md#recompile-probe-contract-and-evidence-boundary). | First `GameData` parse, then generated C++, desktop boot, and finally an in-process state trace — each is a separate milestone. | Stop at the first failing phase and preserve its derived log; do not call a parser success, generated source, or rebuilt desktop run a stock-APK result. **At 2026-08-28: parse ✓, asset creation ✓, C++ generation in progress.** `tools/recompile/fnaf2-config.py` clears `write_objects` — placeholder image `(0,0)` and the empty extension list (synthesize entries; `Layer`→native, `Multiple Touch`/Android/iOS→stub). Now stops in event gen (`write_loops`); root-caused as a build-293→296 `mmfparser` port (numeric loops, parameter codes 67–70, frames 29–32 don't parse). Not a boot attempt yet. |

The route harness is complete only when every attempted row has one such record.
It is not complete merely because a command exists in a shell history.  The current
repackage negative satisfies one retired row; it does not satisfy package 2 as a
whole.

## Focus rule

Until package 2 identifies a viable observation route, the next session on this plan
does not add trainer UI, generalized controller architecture, or another external
sensor. It advances the smallest boot/read probe on the highest-information route,
records the result, and immediately moves to the next route when the falsification
rule is met.

## Continue here

Runtime attachment (routes 2/3) is parked — see the barrier note above. The
active path is the **faithful recompile (route 5)**, working through the Phase 2
generate boundaries (`docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md` §"Phase 2 —
generate boundaries").

Done 2026-08-28: `tools/recompile/fnaf2-config.py` clears `write_objects` —
`get_missing_image` for placeholder image `(0,0)`, and an `init()` hook that
synthesizes `game.extensions` entries from the frame items (`Layer` → native
writer; `Multiple Touch` / `Android object` / `AndroidPlus` / `iOS Plus Object`
→ generic `ObjectWriter` stub). Converter now reaches event generation.

The `write_loops` crash is root-caused (2026-08-28): build 296's event format is
a **build-293 → 296 `mmfparser` port**, not a small fix. Raw evidence captured;
see `docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md` §"Phase 2 — third boundary: the
mobile event format" for the byte table.

Port strategy decided (2026-08-28): no maintained Python decompiler exists;
`AITYunivers/NebulaFD` (C#, active) reads build-296 Android CCN. **Port the
bundled `mmfparser` in place, using NebulaFD's C# readers as the byte-layout
spec** — keeps the pipeline Python-in-Docker, no runtime dep, no adapter. Specs
already pulled (see `IN-ENGINE-PILOT-RECOMPILE.md` §"Tooling survey").

Next:

1. Apply to the mmfparser mobile patch: parameter codes 67/70/26→Int,
   68→`ParameterVariables`, 69→`ParameterChildEvent`, 72→`Zone`; frame chunk
   `0x334C` (13132) → `FrameHandle` (int32).
2. Patch Chowdren's `write_loops` / `StartLoop` to key loops on `loop_<index>`
   (mobile loop code 11 → `Short` is correct by design, not a bug).
3. Rebuild, rerun `chowdren.run --config tools/recompile/fnaf2-config.py <owned-ccn> <gamesrc>`,
   record the next event-generation boundary. Keep going per the Phase gates table
   until a desktop target builds and boots to a night.
4. Replace the `Multiple Touch` stub with the real pilot input hook (WP4) once
   events generate.
5. Fallback if silent mis-parses are pervasive: NebulaFD → MFA → licensed Fusion
   2.5 → re-export a desktop CCN Chowdren fully supports.
6. Historical toolchain reference (still valid): `fnmwolf/Anaconda` `9b00bb4`
   builds all 17 mmfparser modules under a Debian-archive-adjusted
   `python:2.7-slim` container after the Cython API fix; see
   [`IN-ENGINE-PILOT-RECOMPILE.md`](../docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md#public-toolchain-recheck-2026-08-28-mac-arm64).

## Done when

An installed personal research APK observes authoritative game state, makes and
executes a closed-loop decision in process, and emits an auditable trace, with its
fidelity class and stock cross-check recorded. A single route being blocked does not
close the plan while another materially different same-process route remains.
