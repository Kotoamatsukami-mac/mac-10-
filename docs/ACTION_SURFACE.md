# Action Contract Surface

## Status

This document is a repo contract.

Labels used here:

- **Verified** means the current repository implements it.
- **Principle** means an engineering rule applied to this repo.
- **Future** means intended direction, not current behavior.
- **Known limitation** means a real current gap.
- **Do not introduce** means an architectural drift path.

## Principle — actions are command contracts

Macten actions are not casual features.

An action exists only when it has a command contract, validation stance, governance stance, executor stance, undo policy, documentation, and tests.

The preferred conceptual name is **Command Contract**. The current file name remains `ACTION_SURFACE.md` because this document also freezes the public action boundary.

## Verified — current command contract surface

The current command contract surface is exactly 12 actions:

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

Owner file:

```text
src/spine/registry.ts
```

## Verified — contract table

| Action | Target | Required field | Current risk | Current approval posture | Undo posture | Executor stance |
| --- | --- | --- | --- | --- | --- | --- |
| `app.open` | app | path | safe | auto | partially reversible | `executor_open_path` |
| `app.quit` | app | bundle_id | attention | gated; inline Y/N UI not complete | not reversible | `executor_quit_app` |
| `app.hide` | app | bundle_id | safe | auto | partially reversible | `executor_hide_app` |
| `app.focus` | app | bundle_id | safe | auto | partially reversible | `executor_focus_app` |
| `folder.open` | folder / volume | path | safe | auto | partially reversible | `executor_open_path` |
| `service.open` | service | url | safe | auto | partially reversible | `executor_open_url` |
| `settings.open` | settings_pane | url | safe | auto | partially reversible | `executor_open_url` |
| `volume.set` | system_audio | numeric_arg | safe | auto | reversible with pre-state | `executor_set_volume` |
| `volume.mute` | system_audio | none | safe | auto | reversible with pre-state | `executor_set_mute(true)` |
| `volume.unmute` | system_audio | none | safe | auto | reversible with pre-state | `executor_set_mute(false)` |
| `volume.step_up` | system_audio | none | safe | auto | reversible with pre-state | `executor_step_volume(+6)` |
| `volume.step_down` | system_audio | none | safe | auto | reversible with pre-state | `executor_step_volume(-6)` |

## Known limitation — approval is gated but not interactive yet

`app.quit` currently reaches a governor/approval gate. The inline Y/N strip interaction is Phase 5 work.

Until that UI exists, docs must not imply that `app.quit` completes after a user-facing approval flow.

## Verified — current executor boundary

Executor bridge:

```text
src/spine/executor.ts
```

Native modules:

```text
src-tauri/src/executor.rs
src-tauri/src/app_executor.rs
src-tauri/src/volume_executor.rs
```

Current native command families:

- open path
- open URL
- quit app
- hide app
- focus app
- set volume
- set mute
- step volume

## Principle — no action without full contract

A new action must define all of the following before it is considered real:

- ActionKind
- accepted intent family
- accepted target kind
- required field or capability
- validation behavior
- governance behavior
- risk posture
- approval posture
- undo posture
- executor stance
- outcome copy
- tests
- docs update

## Future — fuller Command Contract Registry

Future command contracts may move more metadata into a single command-contract registry.

Target shape:

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

This is a future consolidation target, not the current file shape.

## Do not introduce — action creep

Do not add:

- destructive filesystem actions
- permanent delete
- shell passthrough actions
- provider-executed actions
- multi-step planner actions
- UI-only actions that skip the registry
- hidden action aliases that do not enter the command contract layer

## Verification

Minimum checks:

```bash
npx tsc --noEmit
npm test
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
```

Action-surface tests should prove:

- ActionKind set matches registry exactly
- executable registry entries have native command coverage or explicit parameterless executor stance
- every action has an undo policy
- every action has outcome mapping
- every new action updates this document
