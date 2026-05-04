# Copilot Instructions for Macten

## Identity

Macten is a compact local-first macOS command strip. macOS-first — Windows is not a current target.

Tagline, never reworded:

COMMAND YOUR MAC IN ONE SENTENCE

Macten is not: chat, dashboard, terminal clone, generic AI agent, cloud puppet, automation playground, launcher clone, planner, workflow engine.

Every feature must answer one question: does this help the user command their Mac in one sentence? If no, refuse to add it.

## Session rule

Before touching code:

1. `git pull --ff-only origin main`
2. Read the exact files you are about to change.
3. Read the governance docs that apply to the task.
4. Work from repo truth, not memory of a prior session.

Governance priority:

1. `.github/copilot-instructions.md`
2. `docs/PRODUCT_CONTRACT.md`
3. `docs/BUILD_PHASES.md`
4. `docs/CHECKPOINT.md`
5. `docs/UI_DOCTRINE.md`
6. `docs/DECISIONS.md`
7. `docs/LESSONS.md`
8. `docs/SECURITY_MODEL.md`

If a proposed change contradicts governance, stop and say so. Do not silently override it.

## Doctrine

THE MAC IS THE DICTIONARY
THE BAR IS THE INTERPRETER
THE COMMAND SPINE IS THE TRUST LAYER

## Variable lexicon rule

The lexicon is variable. Do not implement commands by matching fixed target words.
Target names are data, not code. The parser parses grammar. The resolver reads the index.
The executor runs typed actions. No target word gets special product logic.

## Command Spine — fixed, do not rename

Two paths. Do not merge or confuse them.

Preview path, advisory only:

classifyIntent → NativeEnvironmentSnapshot → NativeEnvironmentIndex → resolvePreview → PreviewPrediction → ghost completion

Submit path, execution capable:

resolveNow(currentInput) → parser → validator → governor → executor → history

The governor internalizes risk classification and approval decision. Native execution is attempted only when `governor.status === "allow"`. `gate`, `block`, and `satisfied` outcomes do not execute and are still recorded.

No provider, shortcut, UI helper, or smart path may bypass the submit spine.

Spine files in `src/spine/`: parser.ts, registry.ts, validator.ts, governor.ts, risk.ts, approve.ts, undoPolicy.ts, executor.ts, history.ts, runSpine.ts, outcomeMessage.ts

Phrase grammar in `src/resolver/phraseGrammar.ts`

Do not add stages, reorder stages, rename stages, or create a second spine.

## Current phase

Current phase: Phase 4.5 complete — pre-Phase 5.

12 executable actions:

| Action             | Rust command             | Risk      |
|--------------------|--------------------------|-----------|
| `app.open`         | executor_open_path       | safe      |
| `app.quit`         | executor_quit_app        | attention |
| `app.hide`         | executor_hide_app        | safe      |
| `app.focus`        | executor_focus_app       | safe      |
| `folder.open`      | executor_open_path       | safe      |
| `service.open`     | executor_open_url        | safe      |
| `settings.open`    | executor_open_url        | safe      |
| `volume.set`       | executor_set_volume      | safe      |
| `volume.mute`      | executor_set_mute        | safe      |
| `volume.unmute`    | executor_set_mute        | safe      |
| `volume.step_up`   | executor_step_volume     | safe      |
| `volume.step_down` | executor_step_volume     | safe      |

## Risk classification

- `app.quit` is **attention** — may interrupt unsaved work
- All other current actions are **safe**
- "Safe" means non-interruptive and unlikely to disturb user work
- Until Phase 5 approval UI exists, attention-risk actions are blocked by the approval gate

## Execution boundary

Rust commands:

- `executor_open_path` — path existence check, `/usr/bin/open`
- `executor_open_url` — scheme allowlist, `/usr/bin/open`
- `executor_quit_app` — NSRunningApplication.terminate (cooperative)
- `executor_hide_app` — NSRunningApplication.hide
- `executor_focus_app` — NSRunningApplication.activateWithOptions
- `executor_set_volume` — CoreAudio HAL, clamped 0-100
- `executor_set_mute` — CoreAudio HAL mute property
- `executor_step_volume` — CoreAudio HAL relative delta

Rules:
- No AppleScript, no osascript, no free-form shell
- No destructive filesystem operations
- No new Rust command without explicit discussion
- All errors are typed enums (ExecutorError, AppExecutorError, VolumeExecutorError)

## Build phases

Phase 1 — Draggable strip. Complete.
Phase 2 — Native Environment Index. Complete.
Phase 3 — Preview + ghost completion. Complete.
Phase 4 — Execution spine + outcome feedback + phrase grammar + app/volume verbs. Complete.
Phase 4.5 — Live state hydration (running apps, frontmost app). Complete.
Phase 5 — Approval UI + durable history + undo. Future.
Phase 6 — Provider interpretation (AI as typed parse generator). Future.

## Required checks

After changes: `npx tsc --noEmit`, `cd src-tauri && cargo check`, `npm test`
CI runs on push/PR: TypeScript build + Rust check/clippy/fmt

## Hard refusals

- chat surface
- dashboard / command palette / settings page
- planner or multi-step agent
- provider-first command path
- features outside current phase without explicit approval
- second executor or second spine
- target-specific command functions (openSafari, openYoutube)
- AppleScript / osascript / free-form shell

## Strip UI rules

Full design contract lives in `docs/UI_DOCTRINE.md`. Quick reference:

- The strip is a single slab. **No internal vertical dividers** between slots.
- Three-slot model: `identity-dot` (left, status-aware) · `input-wrap` (center, the only truly interactive surface aside from toolbar) · `toolbar` (right, two sculpted buttons).
- One element, one role. Do not stack a glyph and a status pip in the same slot. Do not add a second drag handle — drag is owned by `.shell-stage` via `getCurrentWindow().startDragging()`, with `.no-drag` opt-outs on input and toolbar.
- Color, weight, and opacity are tokens declared in `:root` of `src/styles.css`. Do not introduce ad-hoc rgba() literals when a `--ink-*`, `--text-*`, `--edge-*`, or `--accent-*` token already covers the role.
- Hover states must remain quiet: subtle border tint, a faint inset highlight, and at most a small ambient glow. No saturated bloom, no scale-up, no full-rainbow halo.
- `App.tsx` may not own command logic, lexicon, risk classification, approval policy, or native dispatch. It is the strip projection and event bridge only.

## Documentation rule

Docs may not lag behind code. If a change advances the phase or changes the executable surface, update BUILD_PHASES.md, CHECKPOINT.md, and this file in the same commit.
