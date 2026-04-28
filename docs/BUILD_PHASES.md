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
- No command execution
- No AI planner
- No destructive actions
- No broad refactor
- No fake hardcoded data
- No React components directly calling random native probes
- No changes to Phase 1 strip behaviour

## Phase 3 — Preview interpretation (read-only)

Architecture:

NativeEnvironmentSnapshot
→ buildNativeEnvironmentIndex(snapshot) → NativeEnvironmentIndex
→ resolvePreview(rawInput, index) → PreviewPrediction
→ completion + confidence_tier
→ executable: false always

### Slice 1 — Resolver foundation (complete)
- src/resolver/nativeEnvironmentIndex.ts
- src/resolver/previewResolver.ts
- Zero-dependency. No invoke. No native probes.
- Generic: every target flows through the same resolver path.
- Returns PreviewPrediction with completion field for ghost completion UI.
- confidence_tier: exact, prefix, contains, ambiguous, no_match
- fuzzy: typed but not implemented yet ✅

### Slice 2 — Ghost completion UI (next)
- Wire resolvePreview to debounced input in strip
- Load NativeEnvironmentSnapshot once on mount via invoke
- Build NativeEnvironmentIndex in memory
- On keystroke: debounce 300ms then resolvePreview
- Show completion as faint ghost text after typed text
- Ghost text has no underline; confidence remains internal/resolver state
- On pause: ghost appears quietly
- On type: ghost clears instantly, vertical cursor returns
- On Tab or arrow right: accept suggestion, cursor moves to end
- No execution. No dropdown. No command palette.

### Phase 3 hard rules
- Read-only only
- No command execution
- No provider AI
- No planner
- No governor
- No native probes per keystroke
- Rust not touched in Phase 3

## Phase 4 — First five safe commands

- open app
- open folder
- open service
- set volume
- open display settings

Full spine pass-through for each.

## Phase 5 — Risk and approval

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
Provider output converts into the same ParsedCommand shape and re-enters the spine.
Provider may not execute, invent state, or bypass any layer.
