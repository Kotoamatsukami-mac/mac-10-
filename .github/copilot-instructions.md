# Copilot Instructions for Macten

## Identity

Macten is a compact local-first macOS command strip.

Tagline, never reworded:

COMMAND YOUR MAC IN ONE SENTENCE

Macten is not: chat, dashboard, terminal clone, generic AI agent, cloud puppet, automation playground, launcher clone, planner, workflow engine.

Every feature must answer one question: does this help the user command their Mac in one sentence? If no, refuse to add it.

## Session rule

Before touching code:

1. `git pull origin main`
2. Read the exact files you are about to change.
3. Read the governance docs that apply to the task.
4. Work from repo truth, not memory of a prior session.

Governance priority:

1. `.github/copilot-instructions.md`
2. `docs/PRODUCT_CONTRACT.md`
3. `docs/BUILD_PHASES.md`
4. `docs/CHECKPOINT.md`
5. `docs/DECISIONS.md`
6. `docs/LESSONS.md`

If a proposed change contradicts governance, stop and say so. Do not silently override it.

## Doctrine

THE MAC IS THE DICTIONARY
THE BAR IS THE INTERPRETER
THE COMMAND SPINE IS THE TRUST LAYER

## Command Spine — fixed, do not rename

There are two related paths. Do not merge or confuse them.

Preview path, advisory only:

NativeEnvironmentSnapshot → NativeEnvironmentIndex → resolvePreview → PreviewPrediction → ghost completion

Submit path, execution capable:

resolveNow(currentInput) → parser → validator → risk → approve → executor → history

No provider, shortcut, UI helper, or smart path may bypass the submit spine.

Current TypeScript spine files live in `src/spine/`:

- `parser.ts`
- `registry.ts`
- `validator.ts`
- `risk.ts`
- `approve.ts`
- `executor.ts`
- `history.ts`
- `runSpine.ts`

Do not add stages, reorder stages, rename stages, or create a second spine.

## Current phase

Current phase: Phase 4 Slice 2 — outcome feedback in strip.

Already reachable through Enter:

- `app.open`
- `folder.open`
- `service.open`
- `settings.open`

Registered but intentionally inert:

- `volume.set` — placeholder only, `executable=false`, no native command yet.

Phase 4 Slice 1 is single-step only. No planner, no multi-step orchestration, no provider model, no destructive operations.

## Known failure mode — do not reproduce

The prior build had the window hardlocked to screen centre. No Tauri config or shell override could move it. The drag region and input focus competed for the same event layer.

Rules to prevent this:
- Set window position explicitly to x: 400, y: 200 in tauri.conf.json at creation
- Provide both -webkit-app-region: drag CSS zone AND a Tauri startDragging() fallback handle
- Drag region must never overlap the input or buttons
- Test drag before any other feature is considered working

## Window rules

- Tauri 2, macOS-first, macOSPrivateApi: true
- width 800, height 76, transparent, undecorated, non-resizable
- alwaysOnTop defaults false and is toggled only by the pin button through `set_pinned`
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

Phase 1 — Draggable strip. Complete.
Phase 2 — Native Environment Index. Complete.
Phase 3 — Preview interpretation and ghost completion UI. Complete.
Phase 4 — Safe local execution spine + outcome feedback. Current.
Phase 5 — Approval UI and stronger history/undo. Future.
Phase 6 — Provider interpretation only after local spine is proven. Future.

## Execution boundary

The Rust command surface is intentionally minimal.

Currently allowed execution commands:

- `executor_open_path`
- `executor_open_url`

Rules:

- `executor_open_path` requires the path to exist.
- `executor_open_url` only allows `http`, `https`, `mailto`, `tel`, and `x-apple.systempreferences` schemes.
- No AppleScript.
- No osascript.
- No free-form shell surface.
- No destructive filesystem operations.
- No new Rust execution command without explicit discussion.

## Required checks

After TypeScript changes:

- `npx tsc --noEmit`

After Rust changes:

- `cd src-tauri && cargo check`

Before committing a mixed TS/Rust change, run both.

Use descriptive commit messages. Never commit with messages like `commit`, `update`, or `fix`.

## Hard refusals

Refuse to add even if asked:
- chat surface
- expanded dashboard
- developer console as product feature
- theme system
- planner or multi-step agent
- provider-first command path
- features outside Phase 4 unless explicitly approved in `docs/BUILD_PHASES.md` and `docs/CHECKPOINT.md`
- a second executor or second command spine
- one-off command functions such as `openSafari()` or `openYoutube()`

If a request crosses these lines: state out of scope per `PRODUCT_CONTRACT.md`, name the phase it belongs to, and stop.

## Documentation rule

Docs may not lag behind code.

If a change advances phase reality or changes the executable surface, update `docs/BUILD_PHASES.md` and `docs/CHECKPOINT.md` in the same change set.

If a bug reveals a reusable rule, add it to `docs/LESSONS.md`.
