# The empirical landscape of Android game bots

**Commissioned and completed 2026-08-26.** A literature and public-code survey.
**Nothing in this document was run on this project's handset, and no number in
it is a measurement of this phone.**

This is the *integral* research report, retained in full. The project-specific
conclusions drawn from it — and the corrections applied to this repository as a
result — live in
[`docs/device/HID-MULTITOUCH.md`](../device/HID-MULTITOUCH.md) §"Prior art: is
any of this a solved problem elsewhere?". Read that first if you want the
answer; read this if you want the evidence, or if you are about to re-ask a
question someone already spent two hours on.

Three defects found in the first compression of this report into that section
were corrected on the same day: a mis-cited Alas "350 ms" claim, an overstated
causal link between phisap's Android 13 failure and the `raw_request()` bug, and
a framing that made phisap a stronger HID precedent than it is. Those
corrections are folded into the text below.

**Evidence labels used throughout:** **[V]** = the source or code was fetched and
read · **[C]** = claimed by a secondary source (forum/blog/video), no primary ·
**[I]** = inference · `UNKNOWN(reason)` where nothing checked out.

*Coverage note: the research session's WebSearch budget (200 calls) was
exhausted. Everything below is either fetched-and-read or explicitly labelled.
Negative results are "not found in the searches run", never proof of absence.*

---

## 1. The table of named projects

| Project | Game(s) | Sees with | Acts with | On-device / host | Emulator / physical | Real-time? | Alive (as of 2026-08-26) | Link |
|---|---|---|---|---|---|---|---|---|
| **phisap** | Phigros, Arcaea, Phira | **Nothing — parses the chart out of the APK/OBB offline** | scrcpy control protocol **or** an opt-in AOAv2 HID 10-contact touchscreen | host | **physical, non-rooted handset** | **Hard real-time** | **ARCHIVED 2024-03-07** [V] | [kvarenzn/phisap](https://github.com/kvarenzn/phisap) |
| **Autodori** | BanG Dream! | chart file | AutoTouch (jailbroken iOS); Android support struck through in README | host→device | physical iPad, **root/JB required** | real-time | stale, minimal [V] | [caca2331/Autodori](https://github.com/caca2331/Autodori-BanGDream-Autoplay) |
| **Denver Finn's Piano Tiles robot** | Piano Tiles (iPad) | **external iPhone 6+ camera, custom GPU app at 120 fps** | 4 stepper motors, brass bars + conductive foam, Teensy 3.2, MIDI-over-USB | host + hardware | **physical, hardware actuator** | **Hard real-time** | one-off, 2016 [V] | [Hackaday](https://hackaday.com/2016/04/28/robot-beats-piano-tiles/) |
| **Tapster / tapsterbot** | generic (Angry Birds, Flappy Bird demos) | host script / external camera | 3D-printed delta robot with capacitive stylus, USB serial | host + hardware | **physical** | no | commercial [C] | [tapsterbot](https://github.com/tapsterbot/tapsterbot), [tapster.io](https://tapster.io/) |
| **Pokémon Automation / ComputerControl** | Switch Pokémon | **capture card video feed** | ESP32 / Pico W emulating a USB or BT Pro Controller | host + hardware | physical console | frame-precise-ish (no published numbers) | alive [V] | [pokemonautomation.github.io](https://pokemonautomation.github.io/index.html) |
| **FGA (Fate/Grand Automata)** | Fate/Grand Order | **MediaProjection + OpenCV, on-device** | **AccessibilityService `dispatchGesture`** | **on-device (an APK)** | **physical handset, no root, Android 7+** | no (turn-based) | alive [V] | [Fate-Grand-Automata/FGA](https://github.com/Fate-Grand-Automata/FGA) |
| **MaaAssistantArknights** | Arknights | adb screencap variants + OpenCV template/OCR | MaaTouch > minitouch > `adb shell input` | host | emulator-preferred; physical "lower stability, not recommended" | no | very alive, 22.8k★ [V] | [MAA](https://github.com/MaaAssistantArknights/MaaAssistantArknights) |
| **MaaFramework** | generic (MAA's successor) | 7 adb + 6 Win32 + ScreenCaptureKit methods | AdbShell / MinitouchAndAdbKey / Maatouch / EmulatorExtras | host | emulator-preferred | no | very alive [V] | [MaaXYZ/MaaFramework](https://github.com/MaaXYZ/MaaFramework) |
| **Alas (AzurLaneAutoScript)** | Azur Lane | 10 methods incl. `nemu_ipc`, `ldopengl`, `DroidCast_raw` | **MaaTouch (default)**, minitouch, Hermit, u2, adb | host | **emulator strongly preferred; physical-handset support explicitly abandoned** | no | very alive [V] | [LmeSzinc/AzurLaneAutoScript](https://github.com/LmeSzinc/AzurLaneAutoScript) |
| **AutoX.js** (`aiselp/AutoX`) | generic, China | MediaProjection→VirtualDisplay→ImageReader, on-device OpenCV | AccessibilityService gestures; **root** path writes evdev | **on-device** | physical handset | no | alive (v7.2.3, 2026-07-27) [V] | [aiselp/AutoX](https://github.com/aiselp/AutoX) |
| Auto.js original | — | — | — | — | — | — | **DEAD** — archived 2023-02-11, *source deleted*, Pro went closed [V] | [clearw5/Auto.js](https://github.com/clearw5/Auto.js) |
| **Airtest + Poco** (NetEase) | games broadly | minicap / javacap (Yosemite APK) / adb screencap | minitouch → **auto-switches to maxtouch at SDK ≥ 29** | host | both | no | Airtest slowing; **Poco frozen 2024-01-08** [V] | [AirtestProject/Airtest](https://github.com/AirtestProject/Airtest) |
| **ClashRoyaleBuildABot** | Clash Royale | adb screencap + **YOLOv10** | adb input | host | **emulator (BlueStacks); phone support is an open TODO ([#249](https://github.com/Pbatch/ClashRoyaleBuildABot/issues/249))** | soft real-time | alive [V] | [Pbatch/ClashRoyaleBuildABot](https://github.com/Pbatch/ClashRoyaleBuildABot) |
| **MyBot.run** | Clash of Clans | desktop pixel/image match on the **emulator window** (AutoIt) | window clicks | host | **emulator only** | no | historic; GPLv3 [C] | [MyBotRun/MyBot](https://github.com/MyBotRun/MyBot) |
| **PokemonGo-Bot / NecroBot** | Pokémon GO | **not the screen — reverse-engineered protobuf API** | HTTP requests | host | n/a | no | **DEAD** — legal threats, bans [C] | [NecroBot](https://github.com/NecronomiconCoding/NecroBot) |
| **scrcpy** | (infrastructure) | H.264 Surface stream, 35–70 ms latency | `InputManager.injectInputEvent`; UHID/AOA for **kbd, mouse, gamepad only** | host | physical-first | n/a | very alive, 148k★ [V] | [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) |
| **minitouch** | (infrastructure) | — | **libevdev writes to `/dev/input/event*`** | on-device binary | both | — | repo alive, **broken on Android 10+ under SELinux enforcing** [V] | [DeviceFarmer/minitouch](https://github.com/DeviceFarmer/minitouch) |
| **MaaTouch** | (infrastructure) | — | `app_process` as `shell` UID + reflection into `injectInputEvent` | on-device jar | both | — | frozen 2024-03-09, in production everywhere [V] | [MaaTouch](https://github.com/MaaAssistantArknights/MaaTouch) |
| **minicap** | (infrastructure) | ScreenshotClient / VirtualDisplay, JPEG | — | on-device binary | **"Emulators are not supported"** | — | alive [V] | [DeviceFarmer/minicap](https://github.com/DeviceFarmer/minicap) |
| **uiautomator2 / adbutils** | (infrastructure) | UiAutomator hierarchy | UiAutomator | host | physical | no | alive; **atx-agent ARCHIVED** [V] | [openatx/uiautomator2](https://github.com/openatx/uiautomator2) |
| **SikuliX → Oculix** | desktop/emulator | host-side OpenCV | desktop mouse/kbd, ADB layer | host | emulator for Android | no | **SikuliX handed off**; successor [Oculix](https://github.com/oculix-org/Oculix) [V] | — |
| **droidbot** | app crawling | hierarchy (+OpenCV cv mode) | adb input | host | both | no | **DEAD** 2023-11-15 [V] | [honeynet/droidbot](https://github.com/honeynet/droidbot) |
| **Frida / objection** | in-process | process memory | function hooks | both | both | n/a | very alive [V] | [frida/frida](https://github.com/frida/frida) |
| **GameGuardian** | in-process | memory scan | memory writes | on-device, **root or virtual space** | physical/emulator | n/a | alive [C] | gameguardian.net |

---

## 2. What each family actually achieves

### Screen-reading + touch-injection bots

This is the mainstream, and it is almost entirely **turn-based or menu-driven**:
Arknights, Azur Lane, FGO, AFK Journey, Clash of Clans. The loop is *screenshot
→ OpenCV template match → tap → sleep*. The published performance bar tells you
why nobody real-time lives here. Alas's own benchmark grades a **click under
100 ms as "Fast"** and a **screenshot under 300 ms as "Fast"**; its scale only
reaches "Insane Fast" below 25 ms
[V, [benchmark.py](https://github.com/LmeSzinc/AzurLaneAutoScript/blob/master/module/daemon/benchmark.py)].

Corroborating numbers: Appium measured `adb screencap` at **~350 ms** average on
an accelerated emulator with "pretty beefy hardware", and an MJPEG server at
**~150 ms**
[V, [appiumpro](https://appiumpro.com/editions/83-speeding-up-android-screenshots-with-mjpeg-servers)].
One archived benchmark puts `sendevent` taps at **109 ms ± 4.6** against
`adb shell input tap` at **197 ms ± 1.5** on BlueStacks
[V that the numbers are stated; the measurement itself is [C] and uncorroborated,
[hansalemaos/sendevent_touch](https://github.com/hansalemaos/sendevent_touch)].
minicap self-reports 10–20 fps on weak devices, 30–40 on newer, and is "one to a
few frames behind" [V].

**Pokémon GO is the family's great exception and worth understanding
correctly**: it was never a screen+touch ecosystem. PokemonGo-Bot, NecroBot and
the rest spoke the reverse-engineered protobuf API directly. Community reports
say screen-based detection was tried and abandoned because *"graphics in the
game use thousands of different shades to appear as solid colors, apparently
done on purpose"* [C, no primary source]. PGSharp and iPogo are modified
clients, not bots.

### Framework / tooling layer

**The one architectural fact worth carrying away: there are exactly two ways to
put a touch contact on an unrooted Android device.**

- **(a) evdev writes to `/dev/input` as the `shell` user** — minitouch.
  Indistinguishable from a finger at every level. But minitouch's own README
  says *"Minitouch can't handle Android 10 by default, due to a new security
  policy"*, requiring an STFService bridge [V]. MAA's docs put it flatly:
  *"Starting from Android 10, Minitouch is no longer available when SELinux is
  in Enforcing mode"*
  [V, [docs.maa.plus](https://docs.maa.plus/en-us/manual/device/android.html)].
- **(b) `app_process` + hidden-API reflection into
  `InputManager.injectInputEvent`** — MaaTouch, scrcpy's `sdk` mode, Airtest's
  maxtouch. Works everywhere post-Android-10. This is why Airtest silently
  rewrites `MINITOUCH → MAXTOUCH` at SDK ≥ 29 [V, source] and why Alas defaults
  to MaaTouch.

**Nobody in the mainstream framework layer injects touch over UHID or AOA HID —
scrcpy included.** scrcpy offers UHID and AOA for keyboard, mouse and gamepad; a
**touchscreen mode does not exist** in `mouse.md`, `gamepad.md` or `otg.md`
[V, exhaustive read]. MaaFramework's entire `MaaAdbInputMethod` enum is
`{AdbShell, MinitouchAndAdbKey, Maatouch, EmulatorExtras}` — HID is not in the
design space
[V, [MaaDef.h](https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h)].

**Alive/dead in one line.** *Alive:* scrcpy, MAA/MaaFramework, Alas, Appium,
uiautomator2/adbutils, AutoX.js (`aiselp` fork), Frida, DeviceFarmer's
minicap/minitouch, Oculix. *Dead or frozen:* Auto.js original (archived, source
deleted), `kkevsekk1/AutoX` (**404, deleted** — the fork everyone still links
to), Poco (2024-01-08), atx-agent, droidbot (2023-11-15), py-scrcpy-client, the
Appium-AltUnity bridge.

### The in-process / memory route as a contrast

Frida + Il2CppDumper + Ghidra against Unity IL2CPP is the standard toolchain;
the worked public example hooks `SetRole()`/`SetName()` in Among Us to read
state the screen never shows
[V, [bananamafia.dev](https://bananamafia.dev/post/frida-unity/)]. GameGuardian
is the no-code equivalent.

On "when must you drop to this level because screen+touch is too slow" —
**UNKNOWN (no writeup found that argues it on latency grounds)**. Every source
found argues it on *information* grounds: memory sees state the screen cannot
show. That is a different argument than the one you would need.

### Emulator vs. physical handset

Be honest about how lopsided this is.

- **Alas dropped physical-handset support outright.** Its wiki: 在安卓真机运行
  Alas 的方案已经被放弃 ("the scheme for running Alas on a real Android device has
  been abandoned") — reasons given are VMOS crashing on long runs and thermal
  wear costing more than a cloud phone. On the split-device variant:
  这个方案需要占用两个设备，安卓机不能熄屏运行，真机截图也是非常慢，因此很少有人使用
  — "occupies two devices, the phone can't run with the screen off,
  **screenshotting a real device is also very slow**, so very few people use it"
  [V, [Emulator_cn](https://github.com/LmeSzinc/AzurLaneAutoScript/wiki/Emulator_cn)].
- **MAA:** physical device via ADB *"has lower stability, and still requires
  computer connection. Not recommended for beginners"*, and *"MAA primarily works
  in PC emulator environments, so there are no plans to fix"* device-specific
  bugs [V].
- **ClashRoyaleBuildABot:** step 1 of setup is the Emulator Setup Guide; running
  on a phone is a *future* feature.
- The fastest capture paths in the field are **emulator-exclusive by
  construction**: `nemu_ipc` is a ctypes call into MuMu 12's shared-memory DLL,
  `ldopengl` is LDPlayer 9's equivalent, MaaFramework's `EmulatorExtras` is
  MuMu 12 / LDPlayer 9 / AVD only [V].
- Delicious inversion: **minicap explicitly does *not* support emulators** [V].
  So the on-device fast path and the emulator fast path are disjoint.

**The physical-handset choice is unusual.** The successful exception is FGA —
and it works because FGO is turn-based and because it runs entirely on-device
(MediaProjection + AccessibilityService), never paying the adb round-trip.

### What breaks them

**Identity, not timing, is the real detection surface.** The precise answer to
"can an app tell a synthetic touch from a real one":

- Android's InputDispatcher **deliberately** stamps injected events with
  `deviceId = VIRTUAL_KEYBOARD_ID = -1`. `InputDispatcher.cpp:4847`: *"For all
  injected events, set device id = VIRTUAL_KEYBOARD_ID. The only exception is
  events that have gone through the InputFilter."* `:4853` is
  `DeviceId resolvedDeviceId = VIRTUAL_KEYBOARD_ID;`, overridden only under
  `POLICY_FLAG_FILTERED`. `VIRTUAL_KEYBOARD_ID = -1` at
  [`include/input/InputDevice.h:426`](https://android.googlesource.com/platform/frameworks/native/+/main/include/input/InputDevice.h).
  Corroborated twice more: `InputDevice.isVirtual()` is `return mId < 0`, and
  `KeyCharacterMap.VIRTUAL_KEYBOARD = -1`. `InputEvent.getDeviceId()` is public
  API. **Every `adb shell input` tap, every MaaTouch/scrcpy-sdk/maxtouch
  contact, reads as `-1`.** [V]
- Accessibility-injected touches additionally carry
  `FLAG_IS_ACCESSIBILITY_EVENT = 0x800` (confirmed in `MotionEvent.java`,
  `@hide` `@TestApi`). `getFlags()` is public — so
  `(ev.getFlags() & 0x800) != 0` is a one-line, permissionless bot check that
  hits FGA-class bots dead-on. [V]
- **The escape hatch is exactly uinput/AOA HID.** scrcpy contributor yume-chan,
  in [PR #3758](https://github.com/Genymobile/scrcpy/pull/3758): *"Android set
  device id of all injected events to -1, unless the event is from InputFilter
  (accessibility service)... The only method to get real device id is using AOA
  HID or uinput."* He also *tested* the proposed change and confirmed the device
  ID stayed `-1`. The PR is open/unmerged. [V]
- Play Integrity's `appAccessRiskVerdict` now reports
  `KNOWN_/UNKNOWN_CAPTURING` and `KNOWN_/UNKNOWN_CONTROLLING` — i.e. Google
  ships first-party detection of exactly the MediaProjection +
  AccessibilityService bot shape
  [V, [verdicts](https://developer.android.com/google/play/integrity/verdicts)].
  SafetyNet was hard-shut-down 31 January 2025 [V].
- **Timing-based detection: UNKNOWN.** No writeup, vendor page, or postmortem
  was found describing an Android game banning a bot on the regularity or
  superhuman precision of its touch stream. The identity signals above are
  cheaper and exact, so there is little incentive. Treat as "not found", not
  "does not exist".
- Ban history that *is* documented: Niantic actioned **>500K accounts** in Aug
  2019 and **>5 million cheaters** since the start of 2020 [V]. Supercell:
  *"we will run regular ban waves"* [V]. Project Sekai's guidelines explicitly
  prohibit BOT・マクロなどの外部ツールを使用した自動プレイ [V]. MAA's ToS concedes
  某些搭载客户端反作弊系统的游戏可能会将 MAA 错误判定为作弊工具. **Alas's README says
  nothing at all about ban risk (verified absence).** The premise that lowiro
  has publicly banned Arcaea cheaters did **not** verify from a primary source.
- Practical breakage: MAA supports **16:9 only** and warns that force-changing
  resolution "may cause the device to malfunction"; Alas requires exactly
  1280×720. Alas's wiki notes that **some phones' dark mode shifts in-game
  colours and breaks screenshots** — a pure physical-handset hazard. MAA
  v6.2.3's notes: *"this time game update yj modified the pause button's
  position, we have fixed this issue through a hot update"*. MaaFramework warns
  its two fastest capture methods use lossy JPEG which *"significantly reduces
  template matching effectiveness"* [all V].
- On dropped taps, the Unity Input System docs state the mechanism verbatim:
  *"If you read out touch state from `Touchscreen` directly inside of the
  `Update` or `FixedUpdate` methods, your app will miss changes in touch
  state."*
  [V, [Touch support](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.7/manual/Touch.html)]

---

## 3. Closest analogues

### 1. phisap — the near-exact match, and it is archived

[kvarenzn/phisap](https://github.com/kvarenzn/phisap). Host-driven, **physical
non-rooted handset**, hard-real-time rhythm game.

**Be precise about how much of a precedent it is.** Its *default* transport was
scrcpy's control protocol, and that is what its setup instructions require. The
HID path was **opt-in and late**: added in v0.18 (2023-08-12) as backend
`otg/hid`, a 10-contact AOAv2 touchscreen it wrote itself — report descriptor
and all, documented in [`hid.md`](https://github.com/kvarenzn/phisap/blob/dev/hid.md):
Contact Identifier (4 bits, 0–9), Tip Switch, In Range, 16-bit X/Y, 50-byte
reports, ~50 KB/s at 1 kHz. Its stated reason was not speed but avoiding USB
debugging: 可以一定程度上避免某些游戏的作弊检测 ("to some degree avoids some
games' cheat detection"). The project's real-time results predate the HID
backend entirely.

**Its author pointedly did not claim a latency win from it:**
或许可以一定程度上提升触控事件发送效率（？待确认） — *"may somewhat improve
touch-event send efficiency (? to be confirmed)."* **The only person who has
built this never confirmed HID was faster.**

What transfers:

- **Actuation was never the bottleneck; clock sync was.** phisap's timer is
  started *by a human pressing space* as the first note approaches the judgment
  line, with a manual fine-tune offset. The README's standing plea:
  如果你知道怎样实现不 root 的前提下精确获知当前曲目进度... 请开 issue 告知我做法 —
  "if you know how to precisely determine the current song progress without
  root, tell me."
- **Its diagnostic is the graded-interval rule in miniature:**
  如果你发现 phisap 打出了 FULL COMBO，但并没有 AP，这一定说明你的计时器同步没有做好
  — Full Combo but not All-Perfect **always** means the timer sync is off, never
  the plan.
- **The hard algorithmic work is pointer-pool scheduling, not timing.** From its
  [QA.md](https://github.com/kvarenzn/phisap/blob/stable/QA.md): Android allows
  at most 10 simultaneous pointers; a MOVE on a pointer that isn't DOWN is
  silently discarded; and you cannot cheat a drag as a tap because it
  prematurely triggers any overlapping tap's judgment. Charts needing >10
  concurrent notes must have their contacts *merged*.
- **The HID backend broke and was never fixed.** Sticky notice, 2023-09-29:
  after upgrading to Android 13 (crDroid 9.9),
  原本于 Android 10 下可以正常工作的 OTG/HID 后端完全报废，表现为通过 AOAv2 协议注册多点触控设备失败
  — the AOAv2 multitouch registration fails outright. The scrcpy backend still
  worked. **The author never diagnosed it** — the notice says he was still
  investigating (正在全力排查) and there are no later entries. The repo was
  archived 2024-03-07.
- **A separate, well-documented AOA-HID failure class** does trace to vendors
  omitting the `raw_request` callback in `f_accessory.c`, documented by scrcpy's
  author at [rom1v/aoa-hid-bug](https://github.com/rom1v/aoa-hid-bug) (a *pipe
  error*, Samsung 2017-era devices). **Two independent ways for the same
  transport to fail** — joining them into one diagnosis would assert something
  nobody established.
- **Physical-handset-only hazards invisible in a simulator:**
  有可能因误触发三指截屏或通知中心而导致 miss — accidental three-finger-screenshot or
  notification-shade triggers cause misses, vendor- and model-dependent. Open
  issues also report it simply not working on Xiaomi 12S Pro / HyperOS /
  Android 14, and touch-coordinate offset on both emulator and real device.
- The HID backend **cannot query the screen resolution**, so it must be typed in
  by hand, and only one landscape orientation was ever supported.

### 2. Denver Finn's Piano Tiles robot — the actuator escape hatch, done properly

[Hackaday, 2016](https://hackaday.com/2016/04/28/robot-beats-piano-tiles/). Four
stepper motors with brass bars and conductive-foam pads, copper tape under the
iPad for capacitive coupling, a Teensy 3.2, and an **iPhone 6+ overhead running
a GPU app at 120 fps** — deliberately oversampling the iPad's 60 Hz refresh. It
sends a MIDI note per detected tile *with the time-to-hit encoded in the
velocity*, and the Teensy computes the acceleration to arrive at that instant.

What transfers: (a) it **looks ahead** to cover comms delay *plus* actuator
swing time rather than reacting; (b) it models the **display**, not just the
input — LCD persistence smears about three frames together, and deferred
tile-based rendering means the screen is not coherent at any instant; (c) the
touch sampler running at 60 Hz creates genuine Nyquist aliasing at high tile
speeds. If a classifier reads a phone screen, all three apply and none appear in
a frame-counting simulator.

### 3. Pokémon Automation / ComputerControl — the mature host+HID+capture-card program

[pokemonautomation.github.io](https://pokemonautomation.github.io/index.html).
Capture card for vision, ESP32/Pico W emulating a USB or Bluetooth Pro
Controller for actuation, a large library of shiny-hunting and date-skip
programs. Architecturally the same shape, on a different console.
**UNKNOWN(no latency, video-delay, or frame-budget figures published on the
site)** — which is itself informative: a big, working, host-driven hardware bot
program that does not publish an actuation budget.

### 4. FGA — proof the physical handset works, and why

[Fate-Grand-Automata/FGA](https://github.com/Fate-Grand-Automata/FGA). The one
large-scale successful physical-handset bot: MediaProjection + OpenCV +
AccessibilityService, on-device, no root, Android 7+, with a zero-copy path
(OpenCV `Mat` wrapping the `ImageReader` buffer directly, 2-buffer queue with
`acquireLatestImage()` to drop stale frames) [C — DeepWiki summary; FGA's source
was not read]. **It works because FGO is turn-based.** And it sits on the wrong
side of the detection line: every gesture it dispatches carries
`FLAG_IS_ACCESSIBILITY_EVENT`.

### 5. Alas — the negative analogue

The most engineered bot in the field looked at physical handsets and walked
away, in writing, for reasons that are precisely ours: screenshots on a real
device are very slow, the screen cannot be off, and the hardware wears out. Its
"Fast" bar for a click is under 100 ms.

---

## 4. Verdict

**The combination — physical stock handset + raw HID/uinput touch injection +
real-time reaction — has been attempted publicly, by one person, once, as an
opt-in backend, and it is not currently working anywhere I could find.**

That single instance is phisap's `otg/hid` backend: a 10-contact AOAv2 HID
touchscreen driving an unrooted phone for a rhythm game. It worked on Android
10, broke on Android 13, was never fixed, and the project was archived five
months later. Everything else in the field is one of: emulator + adb; physical
device + adb (turn-based); on-device accessibility service (turn-based); a
hardware actuator against the glass; or an in-process memory hook.

**Why others avoided it, in descending order of how well-evidenced the reason
is:**

1. **The frameworks never offered it.** scrcpy — the reference implementation
   for host-driven physical-handset control, 148k stars — ships UHID and AOA for
   keyboard, mouse and gamepad and has **no touchscreen mode at all**;
   multitouch is a long-open feature request. MaaFramework's input enum has no
   HID entry. So anyone choosing this route writes the HID stack themselves,
   from the USB HID spec and AOAv2 docs, as phisap did.
2. **AOA HID is not portable.** scrcpy's author maintains a whole repository
   documenting AOA-HID failing device after device with a *pipe error* because
   vendors ship kernels missing `raw_request()`. phisap hit an independent
   Android-13 registration failure. That is a bet on an interface OEMs do not
   test. *(Note: this is an argument against AOAv2 specifically, not against
   uhid — see the project's own note in `HID-MULTITOUCH.md`.)*
3. **The mainstream didn't need the latency.** Nearly every successful bot
   targets a turn-based or menu-driven game where a 200 ms tap and a 300 ms
   screenshot are, in Alas's own vocabulary, "Fast". If you never need to react
   inside a frame, `adb shell input` is fine and HID is pure cost.
4. **The real-time cases route around vision entirely.** phisap and Autodori —
   both rhythm games, both real-time — read the *chart file* and replay a
   pre-computed schedule. They never sample the screen. The only screen-reading
   real-time bot found is the Piano Tiles robot, which solved it with an
   external 120 fps camera because reading the phone's own framebuffer fast
   enough was not on the table.
5. **Emulators make the whole problem disappear.** `nemu_ipc` and `ldopengl`
   read the guest framebuffer out of shared memory; there is no round-trip to
   pay. Given that, the physical handset has to be a requirement, not a
   preference.

**Two things that could not be established, flagged rather than guessed:** there
is no documented case of an Android game detecting a bot by input *timing* (only
by input *identity*), and there is no published per-method millisecond table for
Alas — the widely circulated one has no primary source, and DeepWiki's confident
version is LLM-generated and contradicts the repo's own config.
