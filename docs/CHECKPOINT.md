# Macten Checkpoint

## Current checkpoint

Phase 4 Slice 2 — Outcome feedback in strip.

Macten currently has the local single-step command spine wired end to end,
with user-visible outcome feedback for every submit path:

```text
Phase 1: Draggable transparent command strip
Phase 2: NativeEnvironmentSnapshot from the Mac environment
Phase 3 Slice 1: NativeEnvironmentIndex + resolvePreview()
Phase 3 Slice 2: Ghost completion preview UI
Phase 4 Slice 1: parser → validator → risk → approve → executor → history
Phase 4 Slice 2: Outcome feedback — StripStatus overlay in strip
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

## Outcome feedback (Phase 4 Slice 2)

Outcome mapping lives in `src/spine/outcomeMessage.ts`.
Status rendering lives in `src/App.tsx`.

StripStatus kinds: idle, ok, hint, blocked.

Mapping:
- resolver unavailable → hint: "Index unavailable"
- no prediction → hint: "Type more"
- validation needs_more → hint: "Type more"
- validation choose_one → hint: "Choose one"
- validation permission_needed → hint: "Allow permission"
- validation approval_needed → hint: "Confirm"
- validation unsupported_yet → hint: "Not yet"
- validation blocked → blocked: "Blocked"
- approval needs_approval → hint: "Confirm"
- approval rejected → blocked: "Blocked"
- execution ok → ok: "Opened {label}"
- execution failed → hint: "Try again"

Rendering contract:
- Status overlay uses .strip-status + .strip-status-{kind}
- Ghost overlay uses .ghost-completion
- Status wins: ghostVisible = status.kind === "idle" && showGhost
- Keystroke clears status immediately
- Auto-clear timers: ok=1200ms, hint=2500ms, blocked=3000ms
- Strip height fixed at 76px. No second row. No expansion.

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

- Phase 4 Slice 2.1: harden outcome feedback (no behavior change)
- Phase 4 Slice 3: bounded volume.set (first safe state mutation)
- Phase 4 Slice 4: typed Rust executor errors
- Phase 4 Slice 5: inline disambiguation chooser

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
