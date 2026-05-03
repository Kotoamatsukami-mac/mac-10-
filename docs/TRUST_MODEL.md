# Trust Model

## Status

This document is a repo contract.

Labels used here:

- **Verified** means the current repository implements it.
- **Principle** means an engineering rule applied to this repo.
- **Future** means intended direction, not current behavior.
- **Known limitation** means a real current gap.
- **Do not introduce** means an architectural drift path.

## Principle — confidence is not trust

A command is not trusted because the resolver is confident.

A command is trusted only after:

```text
Command Contract Binding
→ Capability Validation
→ Contextual Policy Governance
```

Resolver confidence is an input signal. It is not an authorization signal.

## Principle — policy is separate from enforcement

The governor is the local policy decision point. The executor is the native enforcement bridge.

Policy decides whether an action may proceed. The executor performs only the already-governed native action.

## Verified — current trust layers

Current trust path:

```text
PreviewPrediction
→ parseCommand
→ validateCommand
→ governCommand
→ executeCommand only when allowed
→ recordAttempt
```

Current trust owner files:

| Layer | Owner file | Role |
| --- | --- | --- |
| Command contract surface | `src/spine/registry.ts` | Defines accepted ActionKinds and required fields |
| Structural validation | `src/spine/validator.ts` | Rejects invalid shape, missing fields, ambiguity, weak confidence |
| Contextual governance | `src/spine/governor.ts` | Uses parsed command, validation result, and cached native snapshot |
| Risk classification | `src/spine/risk.ts` | Classifies danger level |
| Approval decision | `src/spine/approve.ts` | Converts risk into auto-approved, gated, or rejected decision |
| Undo policy | `src/spine/undoPolicy.ts` | Declares reversibility posture |
| History | `src/spine/history.ts` | Records attempts including blocked and gated outcomes |

## Verified — structural validation

`validator.ts` owns structural and capability-floor checks.

It currently checks:

- unknown actions
- registry membership
- executable registry entry
- target_ref presence
- required fields
- ambiguous predictions
- no-match predictions
- fuzzy predictions not enabled
- low-confidence contains matches

## Principle — validator is not governor

The validator is necessary but not sufficient.

It must not be treated as contextual trust. It checks command shape. It does not own runtime wisdom.

## Verified — contextual governance

`governor.ts` owns contextual allow, gate, block, or already-satisfied decisions.

It currently checks examples such as:

- `app.open` requires a launchable static app path
- runtime app verbs use running-app evidence when available
- `service.open` requires an http or https URL
- `settings.open` requires a System Settings URL family
- `volume.set` requires a finite number from 0 to 100
- volume commands check audio output availability when known

The governor attaches:

- risk
- approval decision
- undo policy
- recovery guidance

## Known limitation — approval is policy-only right now

`app.quit` is attention-risk and reaches a gate only when running-app evidence is available.

Inline approval UI is not complete yet. Until that UI exists, Macten has approval policy metadata and gate outcomes, not a complete user approval interaction.

## Future — approval interaction

Phase 5 should add inline approval in the strip:

```text
Quit Safari? Y/N
```

No modal is required for the first approval slice.

Expected behavior:

- `Y` approves and executes
- `N` cancels and records rejection
- Escape cancels
- typing clears pending approval
- approval state expires safely

## Verified — undo policy groundwork

`undoPolicy.ts` declares reversibility posture for every current ActionKind.

This is policy metadata, not durable undo execution.

## Future — durable undo

Future undo requires pre-state capture before execution.

Examples:

- volume actions should capture previous volume or mute state
- focus actions should capture previous frontmost app
- app quit is not safely reversible because relaunch cannot restore unsaved app state

## Verified — history scope

`history.ts` currently records attempts in memory.

It records:

- raw input
- action
- target label
- validation result
- governor decision
- risk
- approval
- execution outcome

## Future — durable history

Future durable history should be append-only.

Acceptable first storage options:

- JSONL
- SQLite

Durable history must distinguish:

- attempted
- structurally invalid
- governed block
- governed gate
- approved
- rejected
- executed
- execution failed
- undo offered
- undo executed

## Do not introduce — false trust

Do not document or implement any layer as trusted merely because it is confident, convenient, or visually convincing.

Do not allow:

- resolver confidence as execution authority
- UI affordance as approval
- executor fallback guessing
- approval bypass for attention-risk actions
- undo claims without undo policy and pre-state plan
- docs claiming durable history or durable undo before implementation

## Verification

Minimum checks:

```bash
npx tsc --noEmit
npm test
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
```

Trust-specific tests should cover:

- malformed commands are rejected structurally
- plausible false positives are rejected contextually
- gated actions do not execute without approval
- every action has an undo policy
- history records non-executed attempts
