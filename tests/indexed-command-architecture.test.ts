import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolvePreview,
  type PreviewPrediction,
} from "../src/resolver/previewResolver.ts";
import type {
  IndexedEntity,
  NativeEnvironmentIndex,
} from "../src/resolver/nativeEnvironmentIndex.ts";
import { parseCommand } from "../src/spine/parser.ts";
import { validateCommand } from "../src/spine/validator.ts";

function fakeIndex(entities: IndexedEntity[]): NativeEnvironmentIndex {
  const byAlias = new Map<string, IndexedEntity[]>();
  for (const entity of entities) {
    for (const alias of entity.aliases) {
      const existing = byAlias.get(alias);
      if (existing) existing.push(entity);
      else byAlias.set(alias, [entity]);
    }
  }
  return { entities, byAlias };
}

function resolveRequired(
  rawInput: string,
  entities: IndexedEntity[],
): PreviewPrediction {
  const prediction = resolvePreview(rawInput, fakeIndex(entities));
  assert.notEqual(prediction, null);
  return prediction;
}

test("arbitrary indexed app resolves to app.open", () => {
  const prediction = resolveRequired("open blender", [
    {
      id: "app:org.blender.Blender",
      label: "Blender",
      aliases: ["blender"],
      target_kind: "app",
      source: "static_inventory",
      source_boost: 10,
      path: "/Applications/Blender.app",
      bundle_id: "org.blender.Blender",
    },
  ]);

  const parsed = parseCommand(prediction);
  assert.equal(parsed.action, "app.open");
  assert.deepEqual(validateCommand(parsed), { kind: "valid" });
});

test("arbitrary indexed folder resolves to folder.open", () => {
  const prediction = resolveRequired("open my weird folder", [
    {
      id: "folder:my-weird-folder",
      label: "My Weird Folder",
      aliases: ["my weird folder"],
      target_kind: "folder",
      source: "static_inventory",
      source_boost: 10,
      path: "/Users/example/My Weird Folder",
    },
  ]);

  const parsed = parseCommand(prediction);
  assert.equal(parsed.action, "folder.open");
  assert.deepEqual(validateCommand(parsed), { kind: "valid" });
});

test("arbitrary indexed service resolves to service.open", () => {
  const prediction = resolveRequired("open client portal", [
    {
      id: "service:client-portal",
      label: "Client Portal",
      aliases: ["client portal"],
      target_kind: "service",
      source: "service_seed",
      source_boost: 8,
      url: "https://client.example.test",
      identifier: "client-portal",
    },
  ]);

  const parsed = parseCommand(prediction);
  assert.equal(parsed.action, "service.open");
  assert.deepEqual(validateCommand(parsed), { kind: "valid" });
});

test("arbitrary indexed settings entity resolves to settings.open by url", () => {
  const prediction = resolveRequired("open audio midi setup", [
    {
      id: "settings_pane:audio-midi-setup",
      label: "Audio MIDI Setup",
      aliases: ["audio midi setup"],
      target_kind: "settings_pane",
      source: "settings_seed",
      source_boost: 8,
      url: "x-apple.systempreferences:audio-midi-setup",
      identifier: "audio-midi-setup",
    },
  ]);

  const parsed = parseCommand(prediction);
  assert.equal(parsed.action, "settings.open");
  assert.equal(parsed.target_ref?.url, "x-apple.systempreferences:audio-midi-setup");
  assert.equal(parsed.target_ref?.identifier, "audio-midi-setup");
  assert.deepEqual(validateCommand(parsed), { kind: "valid" });
});

test("parser contains no fake target names", () => {
  const parserSource = readFileSync("src/spine/parser.ts", "utf8");
  for (const targetName of [
    "Blender",
    "My Weird Folder",
    "Client Portal",
    "Audio MIDI Setup",
  ]) {
    assert.equal(parserSource.includes(targetName), false);
  }
});

test("missing launch fields fail validation before executor", () => {
  const missingPath = parseCommand(
    resolveRequired("open blender", [
      {
        id: "app:missing-path",
        label: "Blender",
        aliases: ["blender"],
        target_kind: "app",
        source: "static_inventory",
        source_boost: 10,
      },
    ]),
  );
  assert.deepEqual(validateCommand(missingPath), {
    kind: "invalid",
    guidance: "needs_more",
    reason: "target_ref missing path",
  });

  const missingServiceUrl = parseCommand(
    resolveRequired("open client portal", [
      {
        id: "service:missing-url",
        label: "Client Portal",
        aliases: ["client portal"],
        target_kind: "service",
        source: "service_seed",
        source_boost: 8,
        identifier: "client-portal",
      },
    ]),
  );
  assert.deepEqual(validateCommand(missingServiceUrl), {
    kind: "invalid",
    guidance: "needs_more",
    reason: "target_ref missing url",
  });

  const missingSettingsUrl = parseCommand(
    resolveRequired("open audio midi setup", [
      {
        id: "settings_pane:missing-url",
        label: "Audio MIDI Setup",
        aliases: ["audio midi setup"],
        target_kind: "settings_pane",
        source: "settings_seed",
        source_boost: 8,
        identifier: "audio-midi-setup",
      },
    ]),
  );
  assert.deepEqual(validateCommand(missingSettingsUrl), {
    kind: "invalid",
    guidance: "needs_more",
    reason: "target_ref missing url",
  });
});

test("equal candidates remain ambiguous without target-kind priority", () => {
  const prediction = resolveRequired("open shared target", [
    {
      id: "app:shared-target",
      label: "Blender",
      aliases: ["shared target"],
      target_kind: "app",
      source: "static_inventory",
      source_boost: 10,
      path: "/Applications/Blender.app",
    },
    {
      id: "folder:shared-target",
      label: "My Weird Folder",
      aliases: ["shared target"],
      target_kind: "folder",
      source: "static_inventory",
      source_boost: 10,
      path: "/Users/example/My Weird Folder",
    },
  ]);

  assert.equal(prediction.confidence_tier, "ambiguous");
  assert.deepEqual(validateCommand(parseCommand(prediction)), {
    kind: "invalid",
    guidance: "choose_one",
    reason: "multiple candidates tied at the top",
  });
});

test("generic source boost may decide between otherwise matching candidates", () => {
  const prediction = resolveRequired("open client portal", [
    {
      id: "service:client-portal-seed",
      label: "Client Portal",
      aliases: ["client portal"],
      target_kind: "service",
      source: "service_seed",
      source_boost: 8,
      url: "https://client.example.test",
    },
    {
      id: "service:client-portal-live",
      label: "Client Portal Live",
      aliases: ["client portal"],
      target_kind: "service",
      source: "static_inventory",
      source_boost: 10,
      url: "https://live.client.example.test",
    },
  ]);

  assert.equal(prediction.confidence_tier, "exact");
  assert.equal(prediction.target_ref?.id, "service:client-portal-live");
  assert.equal(parseCommand(prediction).action, "service.open");
});
