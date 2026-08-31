# Core contract specifications

Every boundary below is versioned plain data plus a runtime validator and a
conformance fixture. TypeScript interfaces in `src/contracts/types.ts` protect
the local compilation graph; JSON/JSONL grammar and golden vectors protect
shell, Python, Java, C, and retained artifacts.

| Contract | Owner | Unknown/failure rule |
|---|---|---|
| `semantic-control-v1` | core | physical encoding is rejected |
| `measurement-v1` | core | `UNKNOWN` requires a reason and has no value |
| `actuation-result-v1` | core/adapters | send and game acceptance remain separate |
| `capability-v1` | adapters | absent capability fails closed |
| `device-profile-v1` | device | unresolved calibration/map is refused |
| `fact-message-v1` | core telemetry | malformed, oversized, or out-of-order frames are rejected |

The complete register, including process and retained-artifact contracts, is
[`register.json`](register.json). The existing Android, Python, Java, C, and
shell protocol implementations consume these stable IDs during migration;
cross-language changes require matching valid/invalid vectors. The generated
specification catalog is checked in at
[`docs/architecture/generated/contract-specifications.json`](../../../docs/architecture/generated/contract-specifications.json).
