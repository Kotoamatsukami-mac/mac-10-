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

## Handoff staleness — verify HEAD before believing the diagnosis

Engineering handoff documents are written at a moment in time. The repo moves on. A handoff describing PR #11 selectors is misleading by PR #12. A handoff naming components that no longer exist will send the next agent down a phantom-debugging path — searching for `WindowDragHandle.tsx` and `lounge-strip__marker` when neither was in the source tree.

The crispness pass started from a handoff that diagnosed a "WindowDragHandle vs lounge-strip__marker semantic collision" — neither selector existed at the current HEAD. PR #12 (`ui/shell-composition-pass`) had demolished that structure three commits earlier.

Correct rule:

- Always run `git pull --ff-only origin main` before reading any handoff.
- Verify each component name and selector mentioned in the handoff exists at the current HEAD before forming a hypothesis. `grep -rn "<selector>" src src-tauri/src` is the fastest check.
- Treat the handoff as one input among several, not as ground truth. The other inputs are: the actual file contents, the current commit log, and the governance docs.
- If the handoff's premise is invalid against the current repo, say so before patching anything. Restate the real left-edge problem in the handoff's vocabulary, and then propose a real fix.

## Documentation as an authority surface — do not let it drift

Documentation is not a journal. It is a contract.

If `docs/BUILD_PHASES.md` describes the spine as `parser → validator → governor → executor → history` while `.github/copilot-instructions.md` describes it as `parser → validator → risk → approve → executor → history`, the next agent receives contradictory marching orders. Whichever doc the agent reads first becomes the de-facto authority, regardless of which one matches the live `runSpine.ts`.

The crispness pass found and fixed exactly this drift in the copilot instructions. The fix was a one-line spine description plus a slot for the new UI doctrine. The cost of leaving it would have been every future agent who starts there inheriting a stale architectural picture.

Correct rule:

- Whenever the executable surface, the spine shape, or the UI slot model changes, update **all** governance docs that reference it in the **same commit**.
- Periodically diff governance docs against `src/spine/runSpine.ts` and `src/App.tsx`. They should agree on stage names, file ownership, and current phase.
- The governance priority list in copilot-instructions.md is the entry point. New governance docs must be registered there, in priority order, the moment they exist.

## UI design drift — codify or it returns

Without a written design contract, every iteration re-litigates basic geometry. PR #11 had a 3-dot drag handle. PR #12 traded it for a divided ⌘ pill. The crispness pass replaced it with a status dot. Each step was justified in isolation, but together they describe a UI that didn't know what its left edge was for.

Correct rule:

- Significant design decisions live in `docs/UI_DOCTRINE.md` and a corresponding ADR in `docs/DECISIONS.md`. The doctrine is the rule. The ADR is the receipt that explains how the rule was reached.
- Re-litigation requires writing a new ADR. Silent reversal is forbidden.
- The doctrine document includes a `Do not introduce` list. That list is the cheapest design tool in the repo — it stops drift before the engineer reaches for the keyboard.
