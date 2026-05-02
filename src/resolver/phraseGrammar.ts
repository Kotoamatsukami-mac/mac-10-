// Phase 4 Slice 3 — Phrase grammar
//
// Classifies the verb prefix of an input sentence into a typed IntentVerb.
// Pure, deterministic, zero-dependency. No native probes, no resolver state.
//
// This sits between input normalization and entity resolution:
//
//   raw input → normalize → classifyIntent → { verb, rest } → resolver
//
// The verb tells the rest of the spine which action family to apply
// against whatever entity the resolver finds. The default verb is "open"
// when no recognized prefix is present, preserving the existing UX where
// a bare noun ("safari") resolves to app.open.
//
// New verbs are added here AND in the registry. The registry remains the
// single source of truth for what is reachable; this module only classifies
// the user's intent. The validator decides whether the (intent, kind) pair
// is in the registry and produces the right guidance state if not.

import { normalizeText } from "./nativeEnvironmentIndex";

export type IntentVerb =
  | "open"
  | "quit"
  | "hide"
  | "focus"
  | "volume_set"
  | "volume_mute"
  | "volume_unmute"
  | "volume_up"
  | "volume_down";

export interface IntentClassification {
  verb: IntentVerb;
  // The original verb phrase as the user typed it (post-normalize), or null
  // when the input has no recognized prefix and we defaulted to "open".
  phrase: string | null;
  // The remaining text after the verb prefix is stripped, trimmed.
  rest: string;
  // Numeric argument extracted from quantified verbs (e.g. "set volume to 40").
  // Null for non-quantified verbs.
  numeric_arg: number | null;
}

// Verb tables.
//
// Order matters: longer phrases are tested first within a table, and tables
// are tried in priority order so volume-specific phrases win over open
// synonyms when both could match.

// Open-style synonyms. Default verb when no prefix matches.
const OPEN_PHRASES: readonly string[] = [
  "go to",
  "open",
  "launch",
  "show",
  "start",
  "bring up",
  "pull up",
];

// Focus and switch-to are the same intent: bring an app forward.
const FOCUS_PHRASES: readonly string[] = ["focus", "switch to", "activate"];

const QUIT_PHRASES: readonly string[] = ["quit", "close"];

const HIDE_PHRASES: readonly string[] = ["hide"];

// Volume verbs that consume the rest of the input as a numeric argument.
// "volume 50", "set volume to 50", "volume to 50".
const VOLUME_SET_PHRASES: readonly string[] = [
  "set volume to",
  "set the volume to",
  "set volume",
  "volume to",
  "volume",
];

const VOLUME_MUTE_PHRASES: readonly string[] = ["mute", "silence"];
const VOLUME_UNMUTE_PHRASES: readonly string[] = ["unmute", "unsilence"];
const VOLUME_UP_PHRASES: readonly string[] = ["volume up", "turn volume up", "louder"];
const VOLUME_DOWN_PHRASES: readonly string[] = [
  "volume down",
  "turn volume down",
  "quieter",
];

// Verb tables are evaluated longest-phrase-first within each table; tables
// are tried in priority order so that volume-specific phrases win over
// generic open synonyms when both could match.

const VERB_TABLES: ReadonlyArray<{ verb: IntentVerb; phrases: readonly string[] }> = [
  // Volume directional/mute first — these are the most specific phrasings.
  { verb: "volume_up", phrases: VOLUME_UP_PHRASES },
  { verb: "volume_down", phrases: VOLUME_DOWN_PHRASES },
  { verb: "volume_unmute", phrases: VOLUME_UNMUTE_PHRASES },
  { verb: "volume_mute", phrases: VOLUME_MUTE_PHRASES },
  // volume_set is quantified — handled separately so we can extract the number.
  { verb: "volume_set", phrases: VOLUME_SET_PHRASES },
  // App verbs — order vs open matters because "close" appears in QUIT_PHRASES
  // and "open" in OPEN_PHRASES; both are exact-prefix scoped.
  { verb: "focus", phrases: FOCUS_PHRASES },
  { verb: "quit", phrases: QUIT_PHRASES },
  { verb: "hide", phrases: HIDE_PHRASES },
  { verb: "open", phrases: OPEN_PHRASES },
];

function sortedByLengthDesc(phrases: readonly string[]): string[] {
  return [...phrases].sort((a, b) => b.length - a.length);
}

function matchPrefix(
  normalized: string,
  phrases: readonly string[],
): { phrase: string; rest: string } | null {
  for (const phrase of sortedByLengthDesc(phrases)) {
    if (normalized === phrase) return { phrase, rest: "" };
    if (normalized.startsWith(phrase + " ")) {
      return { phrase, rest: normalized.slice(phrase.length + 1).trim() };
    }
  }
  return null;
}

// ─── Numeric argument extraction ────────────────────────────────────────────
//
// "50", "to 50", "= 50", "50%" — all yield 50. Range-clamped at the call site.

function extractNumericArg(rest: string): number | null {
  const stripped = rest.replace(/^(?:to\s+|=\s*)/, "").trim();
  if (!stripped) return null;
  const m = stripped.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return n;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function classifyIntent(rawInput: string): IntentClassification {
  const normalized = normalizeText(rawInput);
  if (!normalized) {
    return { verb: "open", phrase: null, rest: "", numeric_arg: null };
  }

  for (const table of VERB_TABLES) {
    const m = matchPrefix(normalized, table.phrases);
    if (!m) continue;
    if (table.verb === "volume_set") {
      // "volume" alone with no number is still a volume_set intent — the
      // validator will reject it as needs_more, with a precise reason.
      const n = extractNumericArg(m.rest);
      return {
        verb: "volume_set",
        phrase: m.phrase,
        rest: m.rest,
        numeric_arg: n,
      };
    }
    return {
      verb: table.verb,
      phrase: m.phrase,
      rest: m.rest,
      numeric_arg: null,
    };
  }

  // No prefix matched: default to "open" with the whole normalized string
  // as the target. This preserves the bare-noun UX ("safari" → open Safari).
  return {
    verb: "open",
    phrase: null,
    rest: normalized,
    numeric_arg: null,
  };
}
