// Phase 4 — Executor bridge
//
// Two single-purpose Tauri commands the TS spine invokes after validation,
// risk classification, and approval. Both gate their input before delegating
// to /usr/bin/open (LaunchServices). No shell surface is exposed to JS, no
// AppleScript, no osascript, no destructive ops.
//
// Path command requires the path to exist. URL command requires the scheme
// to be on a static allowlist (http, https, mailto, tel, x-apple.systempreferences).
// Anything else is rejected at the boundary.

use std::path::PathBuf;
use std::process::Command;

const ALLOWED_URL_PREFIXES: &[&str] = &[
    "http://",
    "https://",
    "x-apple.systempreferences:",
    "mailto:",
    "tel:",
];

fn invoke_open(target: &str) -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .arg("--")
        .arg(target)
        .status()
        .map_err(|e| format!("could not invoke /usr/bin/open: {}", e))?;
    if !status.success() {
        return Err(format!("/usr/bin/open exited with {}", status));
    }
    Ok(())
}

#[tauri::command]
pub fn executor_open_path(path: String) -> Result<(), String> {
    let pb = PathBuf::from(&path);
    if !pb.exists() {
        return Err(format!("path does not exist: {}", path));
    }
    invoke_open(&path)
}

#[tauri::command]
pub fn executor_open_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !ALLOWED_URL_PREFIXES.iter().any(|p| lower.starts_with(p)) {
        return Err(format!("disallowed url scheme: {}", url));
    }
    invoke_open(&url)
}
