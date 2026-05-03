// Phase 4 — Spine trust-layer invariants
//
// Locks the contracts that the executable command spine depends on:
//
//   1. Every executable=true registry entry is backed by a Rust command.
//   2. validateCommand maps every failure to exactly one GuidanceState.
//   3. assessRisk + approve gate compose into the documented matrix.
//   4. statusFromOutcome covers every branch the spine can produce.
//
// These tests intentionally do not exercise the Rust executor itself —
// that is covered indirectly through executor.ts error parsing and the
// CI cargo check / clippy gates.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  COMMAND_REGISTRY,
  actionFromTargetKind,
  findEntry,
  type ActionKind,
} from "../src/spine/registry.ts";
import { parseCommand } from "../src/spine/parser.ts";
import { validateCommand } from "../src/spine/validator.ts";
import { assessRisk } from "../src/spine/risk.ts";
import { approve } from "../src/spine/approve.ts";
import {
  shortLabel,
  statusFromOutcome,
  statusFromResolveNow,
} from "../src/spine/outcomeMessage.ts";
import type { PreviewPrediction } from "../src/resolver/previewResolver.ts";
import { runSpine, type SpineOutcome } from "../src/spine/runSpine.ts";

// ─── Fixtures ───────────────────────────────────────────────────────────────

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

function outcomeFor(partial: Partial<SpineOutcome>): SpineOutcome {
  const prediction =
    partial.parsed?.prediction ??
    predictionFor("app", {
      id: "app:fixture",
      label: "Fixture App",
      path: "/Applications/Fixture.app",
    });
  const parsed =
    partial.parsed ??
    ({
      raw_input: prediction.raw_input,
      action: "app.open" as ActionKind,
      target_ref: prediction.target_ref,
      prediction,
    } as SpineOutcome["parsed"]);
  return {
    parsed,
    validation: { kind: "valid" },
    risk: null,
    approval: null,
    execution: null,
    record: {
      id: "fixture",
      timestamp: "1970-01-01T00:00:00.000Z",
      raw_input: prediction.raw_input,
      action: parsed.action,
      target_label: parsed.target_ref?.label ?? null,
      validation: { kind: "valid" },
      risk: null,
      approval: null,
      execution: null,
    },
    ...partial,
  } as SpineOutcome;
}

// ─── Registry ↔ Rust executor contract ──────────────────────────────────────

test("every executable registry action is backed by a Rust command", () => {
  // Rust executor surface is split across three modules: open-style targets
  // in executor.rs, app verbs in app_executor.rs, volume in volume_executor.rs.
  // We concatenate before searching so the test holds regardless of where a
  // future command lives.
  const rust =
    readFileSync("src-tauri/src/executor.rs", "utf8") +
    "\n" +
    readFileSync("src-tauri/src/app_executor.rs", "utf8") +
    "\n" +
    readFileSync("src-tauri/src/volume_executor.rs", "utf8");
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const tsExecutor = readFileSync("src/spine/executor.ts", "utf8");

  const expectedRustCommands = [
    "executor_open_path",
    "executor_open_url",
    "executor_quit_app",
    "executor_hide_app",
    "executor_focus_app",
    "executor_set_volume",
    "executor_set_mute",
    "executor_step_volume",
  ];

  for (const cmd of expectedRustCommands) {
    assert.ok(tsExecutor.includes(`"${cmd}"`), `TS executor must invoke ${cmd}`);
    assert.ok(rust.includes(`pub fn ${cmd}(`), `Rust must define ${cmd}`);
    assert.ok(lib.includes(cmd), `lib.rs invoke_handler must register ${cmd}`);
  }

  // Every executable=true entry must declare at least one required field
  // that the Rust surface knows how to consume, OR be a parameter-free
  // action (volume.mute / unmute / step_up / step_down) where the action
  // itself fully encodes intent.
  const consumedFields = new Set([
    "path",
    "url",
    "bundle_id",
    "numeric_arg",
  ]);
  const parameterlessActions = new Set([
    "volume.mute",
    "volume.unmute",
    "volume.step_up",
    "volume.step_down",
  ]);
  for (const entry of COMMAND_REGISTRY) {
    if (!entry.executable) continue;
    if (parameterlessActions.has(entry.action)) {
      assert.equal(
        entry.required.length,
        0,
        `${entry.action} should require no fields`,
      );
      continue;
    }
    const reaches = entry.required.some((f) => consumedFields.has(f));
    assert.ok(
      reaches,
      `executable action ${entry.action} requires fields none of the Rust commands consume`,
    );
  }
});

test("inert registry entries declare no required fields", () => {
  for (const entry of COMMAND_REGISTRY) {
    if (entry.executable) continue;
    assert.equal(
      entry.required.length,
      0,
      `inert action ${entry.action} should not declare required fields until it has a backing command`,
    );
  }
});

test("actionFromTargetKind defaults to the open verb for each open-style kind", () => {
  // The single-arg shim treats absence of intent as "open". Every kind whose
  // open-verb registry entry exists should resolve through it.
  const cases: ReadonlyArray<[string, ActionKind]> = [
    ["app", "app.open"],
    ["folder", "folder.open"],
    ["volume", "folder.open"],
    ["service", "service.open"],
    ["settings_pane", "settings.open"],
    ["system_audio", "volume.set"],
  ];
  for (const [kind, expected] of cases) {
    if (kind === "system_audio") {
      // system_audio has no "open" intent registered; the default-shim should
      // return null because no entry pairs (open, system_audio).
      assert.equal(
        actionFromTargetKind(kind),
        null,
        "system_audio is not an open-style target",
      );
    } else {
      assert.equal(
        actionFromTargetKind(kind),
        expected,
        `target_kind ${kind} should default to ${expected} under the open verb`,
      );
    }
  }
  assert.equal(actionFromTargetKind("not_a_kind"), null);
});

// ─── Validator guidance mapping ─────────────────────────────────────────────

test("validator: unknown action → needs_more", () => {
  const cmd = parseCommand(predictionFor("nonsense", null));
  const v = validateCommand(cmd);
  assert.equal(v.kind, "invalid");
  if (v.kind === "invalid") assert.equal(v.guidance, "needs_more");
});

test("validator: requires numeric_arg on volume.set", () => {
  // Pair the volume_set intent with the system_audio target_kind but omit the
  // numeric_arg field. Validator must catch it and return needs_more.
  const v = validateCommand({
    raw_input: "set volume",
    action: "volume.set",
    target_ref: { id: "system_audio:default_output", label: "Volume" },
    prediction: predictionFor("system_audio", {
      id: "system_audio:default_output",
      label: "Volume",
    }, { intent: "volume_set", action_kind: "set_volume" }),
  });
  assert.equal(v.kind, "invalid");
  if (v.kind === "invalid") assert.equal(v.guidance, "needs_more");
});

test("validator: missing target_ref → needs_more", () => {
  const v = validateCommand({
    raw_input: "open",
    action: "app.open",
    target_ref: null,
    prediction: predictionFor("app", null),
  });
  assert.equal(v.kind, "invalid");
  if (v.kind === "invalid") assert.equal(v.guidance, "needs_more");
});

test("validator: ambiguous prediction → choose_one", () => {
  const cmd = parseCommand(
    predictionFor(
      "app",
      { id: "a", label: "A", path: "/Applications/A.app" },
      { confidence_tier: "ambiguous", confidence: 0.5 },
    ),
  );
  const v = validateCommand(cmd);
  assert.equal(v.kind, "invalid");
  if (v.kind === "invalid") assert.equal(v.guidance, "choose_one");
});

test("validator: low-confidence contains → needs_more", () => {
  const cmd = parseCommand(
    predictionFor(
      "app",
      { id: "a", label: "A", path: "/Applications/A.app" },
      { confidence_tier: "contains", confidence: 0.1 },
    ),
  );
  const v = validateCommand(cmd);
  assert.equal(v.kind, "invalid");
  if (v.kind === "invalid") assert.equal(v.guidance, "needs_more");
});

test("runSpine: structurally valid weak contains match gates before executor", async () => {
  const outcome = await runSpine(
    predictionFor(
      "app",
      { id: "a", label: "A", path: "/Applications/A.app" },
      { confidence_tier: "contains", confidence: 0.6 },
    ),
    null,
  );

  assert.deepEqual(outcome.validation, { kind: "valid" });
  assert.equal(outcome.governor.status, "gate");
  assert.equal(outcome.governor.guidance, "choose_one");
  assert.equal(outcome.execution, null);
  assert.equal(outcome.record.execution, null);
});

test("validator: exact + complete target_ref → valid", () => {
  const cmd = parseCommand(
    predictionFor("app", {
      id: "a",
      label: "A",
      path: "/Applications/A.app",
    }),
  );
  assert.deepEqual(validateCommand(cmd), { kind: "valid" });
});

// ─── Risk + approval composition ────────────────────────────────────────────

test("risk + approval: open-style actions auto-approve", () => {
  for (const action of [
    "app.open",
    "folder.open",
    "service.open",
    "settings.open",
  ] as const) {
    const decision = approve(
      assessRisk({
        raw_input: "x",
        action,
        target_ref: null,
        prediction: predictionFor("app", null),
      }),
    );
    assert.equal(
      decision.kind,
      "auto_approved",
      `${action} should auto-approve in current phase`,
    );
  }
});

test("risk + approval: volume actions auto-approve (clamped + reversible)", () => {
  for (const action of [
    "volume.set",
    "volume.mute",
    "volume.unmute",
    "volume.step_up",
    "volume.step_down",
  ] as const) {
    const decision = approve(
      assessRisk({
        raw_input: "x",
        action,
        target_ref: null,
        prediction: predictionFor("system_audio", null, {
          intent: "volume_set",
        }),
      }),
    );
    assert.equal(
      decision.kind,
      "auto_approved",
      `${action} should auto-approve (clamped 0..100 or trivially reversible)`,
    );
  }
});

test("risk + approval: app.quit is attention (may interrupt unsaved work)", () => {
  const decision = approve(
    assessRisk({
      raw_input: "quit safari",
      action: "app.quit",
      target_ref: null,
      prediction: predictionFor("app", null),
    }),
  );
  assert.equal(decision.kind, "needs_approval", "app.quit should require approval");
});

test("risk + approval: app.hide and app.focus auto-approve (safe)", () => {
  for (const action of ["app.hide", "app.focus"] as const) {
    const decision = approve(
      assessRisk({
        raw_input: "x",
        action,
        target_ref: null,
        prediction: predictionFor("app", null),
      }),
    );
    assert.equal(decision.kind, "auto_approved", `${action} should auto-approve`);
  }
});

test("risk + approval: unknown action is rejected outright", () => {
  const decision = approve(
    assessRisk({
      raw_input: "??",
      action: "unknown",
      target_ref: null,
      prediction: predictionFor("nope", null),
    }),
  );
  assert.equal(decision.kind, "rejected");
});

// ─── Outcome message branches ───────────────────────────────────────────────

test("outcome: validation failures map to the documented strip kinds", () => {
  const cases = [
    { guidance: "needs_more", expected: "hint" },
    { guidance: "choose_one", expected: "hint" },
    { guidance: "permission_needed", expected: "hint" },
    { guidance: "approval_needed", expected: "hint" },
    { guidance: "unsupported_yet", expected: "hint" },
    { guidance: "blocked", expected: "blocked" },
  ] as const;
  for (const c of cases) {
    const status = statusFromOutcome(
      outcomeFor({
        validation: { kind: "invalid", guidance: c.guidance, reason: "" },
      }),
    );
    assert.equal(
      status.kind,
      c.expected,
      `guidance ${c.guidance} should render as ${c.expected}`,
    );
  }
});

test("outcome: typed executor errors map to precise hints", () => {
  const cases = [
    { error_kind: "path_not_found", expected: "hint" },
    { error_kind: "disallowed_scheme", expected: "blocked" },
    { error_kind: "open_failed", expected: "hint" },
    { error_kind: "unknown", expected: "hint" },
  ] as const;
  for (const c of cases) {
    const status = statusFromOutcome(
      outcomeFor({
        approval: { kind: "auto_approved" },
        execution: {
          kind: "failed",
          error_kind: c.error_kind,
          reason: "fixture",
        },
      }),
    );
    assert.equal(status.kind, c.expected);
  }
});

test("outcome: ok execution renders Opened {label}", () => {
  const status = statusFromOutcome(
    outcomeFor({
      approval: { kind: "auto_approved" },
      execution: { kind: "ok" },
    }),
  );
  assert.equal(status.kind, "ok");
  if (status.kind === "ok") {
    assert.match(status.msg, /^Opened /);
  }
});

test("outcome: rejected approval produces blocked status", () => {
  const status = statusFromOutcome(
    outcomeFor({
      approval: { kind: "rejected", reason: "fixture" },
    }),
  );
  assert.equal(status.kind, "blocked");
});

test("outcome: needs_approval pauses with a hint", () => {
  const status = statusFromOutcome(
    outcomeFor({
      approval: { kind: "needs_approval", reason: "fixture" },
    }),
  );
  assert.equal(status.kind, "hint");
});

test("statusFromResolveNow: unavailable index becomes a hint", () => {
  const s = statusFromResolveNow({ kind: "unavailable" });
  assert.deepEqual(s, { kind: "hint", msg: "Index unavailable" });
});

test("statusFromResolveNow: empty input yields a hint, not silence", () => {
  const s = statusFromResolveNow({ kind: "resolved", prediction: null });
  assert.deepEqual(s, { kind: "hint", msg: "Keep going" });
});

test("shortLabel: ellipsizes long labels at 3 words", () => {
  assert.equal(shortLabel("Audio MIDI Setup"), "Audio MIDI Setup");
  assert.equal(shortLabel("a b c d e"), "a b c…");
  assert.equal(shortLabel(null), "");
});

// ─── Action set surface lock ────────────────────────────────────────────────

test("ActionKind set matches the registry exactly", () => {
  const registryActions: ActionKind[] = COMMAND_REGISTRY.map((e) => e.action);
  const expected: ActionKind[] = [
    "app.open",
    "app.quit",
    "app.hide",
    "app.focus",
    "folder.open",
    "service.open",
    "settings.open",
    "volume.set",
    "volume.mute",
    "volume.unmute",
    "volume.step_up",
    "volume.step_down",
  ];
  for (const a of expected) {
    assert.ok(registryActions.includes(a), `${a} should be in the registry`);
    assert.ok(findEntry(a), `findEntry(${a}) must return an entry`);
  }
  assert.equal(registryActions.length, expected.length);
});
