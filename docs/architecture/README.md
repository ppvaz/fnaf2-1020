# Current architecture

The repository is a private npm-workspaces monorepo. `@fnaf2-1020/core` is the
canonical model and semantic contract owner. Runtime and adapters consume it;
research and trainer consume core; the device app is the only composition root
that selects runtime, adapters, profiles, storage, and clocks.

```text
owned Android evidence -> core mechanics -> policy research
                                      -> human trainer
                                      -> stock-device controller
                                      -> future in-APK controller
                     every path -> replay / telemetry / grading / claim ceiling
```

Ports distinguish acquisition, detection, estimation, control, supervision,
scheduling, actuation, verification, and telemetry. Physical alternatives are
registered adapters with honest capabilities and calibration scope. Semantic
commands never contain coordinates, shell text, ADB commands, or HID bytes.

The [generated catalogs](generated/README.md) are executable views of current
package, command, contract, protocol, adapter, test, and responsibility data.
The [workspaces ADR](../decisions/0001-workspaces-and-core.md) records why the
development bootstrap is `npm ci` and why core/trainer have no runtime tools.
The [compatibility inventory](COMPATIBILITY.md) names the remaining legacy
launcher and its removal gate; the former root source shims are gone.
