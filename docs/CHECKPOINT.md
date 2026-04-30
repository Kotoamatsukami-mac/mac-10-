# Macten Checkpoint

## Current checkpoint

Phase 4 Slice 1 — Safe local execution spine.

Macten currently has the local single-step command spine wired end to end:

```text
Phase 1: Draggable transparent command strip
Phase 2: NativeEnvironmentSnapshot from the Mac environment
Phase 3 Slice 1: NativeEnvironmentIndex + resolvePreview()
Phase 3 Slice 2: Ghost completion preview UI
Phase 4 Slice 1: parser → validator → risk → approve → executor → history
```

## Locked architecture

```text
NativeEnvironmentSnapshot
→ buildNativeEnvironmentIndex(snapshot)
→ NativeEnvironmentIndex
→ resolvePreview(rawInput, index)
→ PreviewPrediction
→ parser
→ validator
→ risk
→ approve
→ executor
→ history
```

Enter submits by resolving synchronously through `resolveNow()` and then calling `runSpine()`.

The debounced preview state is advisory only. Submit must not depend on stale debounced preview state.

## Current executable surface

Reachable through Enter:

- `app.open`
- `folder.open`
- `service.open`
- `settings.open`

Registered but intentionally inert:

- `volume.set` — placeholder only, `executable=false`, no bounded native volume command yet.

## Execution boundary

- TypeScript executor calls only explicit Tauri commands.
- Rust exposes `executor_open_path` and `executor_open_url`.
- `executor_open_path` requires the path to exist.
- `executor_open_url` only allows `http`, `https`, `mailto`, `tel`, and `x-apple.systempreferences` schemes.
- Rust delegates to `/usr/bin/open -- target`.
- No AppleScript.
- No osascript.
- No free-form shell surface.
- No destructive operations.

## Allowed next work

- Verify Enter execution for the four open-style action families.
- Tune ghost completion feel and alignment.
- Improve user-facing guidance mapping for rejected spine outcomes.
- Add small resolver/spine fixtures or manual checks.
- Improve typed Rust/TS error surfaces without widening execution authority.
- Update documentation when a slice is verified.

## Forbidden until Phase 5+

- Provider AI interpretation.
- Planner or plan-and-execute runtime.
- Multi-step orchestration.
- Destructive filesystem operations.
- Approval UI beyond the typed pause point already in `approve.ts`.
- Dropdowns or command-palette UI.
- Native probes per keystroke.
- One-off command functions such as `openSafari()` or `openYoutube()`.
- A second command spine or alternate executor path.

## Manual verification checklist

Preview:

- `saf` shows a quiet Safari completion when Safari is indexed.
- `open saf` resolves through the same generic path.
- `youtube` resolves as a service entity.
- `downloads` resolves as a folder entity when present in the snapshot.
- `sound` resolves as a settings pane entity.
- `whatsapp` / `whats app` resolves as an app entity if installed.
- Ghost completion appears as faint text only, without underline.
- Trailing space suppresses preview so Space acts as keep-typing / reject-ghost.
- Ambiguous/no-match/empty completion stays silent.
- Tab accepts the visible completion.
- ArrowRight accepts only when the caret is at the end.

Execution:

- `youtube` + Enter opens YouTube through `service.open`.
- `downloads` + Enter opens Downloads through `folder.open` when resolved.
- `sound` + Enter opens the Sound settings pane through `settings.open`.
- `safari` + Enter opens Safari through `app.open` when indexed.
- Rejected or invalid commands are recorded in history and do not execute.
- Drag handles, input focus, pin button, and Cmd+Shift+Space still work.

## Stop condition before Phase 5

Do not start provider interpretation, planner work, destructive commands, or approval UI until Phase 4 Slice 1 execution feels stable and both checks pass locally:

```bash
npx tsc --noEmit
cd src-tauri && cargo check
```
