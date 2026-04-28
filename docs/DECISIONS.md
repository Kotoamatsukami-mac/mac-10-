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
