# Macten Build Phases

## Phase 1 — Draggable strip (complete)

Target: a physically trustworthy strip with no brain.

- Transparent undecorated macOS window
- Width 800, height 76
- One command input
- Large reliable drag region
- Input remains clickable and typeable at all times
- Pin button toggles alwaysOnTop, never breaks drag
- Global shortcut Cmd+Shift+Space to focus the bar ✅

## Phase 2 — Native Environment Index (complete)

The lexicon is not a list. It is a resolver-facing projection of the Mac's actual environment.

Four volatility classes:

1. Static-ish Inventory — installed apps, settings panes, user folders, service seeds
2. User Preference Signals — Dock pinned apps, login items
3. Live Runtime State — running apps, frontmost app, audio devices, volumes (partially available)
4. Permission/Capability Map — accessibility, automation (stubs, Phase 5)

Deliverable: typed NativeEnvironmentSnapshot from Rust to frontend. ✅

## Phase 3 — Preview interpretation (complete)

- NativeEnvironmentSnapshot → NativeEnvironmentIndex → resolvePreview → PreviewPrediction
- Ghost completion UI (faint text, no underline)
- Debounced preview (100ms), trailing whitespace suppresses
- Tab/ArrowRight accept, Space keeps typing
- No execution in preview path ✅

## Phase 4 — Safe local execution spine (current)

### Slice 1 — Open-style execution spine (complete)

- parser → validator → risk → approve → executor → history
- 4 open-style actions: app.open, folder.open, service.open, settings.open
- Rust boundary: executor_open_path, executor_open_url
- Typed ExecutorError enum (PathNotFound, DisallowedScheme, OpenFailed) ✅

### Slice 2 — Outcome feedback in strip (complete)

- StripStatus: idle, ok, hint, blocked
- Dark rainbow accents (green/violet/coral)
- Status wins over ghost, keystroke clears, timed auto-clear
- All user-facing copy in outcomeMessage.ts
- Typed error mapping: path_not_found, disallowed_scheme, open_failed ✅

### Slice 3 — Phrase grammar + app verbs + volume (complete)

- Phrase grammar layer: classifyIntent extracts verb + target + numeric arg
- 5 verb families: open, quit, hide, focus, volume (set/mute/unmute/up/down)
- Registry expanded to 12 executable actions
- Rust: app_executor.rs (NSRunningApplication — quit/hide/focus)
- Rust: volume_executor.rs (CoreAudio HAL FFI — set/mute/step)
- Typed errors: AppExecutorError, VolumeExecutorError
- Risk: app.quit reclassified as attention (may interrupt unsaved work)
- 22 unit tests covering registry/executor contract, validator guidance, risk+approval, outcome mapping ✅

### Phase 4 hard rules

- No provider AI
- No planner or multi-step agent
- No destructive filesystem changes
- No target-specific parser branches
- New actions only through registry → validator → risk → approve → executor → history

## Phase 4.5 — Live runtime state hydration (complete)

- `read_running_apps()` — real NSWorkspace.runningApplications via objc2
- `read_frontmost_app()` — real NSWorkspace.frontmostApplication via objc2
- Running apps indexed as target_kind "app" with source "live_runtime_state"
- Intent-aware scoring: open prefers launchable, quit/hide/focus prefer running
- No new actions added — surface remains exactly 12 actions
- Validation contracts unchanged: app.open requires path, quit/hide/focus require bundle_id ✅

## Phase 5 — Approval UI + durable history + undo

- 5.1: Inline approval for attention-risk actions (Y/N in strip, not modal)
- 5.2: Durable local history (JSONL or SQLite, append-only)
- 5.3: Command-specific undo where possible (volume restore, app relaunch)
- Permanent delete is permanently blocked
- Filesystem stays inside $HOME unless explicitly extended

## Phase 6 — Provider interpretation

- Only after local spine is proven and Phase 5 approval exists
- Provider outputs typed intent that enters the existing spine
- Provider may not execute, invent actions, or bypass any layer
- Provider chooses from fixed grammar/registry — no invented action shapes
