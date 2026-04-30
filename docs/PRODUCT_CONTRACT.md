# MACTEN

COMMAND YOUR MAC IN ONE SENTENCE

## Product boundary

Macten is a compact macOS command strip that turns one plain sentence into one verified native Mac action or one explicit plan requiring approval.

Macten is not:
- chat
- dashboard
- terminal clone
- generic AI agent
- cloud puppet
- automation playground

## Doctrine

THE MAC IS THE DICTIONARY
THE BAR IS THE INTERPRETER
THE COMMAND SPINE IS THE TRUST LAYER

## Command Spine

Macten has two related local paths. They must not be merged or confused.

Preview path, advisory only:

NativeEnvironmentSnapshot → NativeEnvironmentIndex → resolvePreview → PreviewPrediction → ghost completion

Submit path, execution capable:

resolveNow(currentInput) → parser → validator → risk → approve → executor → history

No provider, shortcut, UI helper, or smart path may bypass the submit spine.

## Interpretation layer

Macten's interpretation layer feels AI-grade by reading the user's sentence against the Mac's real local vocabulary — installed apps, folders, browsers, services, settings, permissions, and command history — instead of guessing from an empty prompt.

The Native Environment Index is the resolver-facing projection of that local vocabulary. The moat is verifiability, not linguistic supremacy.

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

## Build order

1. Draggable strip
2. Native Environment Index
3. Preview interpretation
4. Safe local command execution
5. Approval and history
6. Provider interpretation only after local path is proven
