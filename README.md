# Macten

**COMMAND YOUR MAC IN ONE SENTENCE.**

A transparent macOS command strip that compresses natural language into safe, governed native actions. Built with Tauri 2 + React + TypeScript. macOS-first — Windows is not a current target.

## What it does

Type a sentence. Macten resolves it against your Mac's real environment — installed apps, folders, settings panes, services — and executes it through a validated spine. No AI needed for the deterministic 80%.

```
safari            → opens Safari
quit spotify      → terminates Spotify (cooperative)
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

## Architecture

```
Input
→ classifyIntent (phrase grammar: verb + target + optional arg)
→ NativeEnvironmentSnapshot (scanned once on launch)
→ NativeEnvironmentIndex (in-memory, searchable)
→ resolvePreview (debounced ghost completion)
→ resolveNow (synchronous on Enter)
→ parser → validator → risk → approve → executor → history
```

Every command flows through the same spine. No shortcuts, no one-off hacks. The parser parses grammar. The resolver reads the index. The executor runs typed actions.

## Current command surface

| Action           | What it does                          | Risk      |
|------------------|---------------------------------------|-----------|
| `app.open`       | Opens an installed application        | safe      |
| `app.quit`       | Terminates a running app              | attention |
| `app.hide`       | Hides an app's windows                | safe      |
| `app.focus`      | Brings a running app to the front     | safe      |
| `folder.open`    | Opens a folder in Finder              | safe      |
| `service.open`   | Opens a URL in default browser        | safe      |
| `settings.open`  | Opens a System Settings pane          | safe      |
| `volume.set`     | Sets system volume (0-100)            | safe      |
| `volume.mute`    | Mutes system audio                    | safe      |
| `volume.unmute`  | Unmutes system audio                  | safe      |
| `volume.step_up` | Steps volume up                       | safe      |
| `volume.step_down`| Steps volume down                    | safe      |

## Execution boundary

- Rust executor uses `/usr/bin/open` for paths and URLs
- App verbs use `NSRunningApplication` (native, no AppleScript)
- Volume uses CoreAudio HAL (raw FFI, no shell)
- Path must exist for `executor_open_path`
- URL scheme must be on allowlist for `executor_open_url`
- No AppleScript, no osascript, no free-form shell
- No destructive filesystem operations

## Status feedback

The strip shows outcome feedback with dark rainbow accents:

- **Green** — success: "Opened Safari", "Quit Spotify", "Volume 50%"
- **Violet** — guidance: "Keep typing", "Be more specific", "Not running"
- **Coral** — blocked: "Not allowed"

Status clears on keystroke or after timed auto-clear.

## Keyboard

| Key             | Action                                    |
|-----------------|-------------------------------------------|
| Enter           | Submit command                            |
| Tab             | Accept ghost completion                   |
| ArrowRight      | Accept ghost completion (at end of input) |
| Space           | Keep typing (does not accept ghost)       |
| Cmd+Shift+Space | Focus strip from anywhere                 |

## Dev

```bash
npm install
npm run tauri dev
```

## Checks

```bash
npx tsc --noEmit
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
npm test
```

## Phase roadmap

- [x] Phase 1 — Draggable transparent strip
- [x] Phase 2 — Native Environment Index
- [x] Phase 3 — Preview + ghost completion
- [x] Phase 4 Slice 1 — Execution spine (4 open-style actions)
- [x] Phase 4 Slice 2 — Outcome feedback UI
- [x] Phase 4 Slice 3 — Phrase grammar + app verbs + volume (12 actions)
- [ ] Phase 4.5 — Live state hydration (running apps, frontmost app)
- [ ] Phase 5 — Approval UI + durable history + undo
- [ ] Phase 6 — Provider interpretation (AI as typed parse generator)
