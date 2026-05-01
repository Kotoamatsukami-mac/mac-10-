// Phase 4 — Executor bridge
//
// Two single-purpose Tauri commands the TS spine invokes after validation,
// risk classification, and approval. Both gate their input before delegating
// to /usr/bin/open (LaunchServices). No shell surface is exposed to JS, no
// AppleScript, no osascript, no destructive ops.
//
// Returns typed serializable errors so the frontend can map failures to
// precise user-facing guidance instead of generic "Try again".

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

const ALLOWED_URL_PREFIXES: &[&str] = &[
    "http://",
    "https://",
    "x-apple.systempreferences:",
    "mailto:",
    "tel:",
];

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ExecutorError {
    PathNotFound { path: String },
    DisallowedScheme { url: String },
    OpenFailed { target: String, detail: String },
}

// Tauri 2 requires Into<InvokeError>, which is satisfied by Serialize.
// The frontend receives the JSON-serialized enum on rejection.

impl std::fmt::Display for ExecutorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PathNotFound { path } => write!(f, "path not found: {path}"),
            Self::DisallowedScheme { url } => write!(f, "disallowed scheme: {url}"),
            Self::OpenFailed { target, detail } => {
                write!(f, "open failed for {target}: {detail}")
            }
        }
    }
}

fn invoke_open(target: &str) -> Result<(), ExecutorError> {
    let status = Command::new("/usr/bin/open")
        .arg("--")
        .arg(target)
        .status()
        .map_err(|e| ExecutorError::OpenFailed {
            target: target.to_string(),
            detail: e.to_string(),
        })?;
    if !status.success() {
        return Err(ExecutorError::OpenFailed {
            target: target.to_string(),
            detail: format!("exit {status}"),
        });
    }
    Ok(())
}

#[tauri::command]
pub fn executor_open_path(path: String) -> Result<(), ExecutorError> {
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(ExecutorError::PathNotFound { path });
    }
    invoke_open(&path)
}

#[tauri::command]
pub fn executor_open_url(url: String) -> Result<(), ExecutorError> {
    let lower = url.to_ascii_lowercase();
    if !ALLOWED_URL_PREFIXES.iter().any(|p| lower.starts_with(p)) {
        return Err(ExecutorError::DisallowedScheme { url });
    }
    invoke_open(&url)
}
