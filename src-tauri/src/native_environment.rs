// Phase 2 — Native Environment Index
//
// Read-only discovery of the local Mac environment, normalised into one
// NativeEnvironmentSnapshot for later resolver use. Live-on-call only.
//
// Slice 1 implements the leaves achievable with stdlib + plist parsing.
// Leaves that require macOS framework bindings (NSWorkspace, CoreGraphics,
// CoreAudio, ApplicationServices, ServiceManagement, LaunchServices,
// UserNotifications) return typed `Unavailable { reason }`. No fakes.

use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

// ─── Reading wrapper ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Reading<T: Serialize> {
    Available { data: T },
    Unavailable { reason: String },
}

// ─── Top-level snapshot ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NativeEnvironmentSnapshot {
    pub captured_at: String,
    pub static_inventory: StaticInventory,
    pub user_preference_signals: UserPreferenceSignals,
    pub live_runtime_state: LiveRuntimeState,
    pub permission_capability_map: PermissionCapabilityMap,
}

// ─── Section types ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct StaticInventory {
    pub installed_apps: Reading<Vec<InstalledApp>>,
    pub known_folders: Reading<Vec<KnownFolder>>,
    pub system_settings_panes: Reading<Vec<SettingsPane>>,
    pub services: Reading<Vec<Service>>,
    pub default_handlers: Reading<Vec<DefaultHandler>>,
}

#[derive(Debug, Serialize)]
pub struct UserPreferenceSignals {
    pub dock_pinned_apps: Reading<Vec<DockPinnedApp>>,
    pub login_items: Reading<Vec<LoginItem>>,
    pub recent_apps: Reading<Vec<RecentApp>>,
    pub recent_items: Reading<Vec<RecentItem>>,
    pub menu_bar_agents: Reading<Vec<LaunchAgent>>,
}

#[derive(Debug, Serialize)]
pub struct LiveRuntimeState {
    pub running_apps: Reading<Vec<RunningApp>>,
    pub frontmost_app: Reading<Option<RunningApp>>,
    pub audio_input_output_devices: Reading<AudioDevices>,
    pub connected_displays: Reading<Vec<Display>>,
    pub mounted_volumes: Reading<Vec<Volume>>,
}

#[derive(Debug, Serialize)]
pub struct PermissionCapabilityMap {
    pub accessibility: Reading<PermissionStatus>,
    pub automation: Reading<PermissionStatus>,
    pub screen_recording: Reading<PermissionStatus>,
    pub full_disk_access: Reading<PermissionStatus>,
    pub notifications: Reading<PermissionStatus>,
}

// ─── Leaf records ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct InstalledApp {
    pub bundle_id: Option<String>,
    pub display_name: String,
    pub version: Option<String>,
    pub path: String,
    pub icon_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct KnownFolder {
    pub kind: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct SettingsPane {
    pub identifier: String,
    pub anchor: String,
    pub label: String,
}

#[derive(Debug, Serialize)]
pub struct Service {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct DefaultHandler {
    pub scheme: String,
    pub bundle_id: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DockPinnedApp {
    pub label: Option<String>,
    pub bundle_id: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginItem {
    pub label: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct RecentApp {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct RecentItem {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct LaunchAgent {
    pub label: Option<String>,
    pub program_arguments: Vec<String>,
    pub path: String,
    pub scope: String,
}

#[derive(Debug, Serialize)]
pub struct RunningApp {
    pub bundle_id: Option<String>,
    pub display_name: String,
    pub pid: i32,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub uid: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize)]
pub struct AudioDevices {
    pub input: Vec<AudioDevice>,
    pub output: Vec<AudioDevice>,
}

#[derive(Debug, Serialize)]
pub struct Display {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub is_main: bool,
}

#[derive(Debug, Serialize)]
pub struct Volume {
    pub name: String,
    pub mount_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    Granted,
    Denied,
    NotDetermined,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

// ─── static_inventory readers ───────────────────────────────────────────────

fn read_installed_apps() -> Reading<Vec<InstalledApp>> {
    let mut apps = Vec::new();
    let mut roots: Vec<PathBuf> = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Some(home) = home_dir() {
        roots.push(home.join("Applications"));
    }

    for root in &roots {
        let entries = match fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("app") {
                if let Some(app) = parse_app_bundle(&path) {
                    apps.push(app);
                }
            }
        }
    }

    Reading::Available { data: apps }
}

fn parse_app_bundle(path: &Path) -> Option<InstalledApp> {
    let info_plist_path = path.join("Contents").join("Info.plist");
    let value = plist::Value::from_file(&info_plist_path).ok()?;
    let dict = value.as_dictionary()?;

    let bundle_id = dict
        .get("CFBundleIdentifier")
        .and_then(|v| v.as_string())
        .map(String::from);

    let display_name = dict
        .get("CFBundleDisplayName")
        .or_else(|| dict.get("CFBundleName"))
        .and_then(|v| v.as_string())
        .map(String::from)
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string()
        });

    let version = dict
        .get("CFBundleShortVersionString")
        .or_else(|| dict.get("CFBundleVersion"))
        .and_then(|v| v.as_string())
        .map(String::from);

    let icon_path = dict
        .get("CFBundleIconFile")
        .and_then(|v| v.as_string())
        .map(|name| {
            let icns_name = if name.ends_with(".icns") {
                name.to_string()
            } else {
                format!("{}.icns", name)
            };
            path.join("Contents")
                .join("Resources")
                .join(icns_name)
                .to_string_lossy()
                .to_string()
        });

    Some(InstalledApp {
        bundle_id,
        display_name,
        version,
        path: path.to_string_lossy().to_string(),
        icon_path,
    })
}

fn read_known_folders() -> Reading<Vec<KnownFolder>> {
    let home = match home_dir() {
        Some(h) => h,
        None => {
            return Reading::Unavailable {
                reason: "HOME env var not set".into(),
            }
        }
    };

    let candidates: Vec<(&str, PathBuf)> = vec![
        ("home", home.clone()),
        ("documents", home.join("Documents")),
        ("downloads", home.join("Downloads")),
        ("desktop", home.join("Desktop")),
        ("music", home.join("Music")),
        ("pictures", home.join("Pictures")),
        ("movies", home.join("Movies")),
        ("public", home.join("Public")),
        ("library", home.join("Library")),
        (
            "icloud_drive",
            home.join("Library/Mobile Documents/com~apple~CloudDocs"),
        ),
    ];

    let folders = candidates
        .into_iter()
        .filter(|(_, p)| p.exists())
        .map(|(kind, p)| KnownFolder {
            kind: kind.to_string(),
            path: p.to_string_lossy().to_string(),
        })
        .collect();

    Reading::Available { data: folders }
}

fn read_system_settings_panes() -> Reading<Vec<SettingsPane>> {
    let panes: &[(&str, &str, &str)] = &[
        (
            "privacy_accessibility",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            "Privacy & Security — Accessibility",
        ),
        (
            "privacy_screen_capture",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
            "Privacy & Security — Screen Recording",
        ),
        (
            "privacy_automation",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
            "Privacy & Security — Automation",
        ),
        (
            "privacy_all_files",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
            "Privacy & Security — Full Disk Access",
        ),
        (
            "notifications",
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
            "Notifications",
        ),
        (
            "displays",
            "x-apple.systempreferences:com.apple.preference.displays",
            "Displays",
        ),
        (
            "sound",
            "x-apple.systempreferences:com.apple.preference.sound",
            "Sound",
        ),
        (
            "network",
            "x-apple.systempreferences:com.apple.preference.network",
            "Network",
        ),
        (
            "keyboard",
            "x-apple.systempreferences:com.apple.preference.keyboard",
            "Keyboard",
        ),
        (
            "trackpad",
            "x-apple.systempreferences:com.apple.preference.trackpad",
            "Trackpad",
        ),
    ];

    Reading::Available {
        data: panes
            .iter()
            .map(|(id, anchor, label)| SettingsPane {
                identifier: (*id).to_string(),
                anchor: (*anchor).to_string(),
                label: (*label).to_string(),
            })
            .collect(),
    }
}

fn read_services() -> Reading<Vec<Service>> {
    let mut services = Vec::new();
    let mut roots: Vec<PathBuf> = vec![
        PathBuf::from("/System/Library/Services"),
        PathBuf::from("/Library/Services"),
    ];
    if let Some(home) = home_dir() {
        roots.push(home.join("Library/Services"));
    }

    for root in &roots {
        let entries = match fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = match path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_string(),
                None => continue,
            };
            services.push(Service {
                name,
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    Reading::Available { data: services }
}

fn read_default_handlers() -> Reading<Vec<DefaultHandler>> {
    Reading::Unavailable {
        reason: "LaunchServices (LSCopyDefaultApplicationURLForURL) binding deferred".into(),
    }
}

// ─── user_preference_signals readers ────────────────────────────────────────

fn read_dock_pinned_apps() -> Reading<Vec<DockPinnedApp>> {
    let home = match home_dir() {
        Some(h) => h,
        None => {
            return Reading::Unavailable {
                reason: "HOME env var not set".into(),
            }
        }
    };

    let dock_path = home.join("Library/Preferences/com.apple.dock.plist");
    let value = match plist::Value::from_file(&dock_path) {
        Ok(v) => v,
        Err(e) => {
            return Reading::Unavailable {
                reason: format!("could not read dock plist: {}", e),
            }
        }
    };

    let dict = match value.as_dictionary() {
        Some(d) => d,
        None => {
            return Reading::Unavailable {
                reason: "dock plist is not a dictionary".into(),
            }
        }
    };

    let persistent = match dict.get("persistent-apps").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return Reading::Available { data: Vec::new() },
    };

    let apps = persistent
        .iter()
        .filter_map(|entry| {
            let entry_dict = entry.as_dictionary()?;
            let tile_data = entry_dict
                .get("tile-data")
                .and_then(|v| v.as_dictionary())?;

            let label = tile_data
                .get("file-label")
                .and_then(|v| v.as_string())
                .map(String::from);

            let bundle_id = tile_data
                .get("bundle-identifier")
                .and_then(|v| v.as_string())
                .map(String::from);

            let path = tile_data
                .get("file-data")
                .and_then(|v| v.as_dictionary())
                .and_then(|d| d.get("_CFURLString"))
                .and_then(|v| v.as_string())
                .map(String::from);

            Some(DockPinnedApp {
                label,
                bundle_id,
                path,
            })
        })
        .collect();

    Reading::Available { data: apps }
}

fn read_login_items() -> Reading<Vec<LoginItem>> {
    Reading::Unavailable {
        reason: "ServiceManagement (SMAppService) binding deferred — macOS 13+ also restricts \
                 third-party enumeration of system-wide LoginItems"
            .into(),
    }
}

fn read_recent_apps() -> Reading<Vec<RecentApp>> {
    Reading::Unavailable {
        reason: "com.apple.sharedfilelist.*.sfl3 is binary NSKeyedArchiver — out of scope for \
                 pure plist read"
            .into(),
    }
}

fn read_recent_items() -> Reading<Vec<RecentItem>> {
    Reading::Unavailable {
        reason: "com.apple.sharedfilelist.*.sfl3 is binary NSKeyedArchiver — out of scope for \
                 pure plist read"
            .into(),
    }
}

fn read_menu_bar_agents() -> Reading<Vec<LaunchAgent>> {
    let mut agents = Vec::new();
    let mut roots: Vec<(PathBuf, &'static str)> = vec![
        (PathBuf::from("/Library/LaunchAgents"), "system_user"),
        (PathBuf::from("/Library/LaunchDaemons"), "system_daemon"),
    ];
    if let Some(home) = home_dir() {
        roots.insert(0, (home.join("Library/LaunchAgents"), "user"));
    }

    for (root, scope) in &roots {
        let entries = match fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("plist") {
                continue;
            }
            let value = match plist::Value::from_file(&path) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dict = match value.as_dictionary() {
                Some(d) => d,
                None => continue,
            };
            let label = dict
                .get("Label")
                .and_then(|v| v.as_string())
                .map(String::from);
            let program_arguments = dict
                .get("ProgramArguments")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_string().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            agents.push(LaunchAgent {
                label,
                program_arguments,
                path: path.to_string_lossy().to_string(),
                scope: (*scope).to_string(),
            });
        }
    }

    Reading::Available { data: agents }
}

// ─── live_runtime_state readers ─────────────────────────────────────────────

fn read_running_apps() -> Reading<Vec<RunningApp>> {
    Reading::Unavailable {
        reason: "NSWorkspace.runningApplications binding deferred".into(),
    }
}

fn read_frontmost_app() -> Reading<Option<RunningApp>> {
    Reading::Unavailable {
        reason: "NSWorkspace.frontmostApplication binding deferred".into(),
    }
}

fn read_audio_devices() -> Reading<AudioDevices> {
    Reading::Unavailable {
        reason: "CoreAudio AudioObjectGetPropertyData binding deferred".into(),
    }
}

fn read_connected_displays() -> Reading<Vec<Display>> {
    Reading::Unavailable {
        reason: "CoreGraphics CGGetActiveDisplayList binding deferred".into(),
    }
}

fn read_mounted_volumes() -> Reading<Vec<Volume>> {
    let entries = match fs::read_dir("/Volumes") {
        Ok(e) => e,
        Err(e) => {
            return Reading::Unavailable {
                reason: format!("could not read /Volumes: {}", e),
            }
        }
    };

    let volumes = entries
        .flatten()
        .map(|entry| {
            let path = entry.path();
            Volume {
                name: entry.file_name().to_string_lossy().to_string(),
                mount_path: path.to_string_lossy().to_string(),
            }
        })
        .collect();

    Reading::Available { data: volumes }
}

// ─── permission_capability_map readers ──────────────────────────────────────

fn read_accessibility_permission() -> Reading<PermissionStatus> {
    Reading::Unavailable {
        reason: "ApplicationServices AXIsProcessTrusted binding deferred".into(),
    }
}

fn read_automation_permission() -> Reading<PermissionStatus> {
    Reading::Unavailable {
        reason: "non-invasive probe requires sending an Apple Event — violates the \
                 no-AppleScript / no-osascript rule"
            .into(),
    }
}

fn read_screen_recording_permission() -> Reading<PermissionStatus> {
    Reading::Unavailable {
        reason: "CoreGraphics CGPreflightScreenCaptureAccess binding deferred".into(),
    }
}

fn read_full_disk_access_permission() -> Reading<PermissionStatus> {
    Reading::Unavailable {
        reason: "only detectable by probing TCC-protected paths — invasive, declined for \
                 read-only slice"
            .into(),
    }
}

fn read_notifications_permission() -> Reading<PermissionStatus> {
    Reading::Unavailable {
        reason: "UNUserNotificationCenter requires async authorization request and a proper \
                 NSApplication delegate"
            .into(),
    }
}

// ─── Public capture API ─────────────────────────────────────────────────────

pub fn capture() -> NativeEnvironmentSnapshot {
    NativeEnvironmentSnapshot {
        captured_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        static_inventory: StaticInventory {
            installed_apps: read_installed_apps(),
            known_folders: read_known_folders(),
            system_settings_panes: read_system_settings_panes(),
            services: read_services(),
            default_handlers: read_default_handlers(),
        },
        user_preference_signals: UserPreferenceSignals {
            dock_pinned_apps: read_dock_pinned_apps(),
            login_items: read_login_items(),
            recent_apps: read_recent_apps(),
            recent_items: read_recent_items(),
            menu_bar_agents: read_menu_bar_agents(),
        },
        live_runtime_state: LiveRuntimeState {
            running_apps: read_running_apps(),
            frontmost_app: read_frontmost_app(),
            audio_input_output_devices: read_audio_devices(),
            connected_displays: read_connected_displays(),
            mounted_volumes: read_mounted_volumes(),
        },
        permission_capability_map: PermissionCapabilityMap {
            accessibility: read_accessibility_permission(),
            automation: read_automation_permission(),
            screen_recording: read_screen_recording_permission(),
            full_disk_access: read_full_disk_access_permission(),
            notifications: read_notifications_permission(),
        },
    }
}

#[tauri::command]
pub fn get_native_environment_snapshot() -> NativeEnvironmentSnapshot {
    capture()
}
