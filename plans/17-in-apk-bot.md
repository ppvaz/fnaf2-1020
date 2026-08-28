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
  sheet and has a mobile-build mmfparser patch.
- Chowdren is a viable CCN-to-C++ research route, but it uses a reimplemented
  runtime and has not yet generated and booted this game.
- Direct state targets already have names and source mappings: `viewing`, `mask`,
  Foxy `D`, music-box state, office occupants and battery life.

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

## Route matrix

Treat these as parallel hypotheses and kill each only with a reproducible probe:

1. **Modified retail package:** smallest possible resource/dex/native change,
   followed by signature/install/launch logging to localize the actual integrity
   failure rather than treating “PAIRIP” as one opaque wall.
2. **Runtime attachment:** rooted/in-process Java or native instrumentation that
   leaves the retail files intact and proves one read-only state observation before
   attempting control. Frida injected mode is the first probe; a package-scoped
   Zygisk/LSPosed module is the durable vehicle if the probe works.
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
   ADB timing as the control path.
5. **Bake the minimal bot.** Package an explicit, deterministic policy with a kill
   switch, bounded actions and a full decision/action trace. Start with a small
   scenario before a full night. **Gate:** the installed research APK completes the
   scenario repeatably and its trace replays against the sourced model.
6. **Fidelity and strategy campaign.** Compare state transitions and outcomes with
   the untouched stock package, document divergences, then use the in-APK bot to
   evaluate Plan 05 survivors and established baselines. **Gate:** every result is
   labeled retail-runtime, hooked-retail, rebuilt-runtime or model-only; no modified
   result is promoted as stock evidence without a stock cross-check.

## Focus rule

Until package 2 identifies a viable observation route, the next session on this plan
does not add trainer UI, generalized controller architecture, or another external
sensor. It advances the smallest boot/read probe on the highest-information route,
records the result, and immediately moves to the next route when the falsification
rule is met.

## Continue here

1. Convert the existing PAIRIP conclusion into the package-1/2 probe ledger: exact
   splits, hashes, install source, signature and crash stage.
2. Run the smallest read-only runtime-attachment probe because it tests same-process
   observation without first solving APK rewriting. This requires an explicitly
   approved rooted research device; otherwise skip directly to step 3.
3. In parallel only where it does not dilute that probe, recover the existing
   `mmfparser-mobile-ccn.patch` and apply it to Chowdren so the rebuild route retains
   a live fallback.

## Done when

An installed personal research APK observes authoritative game state, makes and
executes a closed-loop decision in process, and emits an auditable trace, with its
fidelity class and stock cross-check recorded. A single route being blocked does not
close the plan while another materially different same-process route remains.
