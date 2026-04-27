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

## Phase 2 — Native Lexicon (read-only)

get_native_lexicon returns real local data:
- installed apps + bundle IDs
- installed browsers
- common folders
- known web services
- System Settings panes

No execution in this phase.

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