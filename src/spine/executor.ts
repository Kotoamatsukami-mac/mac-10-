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
      case "service.open": {
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
      case "settings.open": {
        const identifier = cmd.target_ref.identifier;
        if (!identifier)
          return {
            kind: "failed",
            error_kind: "unknown",
            reason: "no identifier on target_ref",
          };
        await invoke<void>("executor_open_url", { url: identifier });
        return { kind: "ok" };
      }
      case "volume.set":
        return {
          kind: "failed",
          error_kind: "unknown",
          reason: "volume.set has no native command surface yet",
        };
      case "unknown":
        return { kind: "failed", error_kind: "unknown", reason: "unknown action" };
    }
  } catch (err) {
    const parsed = parseExecutorError(err);
    return { kind: "failed", ...parsed };
  }
}
