# Macten

**COMMAND YOUR MAC IN ONE SENTENCE.**

Macten is a local-first macOS command runtime projected through a thin command strip. It resolves one sentence against the Mac's native environment, binds it to a known command contract, governs it, then dispatches one typed native action when allowed.

Built with Tauri 2, Rust, React, and TypeScript. macOS-first. Windows is not a current target.

## What it is

Macten is:

- a compact native command strip
- a local command runtime
- a trust-governed action spine
- a typed bridge to native Mac actions
- a memory-only preview surface while typing

## What it is not

Macten is not:

- chat
- a terminal clone
- a generic AI agent
- a dashboard
- a workflow-builder UI
- a shell-command passthrough
- a provider-first automation tool

## Current examples

```text
safari            → opens Safari
quit spotify      → reaches governor approval gate; inline Y/N UI is not built yet
hide slack        → hides Slack windows
focus chrome      → brings Chrome to the front
downloads         → opens ~/Downloads
youtube           → opens YouTube in your browser
sound             → opens Sound settings
volume 50         → sets system volume to 50%
mute              → mutes system audio
volume up         → steps volume up
yt                → opens YouTube (alias)
gpt               → opens ChatGPT (alias)
gh                → opens GitHub (alias)
```

## Architecture summary

```text
Native Environment Capture
→ Trust-Weighted Native Lexicon
→ Phrase Grammar
→ Native Symbol Binding
→ Intent / Target Semantic Analysis
→ Command Contract Binding
→ Capability Validation
→ Contextual Policy Governance
→ Approval + Execution Plan
→ Native Execution
→ Diagnostics + Event History + Undo Policy
→ Strip Projection
```

The strip is projection. The command spine is authority.

## Current submit spine

```text
resolveNow(submittedInput)
→ parseCommand(prediction)
→ validateCommand(parsed)
→ governCommand(parsed, validation, snapshot)
→ executeCommand(parsed) when allowed
→ recordAttempt(...)
→ statusFromOutcome(outcome)
```

A prediction is not authority. A command is not attempted until it passes structural validation and contextual governance.

## Claim standard

Repo docs use this distinction:

| Label | Meaning |
| --- | --- |
| Verified | Current repository behavior checked against code |
| Principle | Proven engineering rule applied to Macten |
| Future | Intended direction, not implemented yet |
| Known limitation | Real current gap |
| Do not introduce | Architectural drift path |

Do not document future work as current behavior.

## Core docs

| Doc | Purpose |
| --- | --- |
| `docs/PRODUCT_CONTRACT.md` | Product boundary and doctrine |
| `docs/RUNTIME_ARCHITECTURE.md` | Runtime architecture and performance invariants |
| `docs/COMMAND_SPINE.md` | Exact submit path and owner files |
| `docs/TRUST_MODEL.md` | Validation, governance, approval, undo, and history model |
| `docs/ACTION_SURFACE.md` | Current 12-action command surface |
| `docs/BUILD_PHASES.md` | Phase map and implementation status |

## Current action surface

The current surface is exactly 12 actions:

| Action | What it does | Risk |
| --- | --- | --- |
| `app.open` | Opens an installed application | safe |
| `app.quit` | Terminates a running app after approval is implemented | attention |
| `app.hide` | Hides an app's windows | safe |
| `app.focus` | Brings a running app to the front | safe |
| `folder.open` | Opens a folder in Finder | safe |
| `service.open` | Opens a URL in default browser | safe |
| `settings.open` | Opens a System Settings pane | safe |
| `volume.set` | Sets system volume from 0 to 100 | safe |
| `volume.mute` | Mutes system audio | safe |
| `volume.unmute` | Unmutes system audio | safe |
| `volume.step_up` | Steps volume up | safe |
| `volume.step_down` | Steps volume down | safe |

No new action exists unless it enters the command contract layer, validation, governance, executor stance, undo policy, tests, and docs.

## Execution boundary

Verified native bridge stance:

- open-style path/URL actions use typed Tauri commands
- app verbs use `NSRunningApplication`
- volume uses CoreAudio HAL
- app/folder path actions require a path
- service/settings URL actions require a URL
- app runtime verbs require a bundle ID
- volume set requires a numeric argument

No free-form shell command is part of the current execution boundary.

## Performance invariant

Preview must remain memory-only.

No native scan, filesystem crawl, permission probe, provider call, icon load, or full index rebuild may occur in the per-keystroke preview path.

## Dev

```bash
npm install
npm run tauri dev
```

## Checks

```bash
npx tsc --noEmit
npm test
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
```

## Current phase status

Implemented:

- draggable transparent strip
- Native Environment Index
- preview + ghost completion
- outcome feedback UI
- phrase grammar
- 12-action command surface
- live runtime app/frontmost hydration
- contextual governor v1
- undo policy table
- in-memory attempt history

Not complete yet:

- inline approval UI
- durable history ledger
- pre-state capture
- actual undo execution
- provider interpretation
- plugin system
- scheduled deep refresh
