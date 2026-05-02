// Phase 4 — Executor bridge
//
// Calls the explicit Tauri commands defined in src-tauri/src/executor.rs.
// No URL building beyond what the resolver already produced; no shell;
// no destructive ops. Each branch ends in exactly one invoke.
//
// Typed executor errors: Rust returns serialized ExecutorError JSON.
// The catch block parses it to produce precise failure outcomes.

import { invoke } from "@tauri-apps/api/core";
import type { ParsedCommand } from "./parser";

export type ExecutorErrorKind =
  | "path_not_found"
  | "disallowed_scheme"
  | "open_failed"
  | "app_not_running"
  | "app_not_found"
  | "audio_unavailable"
  | "unknown";

export type ExecutionOutcome =
  | { kind: "ok" }
  | { kind: "failed"; error_kind: ExecutorErrorKind; reason: string };

function parseExecutorError(err: unknown): {
  error_kind: ExecutorErrorKind;
  reason: string;
} {
  if (typeof err === "object" && err !== null && "kind" in err) {
    const e = err as Record<string, string>;
    const kind = e.kind as ExecutorErrorKind;
    switch (kind) {
      case "path_not_found":
        return { error_kind: kind, reason: e.path ?? "path not found" };
      case "disallowed_scheme":
        return { error_kind: kind, reason: e.url ?? "disallowed scheme" };
      case "open_failed":
        return { error_kind: kind, reason: e.detail ?? "open failed" };
      case "app_not_running":
        return {
          error_kind: kind,
          reason: e.bundle_id ?? "app not running",
        };
      case "app_not_found":
        return { error_kind: kind, reason: e.bundle_id ?? "app not found" };
      case "audio_unavailable":
        return { error_kind: kind, reason: e.detail ?? "audio unavailable" };
    }
  }
  return { error_kind: "unknown", reason: String(err) };
}

export async function executeCommand(
  cmd: ParsedCommand,
): Promise<ExecutionOutcome> {
  if (!cmd.target_ref) {
    return { kind: "failed", error_kind: "unknown", reason: "no target_ref" };
  }

  try {
    switch (cmd.action) {
      case "app.open":
      case "folder.open": {
        const path = cmd.target_ref.path;
        if (!path)
          return {
            kind: "failed",
            error_kind: "unknown",
            reason: "no path on target_ref",
          };
        await invoke<void>("executor_open_path", { path });
        return { kind: "ok" };
      }
      case "service.open":
      case "settings.open": {
        const url = cmd.target_ref.url;
        if (!url)
          return {
            kind: "failed",
            error_kind: "unknown",
            reason: "no url on target_ref",
          };
        await invoke<void>("executor_open_url", { url });
        return { kind: "ok" };
      }
      case "app.quit":
      case "app.hide":
      case "app.focus": {
        const bundleId = cmd.target_ref.bundle_id ?? null;
        if (!bundleId)
          return {
            kind: "failed",
            error_kind: "unknown",
            reason: "no bundle_id on target_ref",
          };
        const tauriCommand =
          cmd.action === "app.quit"
            ? "executor_quit_app"
            : cmd.action === "app.hide"
              ? "executor_hide_app"
              : "executor_focus_app";
        await invoke<void>(tauriCommand, { bundleId });
        return { kind: "ok" };
      }
      case "volume.set": {
        const level = cmd.target_ref.numeric_arg;
        if (level === undefined || !Number.isFinite(level))
          return {
            kind: "failed",
            error_kind: "unknown",
            reason: "no numeric_arg on target_ref",
          };
        await invoke<void>("executor_set_volume", { level });
        return { kind: "ok" };
      }
      case "volume.mute":
        await invoke<void>("executor_set_mute", { mute: true });
        return { kind: "ok" };
      case "volume.unmute":
        await invoke<void>("executor_set_mute", { mute: false });
        return { kind: "ok" };
      case "volume.step_up":
        await invoke<void>("executor_step_volume", { delta: 6 });
        return { kind: "ok" };
      case "volume.step_down":
        await invoke<void>("executor_step_volume", { delta: -6 });
        return { kind: "ok" };
      case "unknown":
        return { kind: "failed", error_kind: "unknown", reason: "unknown action" };
    }
  } catch (err) {
    const parsed = parseExecutorError(err);
    return { kind: "failed", ...parsed };
  }
}
