# MACTEN

COMMAND YOUR MAC IN ONE SENTENCE

## Product boundary

Macten is a local macOS command runtime projected through a compact command strip. It turns one plain sentence into one verified native Mac action or one explicit gated plan requiring approval.

The strip is not the product brain. It is the input, preview, approval, and status projection for the runtime underneath.

Macten is not:
- chat
- dashboard
- terminal clone
- generic AI agent
- remote-control wrapper
- automation playground

## Doctrine

THE MAC IS CAPTURED AS TRUTH
THE LEXICON IS THE COMMAND DICTIONARY
THE STRIP IS ONLY THE PROJECTION
THE COMMAND SPINE IS THE AUTHORITY

## Documentation contract

Docs are law, not lore.

Documentation is not a second product surface. It must not invent capability, implementation status, phase completion, or future architecture. It must define the repository as it exists, the principles it must preserve, the gaps it has not closed, and the drift paths it must reject.

A documentation claim is valid only when it does at least one of the following:

- describes verified current repo behavior
- states a durable engineering principle
- marks a known limitation
- defines future work explicitly
- forbids architectural drift
- names owner files or verification checks

If a claim cannot point to current code, a durable principle, a known limitation, a future marker, or a forbidden-drift rule, it is product lore and should be removed.

## Runtime architecture

The detailed architecture is documented in `docs/RUNTIME_ARCHITECTURE.md`.

Canonical shape:

Native Environment Capture → Trust-Weighted Native Lexicon → Phrase Grammar → Native Symbol Binding → Intent / Target Semantic Analysis → Command Contract Binding → Capability Validation → Contextual Policy Governance → Approval + Execution Plan → Native Execution → Diagnostics + Event History + Undo Policy → Strip Projection

## Command Spine

Macten has two related local paths. They must not be merged or confused.

Preview path, advisory only:

NativeEnvironmentSnapshot → NativeEnvironmentIndex → resolvePreview → PreviewPrediction → ghost completion / resolved affordance

Submit path, action-capable:

resolveNow(currentInput) → parser → validator → governor → executor → history

No provider, shortcut, UI helper, or smart path may skip the submit spine.

## Command Contract Binding

Macten does not merely map text to actions. It binds an interpreted intent plus a native target to a known executable command contract.

Current ownership:
- `src/spine/registry.ts` is the command contract source of truth.
- `src/spine/parser.ts` binds resolver output to a registry action.
- `src/spine/validator.ts` performs structural and capability-floor validation.
- `src/spine/governor.ts` performs contextual policy judgement.
- `src/spine/undoPolicy.ts` declares reversibility policy.
- `src/spine/executor.ts` is a native bridge only.

## Interpretation layer

Macten's interpretation layer feels AI-grade by reading the user's sentence against the Mac's real local vocabulary: installed apps, folders, browsers, services, settings, runtime state, permissions where available, and command history.

The Native Environment Index is the resolver-facing projection of that local vocabulary. The moat is verifiability, not linguistic supremacy.

Preview confidence is advisory. Submit-time governance checks resolver output against available Mac context before an action is attempted.

## UI failure rule

Every backend failure maps to one guidance state at the UI boundary.

Guidance states:
- needs_more
- choose_one
- permission_needed
- approval_needed
- unsupported_yet
- blocked

Forbidden user-facing strings: Error, Failed, stack traces, raw enum codes.

## Performance rule

Preview must remain memory-only.

No native scan, filesystem crawl, permission probe, provider call, icon load, or full index rebuild may occur in the per-keystroke preview path.

Submit may use cached context and may later trigger narrow runtime micro-refresh for the action family being attempted.

## Build order

1. Draggable strip
2. Native Environment Index
3. Preview interpretation
4. Safe local command execution
5. Contextual governor, approval, durable history, and undo policy enforcement
6. Provider interpretation only after the local spine is proven
