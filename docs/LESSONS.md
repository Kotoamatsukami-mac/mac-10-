# Lessons from Extendead and Macten

## Root failure — do not reproduce

The window was hardlocked to screen centre. No Tauri config patch or shell-level override 
could make it reliably draggable to an arbitrary position. The drag region and input focus 
competed for the same event layer — every fix to one broke the other.

## Hard constraints carried forward

- Set window position explicitly at creation: x: 400, y: 200 in tauri.conf.json
- Never rely on OS default window placement
- Drag region and input must be separate non-overlapping elements from day one
- Provide both -webkit-app-region: drag CSS zone AND a Tauri startDragging() fallback
- Drag must be the first thing tested before any other feature is considered working
- Do not patch window behaviour after the fact — get it right in the initial config

## Rule

If drag is broken, nothing else matters. Drag is the first milestone. 
No feature is considered done until drag still works after it is added.

## Preview vs submit timing — do not reproduce

The ghost preview path is debounced and advisory. It can be stale by design.

Submit must never depend on the debounced preview state.

Correct rule:

- Preview: debounce input, then call `resolvePreview(input, index)` for ghost completion.
- Submit: synchronously resolve the current input with `resolveNow(currentInput)`, then call `runSpine()`.

This prevents stale-preview bugs where Enter executes or rejects based on an older prediction instead of the exact text currently in the input.

## Spacebar preview suppression — do not regress

Space means the user is continuing the sentence, not accepting the ghost.

Trailing whitespace must suppress ghost preview so the bar does not trim `"saf "` back to `"saf"` and re-suggest `"ari"` after the user has intentionally moved on.

Current rule:

- `Tab` / `ArrowRight` accept ghost completion.
- `Space` keeps typing and suppresses preview while it is the trailing character.
