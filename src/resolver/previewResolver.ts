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

export type ConfidenceTier =
  | "exact"
  | "prefix"
  | "contains"
  | "fuzzy"
  | "ambiguous"
  | "no_match";

export type PreviewActionKind =
  | "open_app"
  | "open_folder"
  | "open_service"
  | "open_settings_pane"
  | "set_volume"
  | "unknown";

export type PreviewTargetKind =
  | "app"
  | "folder"
  | "service"
  | "settings_pane"
  | "volume"
  | "unknown";

export type PreviewSource = IndexSource;

export interface PreviewTargetRef {
  id: string;
  label: string;
  path?: string;
  bundle_id?: string | null;
  url?: string;
  identifier?: string;
}

export interface PreviewPrediction {
  raw_input: string;
  normalized_input: string;
  action_phrase: string | null;
  action_kind: PreviewActionKind;
  target_kind: PreviewTargetKind;
  completion: string;
  display_label: string;
  confidence: number;
  confidence_tier: ConfidenceTier;
  executable: false;
  source: PreviewSource;
  target_ref?: PreviewTargetRef;
}

// ─── Action phrases (non-destructive only) ──────────────────────────────────

const ACTION_PHRASES: readonly string[] = ["go to", "open", "launch", "show"];

function stripActionPhrase(normalized: string): {
  phrase: string | null;
  rest: string;
} {
  for (const phrase of ACTION_PHRASES) {
    if (normalized === phrase) return { phrase, rest: "" };
    if (normalized.startsWith(phrase + " ")) {
      return { phrase, rest: normalized.slice(phrase.length + 1).trim() };
    }
  }
  return { phrase: null, rest: normalized };
}

function actionKindFor(targetKind: IndexTargetKind): PreviewActionKind {
  switch (targetKind) {
    case "app":
      return "open_app";
    case "folder":
      return "open_folder";
    case "volume":
      return "open_folder";
    case "service":
      return "open_service";
    case "settings_pane":
      return "open_settings_pane";
  }
}

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

function candidateFor(entity: IndexedEntity, match: AliasMatch): Candidate {
  return {
    entity,
    match,
    score: match.base + entity.source_boost,
  };
}

function exactCandidates(target: string, index: NativeEnvironmentIndex): Candidate[] {
  const exact = index.byAlias.get(target);
  if (!exact) return [];
  return exact.map((entity) =>
    candidateFor(entity, {
      tier: "exact",
      base: TIER_BASE.exact,
      alias: target,
    }),
  );
}

function prefixAndContainsCandidates(
  target: string,
  index: NativeEnvironmentIndex,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const entity of index.entities) {
    const match = bestAliasMatch(target, entity.aliases);
    if (!match || match.tier === "exact") continue;
    candidates.push(candidateFor(entity, match));
  }
  return candidates;
}

// ─── Empty / no-match prediction ────────────────────────────────────────────

function emptyPrediction(
  raw: string,
  normalized: string,
  actionPhrase: string | null,
): PreviewPrediction {
  const display = actionPhrase ?? raw.trim();
  return {
    raw_input: raw,
    normalized_input: normalized,
    action_phrase: actionPhrase,
    action_kind: "unknown",
    target_kind: "unknown",
    completion: "",
    display_label: display,
    confidence: 0,
    confidence_tier: "no_match",
    executable: false,
    source: "grammar",
  };
}

// ─── Public resolver ────────────────────────────────────────────────────────

export function resolvePreview(
  rawInput: string,
  index: NativeEnvironmentIndex,
): PreviewPrediction | null {
  const normalized = normalizeText(rawInput);
  if (!normalized) return null;

  const { phrase: actionPhrase, rest } = stripActionPhrase(normalized);
  const target = rest.trim();

  if (!target) {
    return emptyPrediction(rawInput, normalized, actionPhrase);
  }

  // Fast path: exact alias lookup uses the prebuilt alias index. Prefix and
  // contains matches still scan entities because they need partial matching.
  const candidates = exactCandidates(target, index);
  if (candidates.length === 0) {
    candidates.push(...prefixAndContainsCandidates(target, index));
  }

  if (candidates.length === 0) {
    return emptyPrediction(rawInput, normalized, actionPhrase);
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (TIER_RANK[b.match.tier] !== TIER_RANK[a.match.tier]) {
      return TIER_RANK[b.match.tier] - TIER_RANK[a.match.tier];
    }
    return a.entity.label.localeCompare(b.entity.label);
  });

  const top = candidates[0];
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
    action_kind: actionKindFor(top.entity.target_kind),
    target_kind: top.entity.target_kind,
    completion,
    display_label: displayLabel,
    confidence,
    confidence_tier: tier,
    executable: false,
    source: top.entity.source,
    target_ref: targetRef,
  };
}
