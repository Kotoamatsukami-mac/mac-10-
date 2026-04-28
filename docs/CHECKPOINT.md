# Macten Checkpoint

## Current checkpoint

Phase 3 Slice 2 — Ghost completion UI foundation.

Macten currently has the local spine required before execution work begins:

```text
Phase 1: Draggable transparent command strip
Phase 2: NativeEnvironmentSnapshot from the Mac environment
Phase 3 Slice 1: NativeEnvironmentIndex + resolvePreview()
Phase 3 Slice 2: Ghost completion preview UI
```

## Locked architecture

```text
NativeEnvironmentSnapshot
→ buildNativeEnvironmentIndex(snapshot)
→ NativeEnvironmentIndex
→ resolvePreview(rawInput, index)
→ PreviewPrediction
→ inline ghost completion
```

The preview layer is read-only. `PreviewPrediction.executable` must remain `false` throughout Phase 3.

## Allowed next work

- Tune ghost completion feel and alignment.
- Verify Tab and ArrowRight acceptance.
- Add small resolver fixtures or manual checks.
- Improve exact-match/index lookup without changing the public resolver contract.
- Update documentation when a slice is verified.

## Forbidden until Phase 4+

- Command execution.
- Provider AI interpretation.
- Planner or plan-and-execute runtime.
- Governor/risk UI beyond documentation.
- Dropdowns or command-palette UI.
- Native probes per keystroke.
- One-off command functions such as `openSafari()` or `openYoutube()`.

## Manual verification checklist

- `saf` shows a quiet Safari completion when Safari is indexed.
- `open saf` resolves through the same generic path.
- `youtube` resolves as a service entity.
- `downloads` resolves as a folder entity when present in the snapshot.
- `sound` resolves as a settings pane entity.
- `whatsapp` / `whats app` resolves as an app entity if installed.
- Ghost completion appears as faint text only, without underline.
- Ambiguous/no-match/empty completion stays silent.
- Tab accepts the visible completion.
- ArrowRight accepts only when the caret is at the end.
- Drag handles, input focus, pin button, and Cmd+Shift+Space still work.

## Stop condition before Phase 4

Do not start execution until Phase 3 prediction feels stable and `npm run typecheck` passes locally.
