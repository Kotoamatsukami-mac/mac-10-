# Macten Checkpoint

## Current checkpoint

Phase 4 Slice 3 — Phrase grammar + app verbs + volume (12 executable actions).

```text
Phase 1: Draggable transparent command strip
Phase 2: NativeEnvironmentSnapshot from the Mac environment
Phase 3 Slice 1: NativeEnvironmentIndex + resolvePreview()
Phase 3 Slice 2: Ghost completion preview UI
Phase 4 Slice 1: parser → validator → risk → approve → executor → history
Phase 4 Slice 2: Outcome feedback — StripStatus overlay in strip
Phase 4 Slice 3: Phrase grammar, app verbs (quit/hide/focus), volume control
```

## Locked architecture

```text
raw input
→ classifyIntent (phrase grammar: verb + target + optional arg)
→ NativeEnvironmentSnapshot (loaded once)
→ buildNativeEnvironmentIndex(snapshot)
→ resolvePreview / resolveNow
→ parser (maps intent × target_kind → action via registry)
→ validator (checks required fields, maps failures to guidance)
→ risk (safe / attention / blocked)
→ approve (auto_approved / needs_approval / rejected)
→ executor (typed Tauri commands only)
→ history (in-memory, Phase 5 persists)
```

## Current executable surface (12 actions)

| Action             | Rust backend               | Risk      |
|--------------------|----------------------------|-----------|
| `app.open`         | executor_open_path         | safe      |
| `app.quit`         | executor_quit_app (NSRunningApplication) | attention |
| `app.hide`         | executor_hide_app (NSRunningApplication) | safe |
| `app.focus`        | executor_focus_app (NSRunningApplication) | safe |
| `folder.open`      | executor_open_path         | safe      |
| `service.open`     | executor_open_url          | safe      |
| `settings.open`    | executor_open_url          | safe      |
| `volume.set`       | executor_set_volume (CoreAudio) | safe  |
| `volume.mute`      | executor_set_mute (CoreAudio)  | safe  |
| `volume.unmute`    | executor_set_mute (CoreAudio)  | safe  |
| `volume.step_up`   | executor_step_volume (CoreAudio) | safe |
| `volume.step_down` | executor_step_volume (CoreAudio) | safe |

## Phrase grammar

Supported verb families (src/resolver/phraseGrammar.ts):

- **open**: open, launch, show, start, go to, bring up, pull up
- **quit**: quit, close
- **hide**: hide
- **focus**: focus, switch to, activate
- **volume_set**: set volume to N, volume N, volume to N
- **volume_mute**: mute, silence
- **volume_unmute**: unmute, unsilence
- **volume_up**: volume up, turn volume up, louder
- **volume_down**: volume down, turn volume down, quieter

Bare nouns default to "open" intent.

## Risk classification

- `app.quit` is **attention** — may interrupt unsaved work
- All other current actions are **safe** — bounded, reversible, non-interruptive
- Until Phase 5 approval UI exists, attention-risk actions are blocked by the approval gate

## Outcome feedback

Mapping lives in `src/spine/outcomeMessage.ts`. Status kinds: idle, ok, hint, blocked.

Typed executor errors:
- path_not_found → "Not found"
- disallowed_scheme → "Not allowed"
- app_not_running → "Not running"
- audio_unavailable → "Audio unavailable"
- open_failed → "Couldn't open"

## Execution boundary

- Open-style: `/usr/bin/open` with path existence / URL scheme checks
- App verbs: `NSRunningApplication` (objc2-app-kit, native, no AppleScript)
- Volume: CoreAudio HAL FFI (raw, no shell, clamped 0-100)
- No AppleScript, no osascript, no free-form shell
- No destructive filesystem operations

## Allowed next work

- Phase 4.5: Live state hydration (running apps, frontmost app in snapshot)
- Phase 5.1: Inline approval UI for attention-risk actions
- Phase 5.2: Durable local history (JSONL or SQLite)
- Phase 5.3: Command-specific undo (volume restore, app relaunch)

## Forbidden until explicitly approved

- Provider AI / LLM calls
- Multi-step plan execution
- Destructive filesystem operations
- Dashboard / command palette / settings page
- Second spine or alternate executor path

## Stop condition

Do not start Phase 5 until all 12 actions are runtime-verified and both checks pass:

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm test
```
