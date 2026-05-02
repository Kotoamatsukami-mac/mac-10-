# Action Surface Contract

## Status

This document is a repo contract.

Labels used here:

- **Verified** means the current repository implements it.
- **Principle** means an engineering rule applied to this repo.
- **Future** means intended direction, not current behavior.
- **Forbidden** means an architectural drift path that must not be introduced.

## Principle — action surface is a contract

Macten actions are not casual features.

An action exists only when it has a command contract, validation stance, governance stance, executor stance, undo policy, documentation, and tests.

## Verified — current action surface

The current action surface is exactly 12 actions:

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

## Verified — action table

| Action | Target | Required field | Current risk | Approval posture | Undo posture | Executor stance |
| --- | --- | --- | --- | --- | --- | --- |
| `app.open` | app | path | safe | auto | partially reversible | `executor_open_path` |
| `app.quit` | app | bundle_id | attention | gated | not reversible | `executor_quit_app` |
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

## Future — richer command contracts

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

## Forbidden — action creep

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
