// Phase 4 — Executor bridge
//
// Calls the explicit Tauri commands defined in src-tauri/src/executor.rs.
// No URL building beyond what the resolver already produced; no shell;
// no destructive ops. Each branch ends in exactly one invoke.

import { invoke } from "@tauri-apps/api/core";
import type { ParsedCommand } from "./parser";

export type ExecutionOutcome =
  | { kind: "ok" }
  | { kind: "failed"; reason: string };

export async function executeCommand(
  cmd: ParsedCommand,
): Promise<ExecutionOutcome> {
  if (!cmd.target_ref) {
    return { kind: "failed", reason: "no target_ref" };
  }

  try {
    switch (cmd.action) {
      case "app.open":
      case "folder.open": {
        const path = cmd.target_ref.path;
        if (!path) return { kind: "failed", reason: "no path on target_ref" };
        await invoke<void>("executor_open_path", { path });
        return { kind: "ok" };
      }
      case "service.open": {
        const url = cmd.target_ref.url;
        if (!url) return { kind: "failed", reason: "no url on target_ref" };
        await invoke<void>("executor_open_url", { url });
        return { kind: "ok" };
      }
      case "settings.open": {
        const identifier = cmd.target_ref.identifier;
        if (!identifier) {
          return { kind: "failed", reason: "no identifier on target_ref" };
        }
        await invoke<void>("executor_open_url", { url: identifier });
        return { kind: "ok" };
      }
      case "volume.set":
        return {
          kind: "failed",
          reason: "volume.set has no native command surface yet",
        };
      case "unknown":
        return { kind: "failed", reason: "unknown action" };
    }
  } catch (err) {
    return { kind: "failed", reason: String(err) };
  }
}
