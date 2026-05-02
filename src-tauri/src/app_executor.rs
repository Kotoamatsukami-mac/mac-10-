// Phase 4 Slice 3 — App verb executor
//
// Bounded native commands for app.quit / app.hide / app.focus, all keyed by
// bundle_id. Uses NSWorkspace + NSRunningApplication via objc2-app-kit.
// No AppleScript, no shell, no /usr/bin/open invocation here. Each command
// returns a typed AppExecutorError on failure that the frontend maps to a
// guidance state.
//
// All three operations are reversible and bounded:
//   - quit asks the app to terminate cooperatively (terminate, not
//     terminateForcibly). The user can relaunch.
//   - hide hides all of the app's windows. The user can refocus.
//   - focus brings the app forward, optionally unhiding it.

use objc2::rc::Retained;
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
use objc2_foundation::{NSArray, NSString};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppExecutorError {
    // Reserved: distinguishing "never installed" from "not running" requires a
    // second NSWorkspace lookup and is not currently surfaced. Frontend already
    // accepts this variant in its typed error map.
    #[allow(dead_code)]
    AppNotFound {
        bundle_id: String,
    },
    AppNotRunning {
        bundle_id: String,
    },
}

impl std::fmt::Display for AppExecutorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AppNotFound { bundle_id } => {
                write!(f, "no installed app for bundle id: {bundle_id}")
            }
            Self::AppNotRunning { bundle_id } => {
                write!(f, "app not currently running: {bundle_id}")
            }
        }
    }
}

// Looks up running instances of an app by its bundle identifier.
// Returns the first instance found, or None if the app is not currently
// running. The "AppNotFound" branch is reserved for future tightening; for
// now Apple's API does not distinguish "never installed" from "not running"
// at this surface — both produce an empty array.
fn first_running_instance(bundle_id: &str) -> Option<Retained<NSRunningApplication>> {
    let ns_bid = NSString::from_str(bundle_id);
    let arr: Retained<NSArray<NSRunningApplication>> =
        NSRunningApplication::runningApplicationsWithBundleIdentifier(&ns_bid);
    if arr.count() == 0 {
        return None;
    }
    Some(arr.objectAtIndex(0))
}

#[tauri::command]
pub fn executor_quit_app(bundle_id: String) -> Result<(), AppExecutorError> {
    let app =
        first_running_instance(&bundle_id).ok_or_else(|| AppExecutorError::AppNotRunning {
            bundle_id: bundle_id.clone(),
        })?;
    // terminate() is a cooperative request. NSRunningApplication returns a
    // BOOL we ignore — terminate is asynchronous and the app may take time
    // to comply.
    let _ = app.terminate();
    Ok(())
}

#[tauri::command]
pub fn executor_hide_app(bundle_id: String) -> Result<(), AppExecutorError> {
    let app =
        first_running_instance(&bundle_id).ok_or_else(|| AppExecutorError::AppNotRunning {
            bundle_id: bundle_id.clone(),
        })?;
    // hide() returns a BOOL but the docs say repeated calls are idempotent
    // and observably no-op for already-hidden apps.
    let _ = app.hide();
    Ok(())
}

#[tauri::command]
pub fn executor_focus_app(bundle_id: String) -> Result<(), AppExecutorError> {
    let app =
        first_running_instance(&bundle_id).ok_or_else(|| AppExecutorError::AppNotRunning {
            bundle_id: bundle_id.clone(),
        })?;
    // ActivateAllWindows brings every window of the app forward, matching the
    // Cmd+Tab semantic the user expects from "focus / switch to".
    let opts = NSApplicationActivationOptions::ActivateAllWindows;
    let _ = app.activateWithOptions(opts);
    Ok(())
}
