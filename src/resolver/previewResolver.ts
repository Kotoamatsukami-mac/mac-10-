// Phase 3 Slice 1 — Preview Resolver
//
// Deterministic, zero-dependency resolver. Reads a NativeEnvironmentIndex,
// returns one PreviewPrediction. No invoke, no native probes, no execution.
//
// Generic by design: every resolution flows through the same alias-matching
// + source-boost path. Safari, YouTube, Chrome, WhatsApp, Downloads, Sound,
// Settings are all just labels in the index — no per-target branching here.

import {
  type IndexSource,
  type IndexTargetKind,
  type IndexedEntity,
  type NativeEnvironmentIndex,
  normalizeText,
} from "./nativeEnvironmentIndex";
import { classifyIntent, type IntentVerb } from "./phraseGrammar";

export type ConfidenceTier =
  | "exact"
  | "prefix"
  | "contains"
  | "fuzzy"
  | "ambiguous"
  | "no_match";

export type PreviewActionKind =
  | "open_app"
  | "quit_app"
  | "hide_app"
  | "focus_app"
  | "open_folder"
  | "open_service"
  | "open_settings_pane"
  | "set_volume"
  | "mute_volume"
  | "unmute_volume"
  | "step_volume_up"
  | "step_volume_down"
  | "unknown";

export type PreviewTargetKind =
  | "app"
  | "folder"
  | "service"
  | "settings_pane"
  | "volume"
  | "system_audio"
  | "unknown";

export type PreviewSource = IndexSource;

export interface PreviewTargetRef {
  id: string;
  label: string;
  path?: string;
  bundle_id?: string | null;
  url?: string;
  identifier?: string;
  // Numeric argument for quantified verbs (e.g. volume.set 50). Resolver
  // extracts and clamps; executor consumes as-is.
  numeric_arg?: number;
}

export interface PreviewPrediction {
  raw_input: string;
  normalized_input: string;
  action_phrase: string | null;
  // Intent verb classified from the user's prefix; "open" by default.
  intent: IntentVerb;
  action_kind: PreviewActionKind;
  target_kind: PreviewTargetKind;
  completion: string;
  display_label: string;
  confidence: number;
  confidence_tier: ConfidenceTier;
  source: PreviewSource;
  target_ref?: PreviewTargetRef;
}

// ─── Action phrases ─────────────────────────────────────────────────────────
//
// Verb classification lives in src/resolver/phraseGrammar.ts. Resolvers below
// only consume the classified IntentVerb; this file no longer maintains a
// flat ACTION_PHRASES list.

// ─── Intent → action_kind mapping ───────────────────────────────────────────
//
// Combines the classified intent verb with the resolved entity's target_kind
// to produce a single action_kind. Returns "unknown" when the (intent, kind)
// pair has no registered action — the validator turns that into a typed
// guidance state at the boundary.

function actionKindFor(
  intent: IntentVerb,
  targetKind: IndexTargetKind,
): PreviewActionKind {
  switch (intent) {
    case "open":
      switch (targetKind) {
        case "app":
          return "open_app";
        case "folder":
        case "volume":
          return "open_folder";
        case "service":
          return "open_service";
        case "settings_pane":
          return "open_settings_pane";
      }
      return "unknown";
    case "quit":
      return targetKind === "app" ? "quit_app" : "unknown";
    case "hide":
      return targetKind === "app" ? "hide_app" : "unknown";
    case "focus":
      return targetKind === "app" ? "focus_app" : "unknown";
    case "volume_set":
      return "set_volume";
    case "volume_mute":
      return "mute_volume";
    case "volume_unmute":
      return "unmute_volume";
    case "volume_up":
      return "step_volume_up";
    case "volume_down":
      return "step_volume_down";
  }
}

const VOLUME_INTENTS: ReadonlySet<IntentVerb> = new Set([
  "volume_set",
  "volume_mute",
  "volume_unmute",
  "volume_up",
  "volume_down",
]);

// ─── Scoring ────────────────────────────────────────────────────────────────

type AliasTier = "exact" | "prefix" | "contains";

const TIER_BASE: Record<AliasTier, number> = {
  exact: 100,
  prefix: 70,
  contains: 40,
};

const TIER_RANK: Record<ConfidenceTier, number> = {
  exact: 5,
  prefix: 4,
  contains: 3,
  fuzzy: 2,
  ambiguous: 1,
  no_match: 0,
};

const MAX_SCORE = TIER_BASE.exact + 50; // exact + max source boost (live_runtime_state)

interface AliasMatch {
  tier: AliasTier;
  base: number;
  alias: string;
}

function bestAliasMatch(query: string, aliases: string[]): AliasMatch | null {
  let best: AliasMatch | null = null;
  for (const alias of aliases) {
    let m: AliasMatch | null = null;
    if (alias === query) {
      m = { tier: "exact", base: TIER_BASE.exact, alias };
    } else if (alias.startsWith(query)) {
      m = { tier: "prefix", base: TIER_BASE.prefix, alias };
    } else if (alias.includes(query)) {
      m = { tier: "contains", base: TIER_BASE.contains, alias };
    }
    if (m && (!best || m.base > best.base)) best = m;
  }
  return best;
}

interface Candidate {
  entity: IndexedEntity;
  match: AliasMatch;
  score: number;
}

// Intent changes source priority. The same target word may resolve differently
// depending on the verb. Open prefers launchable inventory (static apps with
// paths). Quit, hide, and focus prefer live runtime state (currently running
// apps). This modifier is generic — it does not branch on target names.
function intentSourceModifier(intent: IntentVerb, entity: IndexedEntity): number {
  if (entity.target_kind !== "app") return 0;

  const isLive = entity.source === "live_runtime_state";
  const isRuntime = intent === "quit" || intent === "hide" || intent === "focus";
  const isLaunch = intent === "open";

  if (isRuntime && isLive) return 15;   // prefer running app for runtime verbs
  if (isRuntime && !isLive) return -10; // demote static for runtime verbs
  if (isLaunch && !isLive) return 5;    // prefer launchable for open
  if (isLaunch && isLive) return -5;    // demote live-only for open (may lack path)

  return 0;
}

function candidateFor(entity: IndexedEntity, match: AliasMatch, intent: IntentVerb): Candidate {
  return {
    entity,
    match,
    score: match.base + entity.source_boost + intentSourceModifier(intent, entity),
  };
}

function exactCandidates(target: string, index: NativeEnvironmentIndex, intent: IntentVerb): Candidate[] {
  const exact = index.byAlias.get(target);
  if (!exact) return [];
  return exact.map((entity) =>
    candidateFor(entity, {
      tier: "exact",
      base: TIER_BASE.exact,
      alias: target,
    }, intent),
  );
}

function prefixAndContainsCandidates(
  target: string,
  index: NativeEnvironmentIndex,
  intent: IntentVerb,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const entity of index.entities) {
    const match = bestAliasMatch(target, entity.aliases);
    if (!match || match.tier === "exact") continue;
    candidates.push(candidateFor(entity, match, intent));
  }
  return candidates;
}

// ─── Empty / no-match prediction ────────────────────────────────────────────

function emptyPrediction(
  raw: string,
  normalized: string,
  intent: IntentVerb,
  actionPhrase: string | null,
): PreviewPrediction {
  const display = actionPhrase ?? raw.trim();
  return {
    raw_input: raw,
    normalized_input: normalized,
    action_phrase: actionPhrase,
    intent,
    action_kind: "unknown",
    target_kind: "unknown",
    completion: "",
    display_label: display,
    confidence: 0,
    confidence_tier: "no_match",
    source: "grammar",
  };
}

// ─── System-audio (volume) synthetic prediction ─────────────────────────────
//
// Volume verbs do not resolve against a NativeEnvironmentIndex entity —
// the target is the system audio output, which is implicit. We synthesize
// a PreviewPrediction with target_kind="system_audio" so the rest of the
// spine treats volume on the same rails as every other action.

function systemAudioPrediction(
  raw: string,
  normalized: string,
  intent: IntentVerb,
  actionPhrase: string | null,
  numericArg: number | null,
): PreviewPrediction {
  const labelByIntent: Record<string, string> = {
    volume_set: "Volume",
    volume_mute: "Mute",
    volume_unmute: "Unmute",
    volume_up: "Volume up",
    volume_down: "Volume down",
  };
  const label = labelByIntent[intent] ?? "Volume";

  // Clamp 0..100 at the boundary so the executor receives a bounded value.
  let clamped: number | undefined;
  if (numericArg !== null) {
    clamped = Math.max(0, Math.min(100, Math.round(numericArg)));
  }

  const targetRef: PreviewTargetRef = {
    id: "system_audio:default_output",
    label,
  };
  if (clamped !== undefined) targetRef.numeric_arg = clamped;

  return {
    raw_input: raw,
    normalized_input: normalized,
    action_phrase: actionPhrase,
    intent,
    action_kind: actionKindFor(intent, "app" /* unused for volume */),
    target_kind: "system_audio",
    completion: "",
    display_label: clamped !== undefined ? `${label} ${clamped}` : label,
    confidence: 1,
    confidence_tier: "exact",
    source: "grammar",
    target_ref: targetRef,
  };
}

// ─── Public resolver ────────────────────────────────────────────────────────

export function resolvePreview(
  rawInput: string,
  index: NativeEnvironmentIndex,
): PreviewPrediction | null {
  const normalized = normalizeText(rawInput);
  if (!normalized) return null;

  const intent = classifyIntent(rawInput);
  const actionPhrase = intent.phrase;
  const target = intent.rest.trim();

  // Volume verbs short-circuit: target is the system audio output, not an
  // index entity. Synthesize a typed prediction and let the spine validate
  // numeric arguments / executable status downstream.
  if (VOLUME_INTENTS.has(intent.verb)) {
    return systemAudioPrediction(
      rawInput,
      normalized,
      intent.verb,
      actionPhrase,
      intent.numeric_arg,
    );
  }

  if (!target) {
    return emptyPrediction(rawInput, normalized, intent.verb, actionPhrase);
  }

  // Fast path: exact alias lookup uses the prebuilt alias index. Prefix and
  // contains matches still scan entities because they need partial matching.
  const candidates = exactCandidates(target, index, intent.verb);
  if (candidates.length === 0) {
    candidates.push(...prefixAndContainsCandidates(target, index, intent.verb));
  }

  if (candidates.length === 0) {
    return emptyPrediction(rawInput, normalized, intent.verb, actionPhrase);
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (TIER_RANK[b.match.tier] !== TIER_RANK[a.match.tier]) {
      return TIER_RANK[b.match.tier] - TIER_RANK[a.match.tier];
    }
    return a.entity.label.localeCompare(b.entity.label);
  });

  const top = candidates[0];
  if (!top) {
    return emptyPrediction(rawInput, normalized, intent.verb, actionPhrase);
  }
  const second = candidates.length > 1 ? candidates[1] : null;

  let tier: ConfidenceTier = top.match.tier;
  if (
    second &&
    second.score === top.score &&
    second.match.tier === top.match.tier &&
    second.entity.id !== top.entity.id
  ) {
    tier = "ambiguous";
  }

  let completion = "";
  if (top.match.alias.startsWith(target)) {
    completion = top.match.alias.slice(target.length);
  }

  const displayLabel = actionPhrase
    ? `${actionPhrase} ${top.entity.label}`
    : top.entity.label;

  const confidence = Math.min(1, top.score / MAX_SCORE);

  const targetRef: PreviewTargetRef = {
    id: top.entity.id,
    label: top.entity.label,
  };
  if (top.entity.path !== undefined) targetRef.path = top.entity.path;
  if (top.entity.bundle_id !== undefined)
    targetRef.bundle_id = top.entity.bundle_id;
  if (top.entity.url !== undefined) targetRef.url = top.entity.url;
  if (top.entity.identifier !== undefined)
    targetRef.identifier = top.entity.identifier;

  return {
    raw_input: rawInput,
    normalized_input: normalized,
    action_phrase: actionPhrase,
    intent: intent.verb,
    action_kind: actionKindFor(intent.verb, top.entity.target_kind),
    target_kind: top.entity.target_kind,
    completion,
    display_label: displayLabel,
    confidence,
    confidence_tier: tier,
    source: top.entity.source,
    target_ref: targetRef,
  };
}

// ─── Suggestions for the dropdown surface ────────────────────────────────────
//
// resolveSuggestions returns the top N candidates as a deliberately
// lightweight shape. This is NOT a PreviewPrediction — the spine cannot
// consume a Suggestion. Suggestions exist so the UI can populate the
// hover-dropdown's predictive rows when the user is typing, without ever
// granting them spine authority. Click a suggestion → input is filled →
// resolveNow runs on submit just like manual typing.

export interface Suggestion {
  // The string to drop into the input when the user clicks this row.
  fill: string;
  // Display label as it appears in the dropdown row.
  label: string;
  // The verb prefix used to prepend (e.g., "open", "quit", "focus") so the
  // dropdown can show a small intent badge if it wants to.
  intent: IntentVerb;
  // Confidence tier for visual distinction (exact match feels different
  // from contains match).
  tier: ConfidenceTier;
}

export function resolveSuggestions(
  rawInput: string,
  index: NativeEnvironmentIndex,
  limit = 6,
): Suggestion[] {
  const normalized = normalizeText(rawInput);
  if (!normalized) return [];

  const intent = classifyIntent(rawInput);
  const actionPhrase = intent.phrase;
  const target = intent.rest.trim();

  // Volume intents are single-shot — nothing meaningful to suggest beyond
  // the synthesized prediction. Return empty so the dropdown falls back
  // to its empty-state pool. The static pool already contains a volume hint.
  if (VOLUME_INTENTS.has(intent.verb)) return [];

  if (!target) return [];

  const candidates = exactCandidates(target, index, intent.verb);
  if (candidates.length === 0) {
    candidates.push(...prefixAndContainsCandidates(target, index, intent.verb));
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (TIER_RANK[b.match.tier] !== TIER_RANK[a.match.tier]) {
      return TIER_RANK[b.match.tier] - TIER_RANK[a.match.tier];
    }
    return a.entity.label.localeCompare(b.entity.label);
  });

  // Deduplicate by stable user-facing identity, not just entity.id.
  // The same real-world target can appear through multiple sources (e.g.
  // app:com.spotify.client, dock:com.spotify.client, service:spotify).
  // Identity priority: bundle_id > url > path > identifier > kind+label.
  // Highest-scored candidate wins when identities collide.
  function stableKey(c: Candidate): string {
    const e = c.entity;
    if (e.bundle_id) return `bid:${e.bundle_id}`;
    if (e.url) return `url:${e.url}`;
    if (e.path) return `path:${e.path}`;
    if (e.identifier) return `id:${e.identifier}`;
    return `${e.target_kind}:${e.label.toLowerCase()}`;
  }

  const seen = new Map<string, number>(); // stableKey → best score
  const out: Suggestion[] = [];
  for (const c of candidates) {
    const key = stableKey(c);
    const prev = seen.get(key);
    if (prev !== undefined && prev >= c.score) continue; // already have a better one
    if (prev !== undefined) {
      // Replace the earlier, lower-scored duplicate in-place.
      const idx = out.findIndex((s) => {
        // Match by fill since that's stable per key.
        const fill = actionPhrase
          ? `${actionPhrase} ${c.entity.label}`
          : c.entity.label;
        return s.fill === fill || s.label === c.entity.label;
      });
      if (idx >= 0) out.splice(idx, 1);
    }
    seen.set(key, c.score);
    const fill = actionPhrase
      ? `${actionPhrase} ${c.entity.label}`
      : c.entity.label;
    out.push({
      fill,
      label: c.entity.label,
      intent: intent.verb,
      tier: c.match.tier,
    });
    if (out.length >= limit) break;
  }
  return out;
}
