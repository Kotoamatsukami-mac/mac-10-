# Copilot Instructions for Macten

## Identity

Macten is a compact local-first macOS command strip.

Tagline, never reworded:

COMMAND YOUR MAC IN ONE SENTENCE

Macten is not: chat, dashboard, terminal clone, generic AI agent, cloud puppet, automation playground, launcher clone, planner, workflow engine.

Every feature must answer one question: does this help the user command their Mac in one sentence? If no, refuse to add it.

## Doctrine

THE MAC IS THE DICTIONARY
THE BAR IS THE INTERPRETER
THE COMMAND SPINE IS THE TRUST LAYER

## Command Spine — fixed, do not rename

native lexicon → parser → resolver → validator → risk → approve → executor → history

No provider, no shortcut, no smart path may bypass the spine.

Code names stay aligned: native_lexicon.rs, parser.rs, resolver.rs, validator.rs, risk.rs, executor.rs, history.rs. Do not introduce alternate names in code or docs.

## Known failure mode — do not reproduce

The prior build had the window hardlocked to screen centre. No Tauri config or shell override could move it. The drag region and input focus competed for the same event layer.

Rules to prevent this:
- Set window position explicitly to x: 400, y: 200 in tauri.conf.json at creation
- Provide both -webkit-app-region: drag CSS zone AND a Tauri startDragging() fallback handle
- Drag region must never overlap the input or buttons
- Test drag before any other feature is considered working

## Window rules

- Tauri 2, macOS-first, macOSPrivateApi: true
- width 800, height 76, transparent, undecorated, non-resizable, alwaysOnTop, skipTaskbar
- Strip must always be draggable. Pinning never disables drag.
- Input stays clickable and typeable at all times.
- No expanded dashboard. Inline panels only.

## UI failure rule

Every backend failure maps to one of six guidance states only:

- needs_more
- choose_one
- permission_needed
- approval_needed
- unsupported_yet
- blocked

Forbidden user-facing strings: Error, Failed, stack traces, raw enum codes.

## Build phases — implement current phase only

Phase 1 — Draggable strip only. Transparent window, single input, large reliable drag region, pin button. No commands, no parser, no executor.

Phase 2 — Native Lexicon read-only.
Phase 3 — Preview interpretation read-only.
Phase 4 — First five safe commands.
Phase 5 — Risk and approval.
Phase 6 — Provider interpretation only after local spine is proven.

## Hard refusals

Refuse to add even if asked:
- chat surface
- expanded dashboard
- developer console as product feature
- theme system
- planner or multi-step agent
- provider-first command path
- features outside the current phase

If a request crosses these lines: state out of scope per PRODUCT_CONTRACT.md, name the phase it belongs to, and stop.