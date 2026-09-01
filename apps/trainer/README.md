# `@fnaf2-1020/trainer`

The trainer is the public browser application under the Understanding layer.
It owns UI, touch input, audio, assets, curriculum, coaching, and trainer
traces. It does not own sourced mechanics, device profiles, policy authority,
or live actuation; those come from `@fnaf2-1020/core` and explicit device
services. The static HTML entry remains at the repository root for publishing,
while its browser modules live under this application.

Public API: the browser entry and `Coach` export from `src/index.js`.
Dependency: core only. Commands: root `build:trainer`, `serve:trainer`, and
`test:trainer`. Artifacts: the ignored single-file trainer bundle and optional
trace captures. This app does not own the canonical model, device execution,
or claim promotion.
