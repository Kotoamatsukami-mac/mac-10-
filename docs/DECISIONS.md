# Macten Architecture Decision Records

## ADR-001 — Phase 2 is Native Environment Index, not a flat Native Lexicon

**Date:** 2026-04-28 **Status:** Accepted

### Decision

Phase 2 is the Native Environment Index. It is not a flat list of app names.

### Context

The original Phase 2 definition called for a "Native Lexicon" — a boot scan of /Applications that returned app names, folders, and services as a flat list.

This was rejected because a flat list creates weak legs under the interpretation layer. The interpreter reading against a static name list cannot:

- Know if an app is currently running vs just installed
- Know what the user actually uses vs what is installed
- Know whether Macten has permission to control something
- Distinguish between a mounted volume and a permanent folder
- Surface the right confidence level for a resolved command

A command interpreter that says "open Zoom and mute mic" but does not know whether Accessibility permission exists is architecturally weak.

### Correct framing

> The lexicon is not a list. It is a resolver-facing projection of the Mac's actual environment.

The Mac is the source of truth. The Native Environment Index is a cached and live-queried view of that truth, with different freshness rules per category.

### Four volatility classes

ClassRefresh modelStatic-ish InventoryScan on launchUser Preference SignalsScan on launchLive Runtime StateLive query alwaysPermission/Capability MapCheck on launch and before relevant actions

### Consequences

- The interpreter resolves against a typed NativeEnvironmentIndex, not a string list
- Different parts of the index refresh at different rates
- Permission state is a first-class citizen, not an afterthought
- Phase 3 interpretation layer is stronger because it knows what is possible, not just what exists

### What this prevents

- Interpreter confidently resolving a command that Macten cannot execute
- Stale app list missing recently installed apps
- No awareness of what the user actually uses vs what is installed
- Weak confidence scoring based on name matching alone

## ADR-002 — The strip is a single slab with a three-slot model

**Date:** 2026-05-04 **Status:** Accepted

### Decision

The Macten command strip is a single continuous slab divided only by spacing into three slots:

```text
[ .identity-dot ]  [ .input-wrap ]  [ .toolbar ]
```

Internal vertical dividers (hairlines, segment chips, Apple-Pay-style compartments) are forbidden. Slot separation is conveyed by the geometry of the elements themselves — a 5px luminous dot, an input baseline, a button group — not by lines.

### Context

PR #11 (`ui/mockup-shell-parity`) and earlier iterations carried a dual-element left edge: a `WindowDragHandle` (3-dot drag affordance) sitting next to a `lounge-strip__marker` (status pip). Together they read as a single ambiguous "cmd / symbol / icon / drag" cluster — the user described it as a *chipped* edge.

PR #12 (`ui/shell-composition-pass`) demolished that structure. By the time this ADR was written, the left edge had become a single `.cmd-mark` element rendering an inert ⌘ glyph behind a hairline divider — quieter, but still ambiguous. The glyph said nothing legible at 42% opacity, the divider made the strip read as two segments instead of one.

### Resolution

The crispness pass (commits `fa99160`, `5279708`) replaced the divided pill with a 5px `.identity-dot` whose color is bound to `status.kind`, removed the toolbar's mirroring `border-left`, removed per-row hairlines from the settings popover and help panel, and shrunk tool buttons from 36×36 to 32×32. The strip became a single slab with three slots and no internal dividers.

### Locked invariants

- One element, one role. The identity dot is the only left-edge element, and it owns status-as-identity. It does not also serve as a brand mark, drag handle, or decorative seal.
- No internal vertical dividers within the strip.
- Drag is ambient — owned by `.shell-stage` via `getCurrentWindow().startDragging()` — not a visible widget.
- Tool buttons stay between 28×28 and 40×40. New tool buttons must enter the doctrine document.
- New strip slots require an entry in `docs/UI_DOCTRINE.md` and an explicit ADR.

### Consequences

- The left edge no longer reads as a chipped two-segment chip.
- The strip reads as a unified surface end to end.
- Future agents arriving at the codebase have a definitive design contract in `docs/UI_DOCTRINE.md`.
- The status system gains a second projection surface (the dot) without adding a new state machine — it reads from the existing `status.kind`.

### What this prevents

- Decorative-glyph drift back into the left edge.
- Re-introduction of explicit drag handles or three-dot grab affordances.
- Apple-Pay-style segmented strip variants.
- Saturated hover halos that compete with the bottom rim accent.
- A second status projection layer that conflicts with the dot or the status chip.
