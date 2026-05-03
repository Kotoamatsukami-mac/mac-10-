// Phase 5 groundwork — Governor context tests
//
// These tests intentionally feed plausible-but-wrong submit predictions into
// the trust layer. The point is to make the spine less gullible than the
// preview resolver.

import assert from "node:assert/strict";
import test from "node:test";

import type { NativeEnvironmentSnapshot } from "../src/types/nativeEnvironment.ts";
import type { PreviewPrediction } from "../src/resolver/previewResolver.ts";
import { parseCommand } from "../src/spine/parser.ts";
import { validateCommand } from "../src/spine/validator.ts";
import { governCommand } from "../src/spine/governor.ts";
import { COMMAND_REGISTRY, type ActionKind } from "../src/spine/registry.ts";
import { allUndoPolicies, undoPolicyFor } from "../src/spine/undoPolicy.ts";
import { runSpine } from "../src/spine/runSpine.ts";
import { statusFromOutcome } from "../src/spine/outcomeMessage.ts";

function snapshotWithRunning(bundleIds: string[]): NativeEnvironmentSnapshot {
  return {
    captured_at: "1970-01-01T00:00:00Z",
    static_inventory: {
      installed_apps: { kind: "available", data: [] },
      known_folders: { kind: "available", data: [] },
      system_settings_panes: { kind: "available", data: [] },
      services: { kind: "available", data: [] },
      default_handlers: { kind: "unavailable", reason: "fixture" },
    },
    user_preference_signals: {
      dock_pinned_apps: { kind: "available", data: [] },
      login_items: { kind: "unavailable", reason: "fixture" },
      recent_apps: { kind: "unavailable", reason: "fixture" },
      recent_items: { kind: "unavailable", reason: "fixture" },
      menu_bar_agents: { kind: "available", data: [] },
    },
    live_runtime_state: {
      running_apps: {
        kind: "available",
        data: bundleIds.map((bundle_id, i) => ({
          bundle_id,
          display_name: `Fixture ${i}`,
          pid: 100 + i,
          is_active: i === 0,
        })),
      },
      frontmost_app: { kind: "available", data: null },
      audio_input_output_devices: {
        kind: "available",
        data: {
          input: [],
          output: [{ name: "Speakers", uid: "fixture", is_default: true }],
        },
      },
      connected_displays: { kind: "unavailable", reason: "fixture" },
      mounted_volumes: { kind: "available", data: [] },
    },
    permission_capability_map: {
      accessibility: { kind: "unavailable", reason: "fixture" },
      automation: { kind: "unavailable", reason: "fixture" },
      screen_recording: { kind: "unavailable", reason: "fixture" },
      full_disk_access: { kind: "unavailable", reason: "fixture" },
      notifications: { kind: "unavailable", reason: "fixture" },
    },
  };
}

function predictionFor(
  target_kind: string,
  target_ref: PreviewPrediction["target_ref"],
  overrides: Partial<PreviewPrediction> = {},
): PreviewPrediction {
  return {
    raw_input: "fixture",
    normalized_input: "fixture",
    action_phrase: null,
    intent: "open",
    action_kind: "open_app",
    completion: "",
    display_label: target_ref?.label ?? "fixture",
    confidence: 1,
    confidence_tier: "exact",
    source: "static_inventory",
    target_kind,
    target_ref,
    ...overrides,
  } as PreviewPrediction;
}

function decisionFor(prediction: PreviewPrediction, snapshot: NativeEnvironmentSnapshot | null = null) {
  const parsed = parseCommand(prediction);
  const validation = validateCommand(parsed);
  return governCommand(parsed, validation, snapshot);
}

test("governor blocks app.open when resolver hands it a live-runtime-sourced launch path", () => {
  const decision = decisionFor(
    predictionFor(
      "app",
      {
        id: "running:com.apple.Safari",
        label: "Safari",
        bundle_id: "com.apple.Safari",
        path: "/Applications/Safari.app",
      },
      { source: "live_runtime_state" },
    ),
    snapshotWithRunning(["com.apple.Safari"]),
  );

  assert.equal(decision.status, "block");
  assert.equal(decision.guidance, "needs_more");
  assert.match(decision.reason, /launchable static app path/);
});

test("governor blocks focus when runtime evidence says the app is not running", () => {
  const decision = decisionFor(
    predictionFor(
      "app",
      { id: "app:com.apple.Safari", label: "Safari", bundle_id: "com.apple.Safari" },
      { intent: "focus", action_kind: "focus_app" },
    ),
    snapshotWithRunning([]),
  );

  assert.equal(decision.status, "block");
  assert.equal(decision.guidance, "unsupported_yet");
  assert.match(decision.reason, /requires the app to be running/);
});

test("governor gates app.quit with approval when runtime evidence supports it", () => {
  const decision = decisionFor(
    predictionFor(
      "app",
      { id: "running:com.apple.Safari", label: "Safari", bundle_id: "com.apple.Safari" },
      { intent: "quit", action_kind: "quit_app", source: "live_runtime_state" },
    ),
    snapshotWithRunning(["com.apple.Safari"]),
  );

  assert.equal(decision.status, "gate");
  assert.equal(decision.guidance, "approval_needed");
  assert.equal(decision.approval.kind, "needs_approval");
  assert.equal(decision.undo_policy.undo_class, "not_reversible");
});

test("governor blocks app.quit when runtime state cannot prove the app is running", () => {
  const snapshot = snapshotWithRunning(["com.apple.Safari"]);
  snapshot.live_runtime_state.running_apps = { kind: "unavailable", reason: "fixture" };

  const decision = decisionFor(
    predictionFor(
      "app",
      { id: "running:com.apple.Safari", label: "Safari", bundle_id: "com.apple.Safari" },
      { intent: "quit", action_kind: "quit_app", source: "live_runtime_state" },
    ),
    snapshot,
  );

  assert.equal(decision.status, "block");
  assert.equal(decision.guidance, "unsupported_yet");
  assert.equal(decision.approval.kind, "rejected");
  assert.match(decision.reason, /cannot verify the app is running/);
});

test("runSpine records unverifiable app.quit without executing", async () => {
  const snapshot = snapshotWithRunning(["com.apple.Safari"]);
  snapshot.live_runtime_state.running_apps = { kind: "unavailable", reason: "fixture" };

  const outcome = await runSpine(
    predictionFor(
      "app",
      { id: "running:com.apple.Safari", label: "Safari", bundle_id: "com.apple.Safari" },
      { intent: "quit", action_kind: "quit_app", source: "live_runtime_state" },
    ),
    snapshot,
  );

  assert.deepEqual(outcome.validation, { kind: "valid" });
  assert.equal(outcome.governor.status, "block");
  assert.equal(outcome.governor.approval.kind, "rejected");
  assert.equal(outcome.execution, null);
  assert.equal(outcome.record.governor?.status, "block");
  assert.equal(outcome.record.execution, null);
  assert.deepEqual(statusFromOutcome(outcome), {
    kind: "blocked",
    msg: "Can't confirm running.",
  });
});

test("governor does not execute focus for the already-frontmost app", () => {
  const snapshot = snapshotWithRunning(["com.apple.Safari"]);
  snapshot.live_runtime_state.frontmost_app = {
    kind: "available",
    data: {
      bundle_id: "com.apple.Safari",
      display_name: "Safari",
      pid: 100,
      is_active: true,
    },
  };

  const decision = decisionFor(
    predictionFor(
      "app",
      { id: "running:com.apple.Safari", label: "Safari", bundle_id: "com.apple.Safari" },
      { intent: "focus", action_kind: "focus_app", source: "live_runtime_state" },
    ),
    snapshot,
  );

  assert.equal(decision.status, "gate");
  assert.equal(decision.guidance, "unsupported_yet");
  assert.match(decision.reason, /already frontmost/);
});

test("runSpine records already-frontmost app.focus without executing", async () => {
  const snapshot = snapshotWithRunning(["com.apple.Safari"]);
  snapshot.live_runtime_state.frontmost_app = {
    kind: "available",
    data: {
      bundle_id: "com.apple.Safari",
      display_name: "Safari",
      pid: 100,
      is_active: true,
    },
  };

  const outcome = await runSpine(
    predictionFor(
      "app",
      { id: "running:com.apple.Safari", label: "Safari", bundle_id: "com.apple.Safari" },
      { intent: "focus", action_kind: "focus_app", source: "live_runtime_state" },
    ),
    snapshot,
  );

  assert.deepEqual(outcome.validation, { kind: "valid" });
  assert.equal(outcome.governor.status, "gate");
  assert.equal(outcome.governor.guidance, "unsupported_yet");
  assert.equal(outcome.execution, null);
  assert.equal(outcome.record.governor?.status, "gate");
  assert.equal(outcome.record.execution, null);
  assert.deepEqual(statusFromOutcome(outcome), {
    kind: "hint",
    msg: "Already focused.",
  });
});

test("governor blocks unsafe service URL schemes", () => {
  const decision = decisionFor(
    predictionFor(
      "service",
      { id: "service:bad", label: "Bad", url: "file:///etc/passwd" },
      { intent: "open", action_kind: "open_service" },
    ),
    snapshotWithRunning([]),
  );

  assert.equal(decision.status, "block");
  assert.equal(decision.guidance, "blocked");
});

test("governor blocks malformed System Settings URLs", () => {
  const decision = decisionFor(
    predictionFor(
      "settings_pane",
      { id: "settings_pane:bad", label: "Settings", url: "https://example.com" },
      { intent: "open", action_kind: "open_settings_pane" },
    ),
    snapshotWithRunning([]),
  );

  assert.equal(decision.status, "block");
  assert.equal(decision.guidance, "blocked");
});

test("governor allows bounded volume.set when audio output is known", () => {
  const decision = decisionFor(
    predictionFor(
      "system_audio",
      { id: "system_audio:default_output", label: "Volume", numeric_arg: 40 },
      { intent: "volume_set", action_kind: "set_volume", source: "grammar" },
    ),
    snapshotWithRunning([]),
  );

  assert.equal(decision.status, "allow");
  assert.equal(decision.approval.kind, "auto_approved");
  assert.equal(decision.undo_policy.undo_class, "reversible");
});

test("every registry action has an undo policy", () => {
  const policies = allUndoPolicies();
  const actions = new Set(policies.map((p) => p.action));

  for (const entry of COMMAND_REGISTRY) {
    assert.ok(actions.has(entry.action), `${entry.action} must have an undo policy`);
    assert.equal(undoPolicyFor(entry.action).action, entry.action);
  }

  assert.equal(policies.length, COMMAND_REGISTRY.length);
});

test("app.quit is never treated as safely reversible", () => {
  const policy = undoPolicyFor("app.quit" as ActionKind);
  assert.equal(policy.undo_class, "not_reversible");
  assert.equal(policy.requires_pre_state, true);
});
