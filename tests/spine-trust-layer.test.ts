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
import type { SpineOutcome } from "../src/spine/runSpine.ts";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function predictionFor(
  target_kind: string,
  target_ref: PreviewPrediction["target_ref"],
  overrides: Partial<PreviewPrediction> = {},
): PreviewPrediction {
  return {
    raw_input: "fixture",
    normalized_input: "fixture",
    completion: "",
    display_label: target_ref?.label ?? "fixture",
    confidence: 1,
    confidence_tier: "exact",
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
  const rust = readFileSync("src-tauri/src/executor.rs", "utf8");
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const tsExecutor = readFileSync("src/spine/executor.ts", "utf8");

  for (const cmd of ["executor_open_path", "executor_open_url"]) {
    assert.ok(tsExecutor.includes(`"${cmd}"`), `TS executor must invoke ${cmd}`);
    assert.ok(rust.includes(`pub fn ${cmd}(`), `Rust must define ${cmd}`);
    assert.ok(lib.includes(cmd), `lib.rs invoke_handler must register ${cmd}`);
  }

  for (const entry of COMMAND_REGISTRY) {
    if (!entry.executable) continue;
    const requires = new Set(entry.required);
    const reaches = requires.has("path") || requires.has("url");
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

test("actionFromTargetKind covers every kind referenced by the registry", () => {
  for (const entry of COMMAND_REGISTRY) {
    for (const kind of entry.targetKinds) {
      assert.equal(
        actionFromTargetKind(kind),
        entry.action,
        `target_kind ${kind} should resolve to ${entry.action}`,
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

test("validator: inert registry action → unsupported_yet", () => {
  const v = validateCommand({
    raw_input: "set volume to 50",
    action: "volume.set",
    target_ref: null,
    prediction: predictionFor("volume", null),
  });
  assert.equal(v.kind, "invalid");
  if (v.kind === "invalid") assert.equal(v.guidance, "unsupported_yet");
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

test("risk + approval: volume.set pauses on attention (Phase 5 surface)", () => {
  const decision = approve(
    assessRisk({
      raw_input: "set volume to 50",
      action: "volume.set",
      target_ref: null,
      prediction: predictionFor("volume", null),
    }),
  );
  assert.equal(decision.kind, "needs_approval");
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
  const s = statusFromResolveNow({ kind: "ready", prediction: null });
  assert.deepEqual(s, { kind: "hint", msg: "Type more" });
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
    "folder.open",
    "service.open",
    "settings.open",
    "volume.set",
  ];
  for (const a of expected) {
    assert.ok(registryActions.includes(a), `${a} should be in the registry`);
    assert.ok(findEntry(a), `findEntry(${a}) must return an entry`);
  }
  assert.equal(registryActions.length, expected.length);
});
