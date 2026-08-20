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
- **Artifact today:** `~/fnaf-apks/ctfak-linux-port.patch`

### 2. CTFAK mobile-CCN robustness — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0)
- **What it is:** Null-guards in `FTDecompile.cs` for mobile CCNs: extension
  objects referenced by Android builds but absent from the Extensions chunk
  crashed Export as MFA with a `NullReferenceException`; they are now
  placeholder-named and logged.
- **Artifact today:** included in the same patch file,
  `~/fnaf-apks/ctfak-linux-port.patch`

### 3. CTFAK headless usage note — **candidate**

- **Target:** [CTFAK/CTFAK2.0](https://github.com/CTFAK/CTFAK2.0) docs
- **What it is:** The interactive menu's `Console.ReadLine` never receives piped
  stdin under Wine; the `-path` / `-tool "Export as MFA"` / `-closeonfinish`
  flags are the reliable non-interactive path.
- **Artifact today:** knowledge only; this entry is the record.

### 4. Anaconda/mmfparser mobile-CCN patches — **candidate**

- **Target:** Anaconda/mmfparser lineage
  ([fnmwolf/Anaconda](https://github.com/fnmwolf/Anaconda) and
  [gfktrin/AnacondaDecompiler](https://github.com/gfktrin/AnacondaDecompiler)
  forks)
- **What it is:**
  - `movement.py` guards for unknown movement types and undecodable movement
    records in Android builds.
  - `events.pyx` Android quirks ported from CTFAK: `ERes` has 4 extra bytes
    before size; `ERev` size field is 4 short plus an extra leading
    group-count int; a no-progress guard replacing a silent infinite loop;
    removal of a `code.interact()` debugging trap.
  - Cython 0.29 build fix (`Options.directive_defaults` →
    `get_directive_defaults()`).
  - `ObjectCommon` Android build>=290 field-order support (in progress).
- **Artifact today:** patches live only in the session scratchpad copy of the
  fnmwolf/Anaconda clone — **still need to be exported to a durable patch file**.

### 5. Mobile-build divergences for the wiki — **candidate**

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
- **Artifact today:** pending — depends on the constants-extraction pass; the
  release-7 provenance finding is already established.
