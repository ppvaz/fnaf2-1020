# `@fnaf2-1020/screencheck`

The freestanding C/AArch64 screen classifier is an independently buildable
native boundary. It accepts framed RGBA fixtures or Android raw input and
emits versioned detector output. It has no dependency on core mechanics or
controller policy; the device visual adapter owns its process invocation.

Public API: detector contract constants from `src/index.js` and the native
stdin/stdout process. Dependency: the host C toolchain only. Commands:
`npm run --workspace @fnaf2-1020/screencheck build`, `npm run --workspace
@fnaf2-1020/screencheck test`, and the explicit-phone `bench` script. The
root contract lane still invokes the same host fixture while the legacy tool
path remains indexed for compatibility.
Artifacts are native binaries/capture outputs under ignored build or capture
directories. This package does not own capture acquisition, calibration data,
or lifecycle authority.
