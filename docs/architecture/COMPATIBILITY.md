# Compatibility surface

This table is the bounded migration inventory. Every compatibility path has a
removal owner and gate; no compatibility export is a second authority.

| Surface | Canonical owner | Removal gate | Status |
|---|---|---|---|
| `tools/device/trial.sh` | `@fnaf2-1020/device` | P5 command and trace equivalence | short launcher |
| `tools/device/legacy-trial.sh` | `@fnaf2-1020/device` | P9 after live qualification | historical implementation |

The legacy campaign remains callable through explicit lanes for diagnosis. Its
results do not override the package contracts, dry-run claim ceiling, or the
current command registry. The root `src/` compatibility surface has been
removed; package and application imports are now canonical.
