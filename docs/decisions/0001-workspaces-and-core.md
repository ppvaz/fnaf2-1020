# ADR 0001: Workspaces and canonical core

**Status:** accepted for the architecture refactor
**Decision:** use private npm workspaces with `@fnaf2-1020/core` as the sole
owner of mechanics, semantic actions, and evidence-labelled model contracts.

## Context

The original `src/` mixed the exact model with browser presentation, while
research and device tools imported those paths directly. That made the trainer
look like the project owner and allowed physical assumptions to leak into
policy code.

## Consequences

`npm ci` is the canonical clean-checkout bootstrap and the lockfile is checked
in. Core and trainer retain no runtime dependencies. The root source shims were
removed after the import-equivalence gate; only the explicitly named legacy
device launcher remains as a diagnostic boundary. Applications select adapters
through profiles and retain their resolved hashes. Python, Java, C, and shell
remain at runtime boundaries where their ecosystems or process locality justify
them.
