# Macten Security Model

## Trust boundary

The frontend (React in Tauri WebView) is **untrusted** relative to the Rust backend.

```
Frontend authority:
- May request typed commands only (via Tauri invoke)
- May NOT send shell strings
- May NOT send AppleScript / osascript
- May NOT request arbitrary filesystem writes
- May NOT construct commands outside the typed spine

Rust authority:
- Validates path existence before opening
- Validates URL schemes against static allowlist
- Owns all native side effects via /usr/bin/open
- Returns typed serializable errors (ExecutorError enum)
- Rejects unknown schemes, missing paths, and malformed requests
```

## Allowed URL schemes

```
http://
https://
x-apple.systempreferences:
mailto:
tel:
```

All other schemes are rejected at the Rust boundary.

## Execution boundary

- Only two Tauri commands execute OS actions: `executor_open_path` and `executor_open_url`
- No AppleScript, no osascript, no free-form shell
- No destructive filesystem operations
- No file write, move, delete, or rename
- No process kill or signal

## Tauri private API

The app uses `macos-private-api` for transparent window support.
This prevents Mac App Store distribution but is required for the floating strip UX.

## Distribution

- Direct `.dmg` distribution only (not Mac App Store)
- Code signing and notarization required before public distribution
- Unsigned builds are dev-only artifacts
