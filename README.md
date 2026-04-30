# Macten

**COMMAND YOUR MAC IN ONE SENTENCE.**

A transparent macOS command strip that interprets natural language into safe, governed native actions. Built with Tauri 2 + React + TypeScript.

## What it does

Type a sentence. Macten resolves it against your Mac's real environment — installed apps, folders, settings panes, services — and executes it through a validated spine. No AI needed for the 80% case.

```
safari       → opens Safari
downloads    → opens ~/Downloads
youtube      → opens YouTube in your browser
sound        → opens Sound settings
yt           → opens YouTube (alias)
gpt          → opens ChatGPT (alias)
gh           → opens GitHub (alias)
```

## Architecture

```
Input
→ NativeEnvironmentSnapshot (scanned once on launch)
→ NativeEnvironmentIndex (in-memory, searchable)
→ resolvePreview (debounced ghost completion)
→ resolveNow (synchronous on Enter)
→ parser → validator → risk → approve → executor → history
```

Every command flows through the same spine. No shortcuts, no one-off hacks.

## Current command surface

| Action         | What it does                        | Risk  |
|----------------|-------------------------------------|-------|
| `app.open`     | Opens an installed application      | safe  |
| `folder.open`  | Opens a folder in Finder            | safe  |
| `service.open` | Opens a URL in default browser      | safe  |
| `settings.open`| Opens a System Settings pane        | safe  |
| `volume.set`   | *Registered, not yet executable*    | —     |

## Execution boundary

- Rust executor calls `/usr/bin/open` only
- Path must exist for `executor_open_path`
- URL scheme must be on allowlist for `executor_open_url`
- No AppleScript, no osascript, no free-form shell
- No destructive operations

## Status feedback

The strip shows outcome feedback with dark rainbow accents:

- **Green** (`#6ee7a0`) — success: "Opened Safari"
- **Violet** (`#a78bfa`) — guidance: "Type more", "Choose one", "Not yet"
- **Coral** (`#f87171`) — blocked: "Blocked"

Status clears on keystroke or after a timed auto-clear.

## Keyboard

| Key          | Action                                    |
|--------------|-------------------------------------------|
| Enter        | Submit command                            |
| Tab          | Accept ghost completion                   |
| ArrowRight   | Accept ghost completion (at end of input) |
| Space        | Keep typing (does not accept ghost)       |
| Cmd+Shift+Space | Focus strip from anywhere              |

## Dev

```bash
cd /path/to/mac-10-
npm install
npm run tauri dev
```

## Checks

```bash
npx tsc --noEmit          # TypeScript
cd src-tauri && cargo check  # Rust
```

## Phase roadmap

- [x] Phase 1 — Draggable transparent strip
- [x] Phase 2 — Native Environment Index
- [x] Phase 3 — Preview + ghost completion
- [x] Phase 4 Slice 1 — Execution spine
- [x] Phase 4 Slice 2 — Outcome feedback UI
- [ ] Phase 4 Slice 3 — Volume control
- [ ] Phase 4 Slice 4 — Typed Rust errors
- [ ] Phase 5 — Approval UI + history + undo
- [ ] Phase 6 — Provider interpretation (AI)
