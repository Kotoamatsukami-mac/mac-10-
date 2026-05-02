# Command Spine Contract

## Status

This document is a repo contract.

Labels used here:

- **Verified** means the current repository implements it.
- **Principle** means an engineering rule applied to this repo.
- **Future** means intended direction, not current behavior.
- **Known limitation** means a real current gap.
- **Do not introduce** means an architectural drift path.

## Principle — preview and submit are different systems

Preview may suggest. Submit may act.

A prediction is not authority. A command is trusted only after structural validation and contextual governance.

## Principle — Macten is compiler-shaped

The submit path should be understood as a compiler-shaped command runtime:

```text
User Sentence
→ Phrase Grammar
→ Native Symbol Binding
→ Intent / Target Semantic Analysis
→ Command Contract Binding
→ Capability Validation
→ Contextual Policy Governance
→ Execution Plan
→ Native Execution
→ Diagnostics + Event History
```

This is an applied engineering model, not a claim that Macten currently implements a full compiler.

## Verified — current submit path

Current submit flow:

```text
resolveNow(submittedInput)
→ parseCommand(prediction)
→ validateCommand(parsed)
→ governCommand(parsed, validation, snapshot)
→ executeCommand(parsed) when allowed
→ recordAttempt(...)
→ statusFromOutcome(outcome)
```

Owner files:

| Stage | File | Responsibility |
| --- | --- | --- |
| Strip projection | `src/App.tsx` | Input, key handling, status rendering, call into spine |
| Preview hook | `src/hooks/usePreviewPrediction.ts` | Snapshot cache, in-memory index, debounced preview, resolveNow bridge |
| Phrase grammar | `src/resolver/phraseGrammar.ts` | Verb classification and numeric argument extraction |
| Native index | `src/resolver/nativeEnvironmentIndex.ts` | Searchable projection of native snapshot |
| Preview resolver | `src/resolver/previewResolver.ts` | Advisory prediction from input and index |
| Parser | `src/spine/parser.ts` | Bind prediction to ActionKind through registry |
| Registry | `src/spine/registry.ts` | Current command contract surface and required fields |
| Validator | `src/spine/validator.ts` | Structural and capability-floor validation |
| Governor | `src/spine/governor.ts` | Contextual allow, gate, or block decision |
| Risk | `src/spine/risk.ts` | Danger classification |
| Approval | `src/spine/approve.ts` | Risk-to-approval decision |
| Undo policy | `src/spine/undoPolicy.ts` | Reversibility classification |
| Executor | `src/spine/executor.ts` | Typed native command dispatch |
| History | `src/spine/history.ts` | Attempt record |
| Status projection | `src/spine/outcomeMessage.ts` | Strip-safe outcome text |

## Verified — execution gate

Native execution is attempted only after:

1. `resolveNow(...)` returns a prediction.
2. `parseCommand(...)` binds the prediction to an ActionKind.
3. `validateCommand(...)` returns valid.
4. `governCommand(...)` returns `status: "allow"`.

If the governor returns `gate` or `block`, native execution is not attempted and the attempt is still recorded.

## Principle — Command Contract Binding

Command Contract Binding means binding an interpreted intent plus a native target to a declared executable contract.

It is stronger than text-to-action mapping.

A mature command contract should define:

- action identity
- accepted intents
- accepted target kinds
- required fields or capabilities
- execution availability
- risk posture
- approval posture
- undo policy
- executor binding

## Verified — current contract distribution

The current contract is distributed across several files:

```text
registry.ts       → command contract surface + required fields
risk.ts           → risk posture
approve.ts        → approval posture
undoPolicy.ts     → reversibility posture
executor.ts       → native executor binding
```

## Future — fuller Command Contract Registry

A future version may consolidate more contract metadata into `registry.ts` or a related command-contract module.

That future work must not hide policy decisions inside UI code, parser code, or executor code.

## Known limitation — approval interaction

`app.quit` can currently reach a gate, but inline Y/N approval UI is not complete yet.

Docs must describe this as gated policy, not as a completed approval interaction.

## Do not introduce — spine drift

Do not introduce:

- UI-owned command catalogs
- native execution calls from preview code
- native execution calls from `App.tsx`
- target-specific parser hacks
- per-keystroke native scans
- new ActionKind entries without validation, governance, executor stance, undo policy, tests, and docs
- user-facing raw enum names, stack traces, or internal failure codes

## Verification

Minimum checks before treating this spine as healthy:

```bash
npx tsc --noEmit
npm test
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
```

Relevant test intent:

- registry and executor surface remain aligned
- validator rejects malformed command shape
- governor rejects plausible false positives
- every action has undo policy
- gated or blocked outcomes do not execute
- status projection stays user-safe
