# Macten Build Phases

## Phase 1 — Draggable strip (complete)

Target: a physically trustworthy strip with no brain.

- Transparent undecorated macOS window
- Width 800, height 76
- One command input
- Large reliable drag region
- Input remains clickable and typeable at all times
- Pin button toggles alwaysOnTop, never breaks drag
- Global shortcut Cmd+Shift+Space to focus the bar

Milestone: strip opens, transparent, drags perfectly,
input types perfectly, pin does not break drag. ✅

## Phase 2 — Native Environment Index (complete)

The lexicon is not a list. It is a resolver-facing projection of the Mac's actual environment.

The Native Environment Index has four volatility classes:

### 1. Static-ish Inventory — scan on launch
- Installed apps from /Applications, /System/Applications, ~/Applications
- System Settings panes
- User folders: Desktop, Downloads, Documents
- Apple Shortcuts if accessible
- Default app handlers where practical

### 2. User Preference Signals — scan on launch
- Dock pinned apps
- Login items
- Recent apps/items if practical
- Menu bar and background agents where practical

### 3. Live Runtime State — live query always
- Running apps
- Frontmost app
- Connected displays
- Audio input/output devices
- Mounted volumes
- Bluetooth devices if practical

### 4. Permission/Capability Map — check on launch and before relevant actions
- Accessibility permission
- Automation/System Events capability
- Screen Recording permission if detectable
- Full Disk Access if detectable
- Notification permission if detectable

### Deliverable
Typed Rust commands and TypeScript bindings that return one clean
NativeEnvironmentSnapshot object to the frontend. ✅

### Phase 2 hard rules
- Read-only only
- No AI planner
- No destructive actions
- No broad refactor
- No fake hardcoded data
- No React components directly calling random native probes
- No changes to Phase 1 strip behaviour

## Phase 3 — Preview interpretation (complete)

Architecture:

NativeEnvironmentSnapshot
→ buildNativeEnvironmentIndex(snapshot) → NativeEnvironmentIndex
→ resolvePreview(rawInput, index) → PreviewPrediction
→ completion + confidence_tier
→ executable: false in preview

### Slice 1 — Resolver foundation (complete)
- src/resolver/nativeEnvironmentIndex.ts
- src/resolver/previewResolver.ts
- Zero-dependency. No invoke. No native probes.
- Generic: every target flows through the same resolver path.
- Returns PreviewPrediction with completion field for ghost completion UI.
- confidence_tier: exact, prefix, contains, ambiguous, no_match
- fuzzy: typed but not implemented yet ✅

### Slice 2 — Ghost completion UI (complete)
- Wire resolvePreview to debounced input in strip
- Load NativeEnvironmentSnapshot once on mount via invoke
- Build NativeEnvironmentIndex in memory
- On keystroke: debounce 300ms then resolvePreview
- Trailing whitespace suppresses preview so Space acts as keep-typing / reject-ghost
- Show completion as faint ghost text after typed text
- Ghost text has no underline; confidence remains internal/resolver state
- On pause: ghost appears quietly
- On type: ghost clears instantly, vertical cursor returns
- On Tab or arrow right: accept suggestion, cursor moves to end
- No dropdown. No command palette. ✅

### Phase 3 hard rules
- No provider AI
- No planner
- No native probes per keystroke
- Rust not touched for preview UI

## Phase 4 — Safe local execution spine (started)

Goal: execute the first safe command families through the fixed local spine:

parser → validator → risk → approve → executor → history

### Slice 1 — Open-style execution spine (complete)
- src/spine/parser.ts
- src/spine/registry.ts
- src/spine/validator.ts
- src/spine/risk.ts
- src/spine/approve.ts
- src/spine/executor.ts
- src/spine/history.ts
- src/spine/runSpine.ts
- src-tauri/src/executor.rs

Enter submits the current input by resolving it through Phase 3, then running the Phase 4 spine.

Currently reachable action families:
- app.open
- folder.open
- service.open
- settings.open

Registered but intentionally inert:
- volume.set — registry placeholder only; executable=false until a bounded native volume command exists.

Execution boundary:
- TypeScript executor calls only explicit Tauri commands.
- Rust exposes executor_open_path and executor_open_url.
- executor_open_path requires the path to exist.
- executor_open_url only allows http, https, mailto, tel, and x-apple.systempreferences schemes.
- Rust delegates to /usr/bin/open with -- target.
- No AppleScript.
- No osascript.
- No free-form shell surface exposed to the frontend.
- No destructive operations.

### Phase 4 hard rules
- No provider AI
- No planner or multi-step agent
- No destructive filesystem changes
- No command-specific hacks such as openSafari()
- New action families must be added through registry → validator → risk → approval → executor → history

### Slice 2 — Outcome feedback in strip (complete)
- src/spine/outcomeMessage.ts
- src/App.tsx

Outcome mapping from resolveNow / SpineOutcome to a minimal StripStatus:

- StripStatus kinds: idle, ok, hint, blocked
- Status wins over ghost: ghostVisible = status.kind === "idle" && showGhost
- Keystroke clears status immediately
- Auto-clear timers: ok=1200ms, hint=2500ms, blocked=3000ms
- Strip height fixed at 76px. No second row. No panel.
- All user-facing copy lives in outcomeMessage.ts. No strings in App.tsx.
- Status renders via .strip-status + .strip-status-{kind} classes
- Ghost renders via .ghost-completion class
- No silent no-op paths remain. Every submit outcome shows user feedback. ✅

## Phase 5 — Risk and approval UI

Future work:
- Inline approval UI for attention-risk actions
- Stronger history inspection
- Undo/inverse metadata where possible
- quit app
- force quit
- create folder
- move file
- trash file
- browser tab

Permanent delete is permanently blocked.
Filesystem stays inside $HOME unless explicitly extended.

## Phase 6 — Provider interpretation

Only after local spine is proven solid.
Provider output converts into the same ParsedCommand / typed plan shape and re-enters the spine.
Provider may not execute, invent state, or bypass any layer.
