# Contributions

Tracking ledger for giving back to the communities whose work this project builds
on. Every upstreamable patch, doc note, or finding produced along the way gets an
entry here so nothing useful dies in a scratchpad.

**House rules:** contributions contain only code patches and derived knowledge —
no game assets, no decompiled content, ever.

## Status legend

| Status | Meaning |
| --- | --- |
| candidate | Identified as worth contributing; artifact exists but nothing filed |
| prepared | Cleaned up into a submittable form (patch/PR branch/wiki draft) |
| submitted | PR, issue, or wiki edit is up and awaiting review |
| merged | Accepted upstream |

Each entry also carries a **Disposition**: how it should be published — upstream
PR, maintained fork, or a new tool repo of Pedro's own.

## Publication plan

The split, in one place:

- **Upstream PRs → CTFAK/CTFAK2.0:** the Linux port, the FTDecompile
  null-guards, and the headless usage docs note (entries 1–3). Small,
  defensible diffs. Caveat: upstream's last push was 2024-11; if the PR sits
  unreviewed, fall back to a maintained fork (e.g.
  `github.com/<pedro>/CTFAK2.0`, branch `linux-port`).
- **Pedro's own fork (no PR):** the Anaconda/mmfparser mobile-CCN patches
  (entry 4) — both existing forks are dormant/personal and the original
  matpow2 repo is gone; there is no live upstream to PR against.
- **Pedro's own new tool repo:** the CCN event dumper (entry 5), MIT-licensed,
  bundling the mmfparser fork, the dumper, the build recipe, and format docs.
- **Wiki edits / talk-page writeups (not a repo):** the mobile-build
  divergences and mechanics confirmations (entry 6).

## Entries

### 1. CTFAK Linux port — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0) (GitHub)
- **What it is:** Linux port of CTFAK 2.2 as an 8-file patch:
  - csproj retarget `net6.0-windows` → `net6.0`.
  - Platform-guarded `CTFAKCore.Init`: system libz via Joveler instead of
    `x64\zlibwapi.dll`; skip the `CTFAK-Native.dll` preload — its `TranslateTo*`
    P/Invokes have no callers and `decompressOld` is only for pre-Fusion-2.0 games.
  - `System.Drawing.Common` 7.0.0-preview → 6.0.0 plus the
    `System.Drawing.EnableUnixSupport` runtimeconfig option (7.x removed Unix
    support).
  - `Resources/Editbox.png` case-sensitivity fix.
  - `DrawArt2` divide-by-zero fix (`Console.WindowWidth`/`WindowHeight` are 0 on
    headless terminals; the `coeff` was unused).
  - `Console.Title` guards.
- **Artifact today:** `~/fnaf-apks/ctfak-linux-port.patch` (source of truth)
- **Disposition:** upstream PR to CTFAK/CTFAK2.0 — small, defensible diffs.
  Caveat: upstream's last push was 2024-11; if the PR sits unreviewed, fall
  back to a maintained fork (e.g. `github.com/<pedro>/CTFAK2.0`, branch
  `linux-port`).

### 2. CTFAK mobile-CCN robustness — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0)
- **What it is:** Null-guards in `FTDecompile.cs` for mobile CCNs: extension
  objects referenced by Android builds but absent from the Extensions chunk
  crashed Export as MFA with a `NullReferenceException`; they are now
  placeholder-named and logged.
- **Artifact today:** included in the same patch file,
  `~/fnaf-apks/ctfak-linux-port.patch`
- **Disposition:** upstream PR to CTFAK/CTFAK2.0, same PR as the Linux port;
  same fork fallback as entry 1 if it sits unreviewed.

### 3. CTFAK headless usage note — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0) docs
- **What it is:** The interactive menu's `Console.ReadLine` never receives piped
  stdin under Wine; the `-path` / `-tool "Export as MFA"` / `-closeonfinish`
  flags are the reliable non-interactive path.
- **Artifact today:** knowledge only; this entry is the record.
- **Disposition:** fold into the same upstream PR as entries 1–2, or a
  follow-up docs PR.

### 4. Anaconda/mmfparser mobile-CCN patches — **prepared** (working, needs export from scratchpad)

- **Target:** Anaconda/mmfparser lineage
  ([fnmwolf/Anaconda](https://github.com/fnmwolf/Anaconda) and
  [gfktrin/AnacondaDecompiler](https://github.com/gfktrin/AnacondaDecompiler)
  forks)
- **What it is:** the patch set now works end-to-end — all 33 FNaF 2 frames
  dump. Full current set:
  - `build.py` Cython 0.29 fix (`Options.directive_defaults` →
    `get_directive_defaults()`).
  - `movement.py` guards for unknown movement types and undecodable movement
    records in Android builds.
  - `events.pyx` Android quirks: `ERes` has 4 extra bytes before size; `ERev`
    size field is 4 short plus an extra leading group-count int; a no-progress
    guard replacing a silent infinite loop; removal of a `code.interact()`
    debugging trap; unknown-parameter-code skip in `Parameter.read`.
  - `objects.pyx` `ObjectCommon` Android build>=290 layout — a byte-level
    reverse-engineered field map that is **original research**, not present in
    CTFAK either (slots: 4 movements, 6 values, 10 counter, 12 systemObject,
    14 extension, 16 flags, 18 createFlags, 20 qualifiers[8], 36 animations,
    40 strings, 42 newFlags, 44 preferences, 46 identifier, 50 backColour,
    54 fadeIn, 58 fadeOut).
- **Artifact today:** patches live only in the session scratchpad copy of the
  fnmwolf/Anaconda clone — **still need to be exported to a durable patch file**.
- **Disposition:** Pedro's own fork, **not** a PR — both forks are
  dormant/personal and the original matpow2 repo is gone; there is no live
  upstream to PR against.

### 5. CCN event dumper — **candidate**

- **Target:** Pedro's own new tool repo (suggested name: `ccn-mobile-datamine`
  or similar)
- **What it is:** `dump_events.py` — Python 2.7 tool that drives the patched
  mmfparser and dumps per-frame readable event sheets plus the object list
  from an Android Clickteam CCN. Proven on FNaF 2: 33/33 frames, 25k lines of
  events.
- **Artifact today:** `~/fnaf-apks/dump_events.py`
- **Disposition:** new MIT-licensed tool repo bundling: the mmfparser fork as
  a git submodule or vendored subtree, `dump_events.py`, the build recipe
  (micromamba py27 + cython 0.29), and a README documenting the Android CCN
  format findings. Hard rule: the repo ships tooling and format documentation
  only — zero game assets or dumped game content.

### 6. Mobile-build divergences for the wiki — **candidate**

- **Target:** Technical-FNaF wiki / FNaF strategy community
- **What it is:** Once event-sheet constants are extracted and compared against
  the PC-1.033-derived wiki values: document mobile-build divergences (timer
  values, AI check cadence, Golden Freddy window, forcedown pacing) as derived
  constants and mechanics only — never extracted assets. Also worth publishing:
  the discovery that the shipped Android build derives from an August 2025
  "release 7" Clickteam project revision (embedded path
  `D:\Work\+Clickteam\+ProfessionalServices\...\release 7\FNaF2_mobile_20250825.mfa`,
  Fusion build 296), meaning PC-sourced strategy claims must be re-verified
  against mobile.
- **First confirmed extraction result:** the Office frame contains the
  movement-opportunity check as "every 5000ms: `Random(20)+1` vs
  `CounterValue[new Freddy AI]`" — decompile-grade confirmation of the
  community's 5-second-cycle claim, from the mobile build.
- **Artifact today:** the 5000ms check is confirmed; the rest is pending the
  full constants-extraction pass. The release-7 provenance finding is already
  established.
- **Disposition:** wiki edits / talk-page writeups, not a repo.
