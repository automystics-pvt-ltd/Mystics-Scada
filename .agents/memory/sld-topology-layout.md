---
name: SLD graph layout and breaker semantics
description: Patterns for laying out a hierarchical single-line-diagram graph and correctly modeling grid-breaker/energization state from per-device health.
---

**Layout**: when a diagram has a widest "leaf" layer (e.g. inverters) feeding a
narrower parent layer (combiner/array) plus a separate single-chain tail
(transformer/switchyard/grid), don't seed columns from the numerically
"deepest" level — seed from the *widest* level, then derive every other
node's column as the average of the children/neighbors that feed it. Always
add an explicit fallback for nodes with zero children (e.g. spread by sibling
index) — averaging an empty list silently collapses to 0 and stacks nodes on
top of each other whenever a plant's configured combiner/inverter counts
don't divide evenly.

**Breaker/disconnection semantics**: never derive a plant-wide "grid breaker
open" / "disconnected" state from a single-device worst-case health rollup
(e.g. "any inverter offline"). That falsely shows the whole plant tripped off
the grid while other inverters are still generating. Gate breaker state and
edge energization on a stricter, plant-wide condition (e.g. *all* inverters
offline), and let per-node status/coloring use the worst-case rollup
separately for visual warnings.

**Why**: caught in code review while building a richer SLD (node/edge graph
with animated power flow) for a solar SCADA app — both mistakes passed
typecheck and looked fine in the happy-path screenshot, but broke under edge
cases (low inverter counts, partial outages).
