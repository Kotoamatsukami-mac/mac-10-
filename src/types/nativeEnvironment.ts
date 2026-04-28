import { invoke } from "@tauri-apps/api/core";

export type Reading<T> =
  | { kind: "available"; data: T }
  | { kind: "unavailable"; reason: string };

export interface InstalledApp {
  bundle_id: string | null;
  display_name: string;
  version: string | null;
  path: string;
  icon_path: string | null;
}

export interface KnownFolder {
  kind: string;
  path: string;
}

export interface SettingsPane {
  identifier: string;
  anchor: string;
  label: string;
}

export interface Service {
  name: string;
  path: string;
}

export interface DefaultHandler {
  scheme: string;
  bundle_id: string | null;
  path: string | null;
}

export interface DockPinnedApp {
  label: string | null;
  bundle_id: string | null;
  path: string | null;
}

export interface LoginItem {
  label: string;
  status: string;
}

export interface RecentApp {
  name: string;
  path: string;
}

export interface RecentItem {
  name: string;
  path: string;
}

export interface LaunchAgent {
  label: string | null;
  program_arguments: string[];
  path: string;
  scope: string;
}

export interface RunningApp {
  bundle_id: string | null;
  display_name: string;
  pid: number;
  is_active: boolean;
}

export interface AudioDevice {
  name: string;
  uid: string;
  is_default: boolean;
}

export interface AudioDevices {
  input: AudioDevice[];
  output: AudioDevice[];
}

export interface Display {
  id: number;
  width: number;
  height: number;
  is_main: boolean;
}

export interface Volume {
  name: string;
  mount_path: string;
}

export type PermissionStatus = "granted" | "denied" | "not_determined";

export interface StaticInventory {
  installed_apps: Reading<InstalledApp[]>;
  known_folders: Reading<KnownFolder[]>;
  system_settings_panes: Reading<SettingsPane[]>;
  services: Reading<Service[]>;
  default_handlers: Reading<DefaultHandler[]>;
}

export interface UserPreferenceSignals {
  dock_pinned_apps: Reading<DockPinnedApp[]>;
  login_items: Reading<LoginItem[]>;
  recent_apps: Reading<RecentApp[]>;
  recent_items: Reading<RecentItem[]>;
  menu_bar_agents: Reading<LaunchAgent[]>;
}

export interface LiveRuntimeState {
  running_apps: Reading<RunningApp[]>;
  frontmost_app: Reading<RunningApp | null>;
  audio_input_output_devices: Reading<AudioDevices>;
  connected_displays: Reading<Display[]>;
  mounted_volumes: Reading<Volume[]>;
}

export interface PermissionCapabilityMap {
  accessibility: Reading<PermissionStatus>;
  automation: Reading<PermissionStatus>;
  screen_recording: Reading<PermissionStatus>;
  full_disk_access: Reading<PermissionStatus>;
  notifications: Reading<PermissionStatus>;
}

export interface NativeEnvironmentSnapshot {
  captured_at: string;
  static_inventory: StaticInventory;
  user_preference_signals: UserPreferenceSignals;
  live_runtime_state: LiveRuntimeState;
  permission_capability_map: PermissionCapabilityMap;
}

export async function loadNativeEnvironment(): Promise<NativeEnvironmentSnapshot> {
  return await invoke<NativeEnvironmentSnapshot>(
    "get_native_environment_snapshot",
  );
}
