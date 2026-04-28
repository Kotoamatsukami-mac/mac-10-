# Macten Build Phases

## Phase 1 — Draggable strip (current)

Target: a physically trustworthy strip with no brain.

- Transparent undecorated macOS window
- Width 800, height 76
- One command input
- Large reliable drag region
- Input remains clickable and typeable at all times
- Pin button exists but must not break dragging
- Global shortcut to focus the bar

Not in this phase:
- No parser
- No executor
- No native lexicon
- No provider logic
- No expanded panel
- No settings

Milestone: strip opens, strip is transparent, strip drags perfectly,
input types perfectly, pin does not break drag.

## Phase 2 — Native Environment Index (read-only)

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
NativeEnvironmentSnapshot object to the frontend.

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

interpret_preview runs on debounced input.
Returns: status, canonical, tokens, headline, detail, suggestion, choices, risk, can_submit.
Does not create pending commands. Does not execute.

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
