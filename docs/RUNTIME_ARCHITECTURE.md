# Macten Runtime Architecture

## Product stance

Macten is a local macOS command runtime projected through a thin strip.

The strip is not the product brain. `App.tsx` is the input/status projection and event bridge. The runtime owns environment truth, interpretation, command contracts, governance, execution, history, and undo policy.

## Architecture doctrine

```text
The Mac is captured as truth.
The lexicon is the command dictionary.
The strip is only the projection.
The spine is the authority.
```

Macten should use proven systems architecture, not invented abstractions:

- compiler-style pipeline for sentence → command
- command pattern for executable actions
- command contract registry for ActionKind binding
- capability validation before execution
- contextual policy governance before native calls
- event-history ledger for audit and future undo
- thin UI projection, never UI-owned command logic

## Full runtime pipeline

```text
Runtime boot
→ Native Environment Capture
→ Trust-Weighted Native Lexicon
→ Phrase Grammar
→ Native Symbol Binding
→ Intent / Target Semantic Analysis
→ Command Contract Binding
→ Capability Validation
→ Contextual Policy Governance
→ Approval + Execution Plan
→ Native Execution
→ Diagnostics + Event History + Undo Policy
→ Strip Projection
```

## Runtime boot path

```text
index.html
→ src/main.tsx
→ src/App.tsx
→ usePreviewPrediction
→ resolver / spine
```

This is the React boot path, not the authority model. `App.tsx` mounts the strip and forwards input into the runtime. It must not own resolver rules, command rules, risk rules, permission rules, undo logic, or native execution details.

## Environment path

```text
Rust native readers
→ NativeEnvironmentSnapshot
→ NativeEnvironmentIndex
→ Trust-Weighted Native Lexicon
```

### Native Environment Capture

Raw native readings from the Mac:

- installed apps
- known folders
- settings panes
- services
- Dock apps
- running apps
- frontmost app
- mounted volumes
- audio output where available
- permission/capability readings where available

### Native Vocabulary Index

A normalized searchable projection:

- label
- aliases
- target kind
- source
- source boost
- path / bundle ID / URL / identifier where available

### Trust-Weighted Native Lexicon

The command-ready interpretation layer:

- source quality matters
- live runtime state is useful but not always launchable
- static inventory is launchable but may not be running
- preview confidence is advisory, not authority
- submit-time governance must distrust resolver output

## Preview path

```text
input
→ classifyIntent
→ resolvePreview(input, NativeEnvironmentIndex)
→ PreviewPrediction
→ ghost completion / resolved affordance
```

Rules:

- preview is advisory only
- preview never executes
- preview never calls provider AI
- preview never performs native scans
- preview must be memory-only
- trailing whitespace suppresses preview so Space remains normal typing

## Submit path

```text
resolveNow(submittedInput)
→ runSpine(prediction, snapshot)
→ parseCommand
→ validateCommand
→ governCommand
→ executeCommand only if allowed
→ recordAttempt
→ statusFromOutcome
```

Current exact spine:

```text
Prediction + cached NativeEnvironmentSnapshot
→ Parser
→ Structural Validator
→ Contextual Governor
→ Native Executor, only when governor.status === "allow"
→ History Record
→ Strip Status Projection
```

If `governor.status` is `gate`, `block`, or `satisfied`, execution does not run. The attempt is still recorded.

## Command Contract Binding

Command Contract Binding is the stage that binds an interpreted intent plus a native target to a known executable contract.

It is not merely “mapping to an action.” It is binding to a declared promise:

```text
intent + target kind + required capabilities + risk + approval + undo + executor binding
```

Conceptual target shape:

```ts
{
  action: "app.focus",
  acceptedIntents: ["focus", "switch_to"],
  acceptedTargetKinds: ["app"],
  requiredCapabilities: ["bundle_id", "running_app"],
  requiredPermissions: [],
  riskClass: "safe",
  approvalPolicy: "auto",
  undoClass: "partially_reversible",
  executorCommand: "executor_focus_app"
}
```

Current repository shape:

- `src/spine/registry.ts` is the command contract registry surface.
- `src/spine/parser.ts` binds resolver output to ActionKind through the registry.
- `src/spine/validator.ts` performs structural/capability-floor checks.
- `src/spine/governor.ts` performs contextual policy judgement.
- `src/spine/undoPolicy.ts` declares reversibility policy.

## Trust split

```text
validator.ts
= structural correctness

registry.ts
= command contract source of truth

governor.ts
= contextual judgement

risk.ts
= danger classification

approve.ts
= approval decision

undoPolicy.ts
= reversibility contract

executor.ts
= native bridge only

history.ts
= audit trail

outcomeMessage.ts
= diagnostics projection
```

The validator must not become a fake governor. The governor must not become an executor. The executor must not validate policy.

## Performance invariants

```text
No native scan, filesystem crawl, permission probe, provider call, icon load, or full index rebuild may occur in the per-keystroke preview path.
```

Preview must be memory-only.

Submit may use cached context. Submit may later trigger a narrow runtime micro-refresh only for the action family being attempted.

Full native capture is launch-time, explicit refresh, or low-priority background refresh only.

## Refresh tiers

```text
Tier 1 — Boot capture
- installed apps
- known folders
- settings panes
- service seeds
- Dock apps

Tier 2 — Runtime refresh
- running apps
- frontmost app
- mounted volumes
- audio output

Tier 3 — Permission / capability refresh
- accessibility
- automation
- screen recording
- full disk access

Tier 4 — Rare / deep scan
- recent apps
- default handlers
- login items
- services deep inventory
```

Tier 4 is not required for the current product slice. Do not build support-shell or plugin infrastructure until there is a measured product need.

## Support shell stance

A future support CLI may exist for maintenance:

- doctor
- refresh cache
- rebuild lexicon
- export debug
- inspect runtime

Rules:

```text
Runtime = authority
Native providers = truth
Cache = memory
Support CLI = maintenance
Plugins = typed data providers
Shell = last-mile discovery tool
```

Support shell may discover, diagnose, cache, or repair. It may not bypass parser → validator → governor → executor. It may not become the product brain.

## Forbidden shortcuts

- no UI-owned command catalog
- no executor bypass
- no provider execution
- no parser hacks for specific apps
- no per-keystroke native scanning
- no shell as hidden brain
- no new action family without command contract, validation, governance, tests, and undo policy
- no user-facing raw enum codes, stack traces, “Error”, or “Failed” copy

## Current action surface

The current surface remains exactly 12 actions:

```text
app.open
app.quit
app.hide
app.focus
folder.open
service.open
settings.open
volume.set
volume.mute
volume.unmute
volume.step_up
volume.step_down
```

Do not expand the surface until approval UI, durable history, pre-state capture, and undo policy enforcement are stronger.
