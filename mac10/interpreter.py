"""
Interpreter — AI-grade natural-language → structured command.

Pipeline
--------
1. Normalise & tokenise the input sentence.
2. Classify the *intent* (open, close, search, play, …) from verb/keyword signals.
3. Extract *entities* by sliding a window of 1–4 words over the sentence and
   fuzzy-matching each span against the Mac's live vocabulary.
4. Score every (entity, vocab-item) pair and keep the best match per span.
5. Return a :class:`ParsedCommand` with intent, matched entities, raw text, and
   confidence, ready for the action layer to execute.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Tuple

from .vocabulary import MacVocabulary, VocabItem, _normalise


# ---------------------------------------------------------------------------
# Stop words — tokens that are never part of an entity name
# ---------------------------------------------------------------------------

_STOP_WORDS: frozenset[str] = frozenset({
    "and", "or", "the", "a", "an", "then", "also", "plus",
    "but", "with", "for", "to", "of", "in", "on", "at", "by",
    "my", "me", "now", "please", "just", "some", "it",
})


# ---------------------------------------------------------------------------
# Intent catalogue
# ---------------------------------------------------------------------------

#: Maps normalised verb/trigger keywords → intent label.
INTENT_KEYWORDS: Dict[str, List[str]] = {
    "open":   ["open", "launch", "start", "run", "load", "boot", "bring up", "fire up"],
    "close":  ["close", "quit", "exit", "kill", "shut", "stop", "terminate"],
    "search": ["search", "find", "look for", "look up", "show me", "where is", "locate", "spotlight"],
    "play":   ["play", "listen", "watch", "stream", "resume"],
    "pause":  ["pause", "suspend"],
    "create": ["create", "new", "make", "write", "compose", "draft"],
    "delete": ["delete", "remove", "trash", "erase"],
    "send":   ["send", "email", "message", "mail", "text"],
    "call":   ["call", "ring", "facetime", "phone", "dial"],
    "set":    ["set", "change", "update", "enable", "disable", "turn on", "turn off",
               "adjust", "configure"],
    "show":   ["show", "display", "list", "get"],
    "sleep":  ["sleep", "hibernate", "lock"],
    "restart": ["restart", "reboot", "reset"],
    "shutdown": ["shutdown", "shut down", "power off", "turn off"],
}

# Flat map for quick lookup: keyword → intent
_KW_TO_INTENT: Dict[str, str] = {}
for _intent, _kws in INTENT_KEYWORDS.items():
    for _kw in _kws:
        _KW_TO_INTENT[_normalise(_kw)] = _intent


# ---------------------------------------------------------------------------
# Fuzzy-matching helpers
# ---------------------------------------------------------------------------

def _similarity(a: str, b: str) -> float:
    """SequenceMatcher ratio between two normalised strings (0–1)."""
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def _best_match(
    span: str,
    items: List[VocabItem],
    *,
    threshold: float = 0.55,
) -> Optional[Tuple[VocabItem, float]]:
    """
    Find the vocabulary item whose name (or alias) best matches *span*.

    Returns (item, score) or None if no match exceeds *threshold*.
    """
    span_norm = _normalise(span)
    if not span_norm:
        return None

    best_item: Optional[VocabItem] = None
    best_score = 0.0

    for item in items:
        for candidate in item.all_norms():
            if not candidate:
                continue
            # Exact substring bonus
            if span_norm == candidate:
                score = 1.0
            elif span_norm in candidate or candidate in span_norm:
                # Partial containment — weight by length ratio
                longer = max(len(span_norm), len(candidate))
                shorter = min(len(span_norm), len(candidate))
                score = 0.75 + 0.25 * (shorter / longer)
            else:
                score = _similarity(span_norm, candidate)

            if score > best_score:
                best_score = score
                best_item = item

    if best_score >= threshold and best_item is not None:
        return best_item, best_score
    return None


# ---------------------------------------------------------------------------
# Data model for the result
# ---------------------------------------------------------------------------

@dataclass
class MatchedEntity:
    """A vocabulary item resolved from a span of the user's input."""

    span: str           # original text slice that was matched
    item: VocabItem     # resolved vocabulary entry
    score: float        # match confidence 0–1


@dataclass
class ParsedCommand:
    """Fully-parsed result returned by :class:`Interpreter`."""

    raw: str                                        # original user input
    intent: Optional[str] = None                    # e.g. 'open', 'search', …
    intent_confidence: float = 0.0
    entities: List[MatchedEntity] = field(default_factory=list)
    unresolved_tokens: List[str] = field(default_factory=list)  # leftover words
    overall_confidence: float = 0.0

    # Convenience
    @property
    def primary_entity(self) -> Optional[MatchedEntity]:
        """The highest-scoring resolved entity."""
        return max(self.entities, key=lambda e: e.score, default=None)

    def __str__(self) -> str:
        ent_str = ", ".join(f"{e.span!r}→{e.item.name}({e.item.kind})" for e in self.entities)
        return (
            f"ParsedCommand(intent={self.intent!r}, "
            f"entities=[{ent_str}], "
            f"confidence={self.overall_confidence:.2f})"
        )


# ---------------------------------------------------------------------------
# Interpreter
# ---------------------------------------------------------------------------

class Interpreter:
    """
    AI-grade natural-language interpreter backed by the Mac's live vocabulary.

    Parameters
    ----------
    vocabulary:
        A :class:`~mac10.vocabulary.MacVocabulary` instance (or compatible).
        When omitted a fresh one is built automatically.
    entity_threshold:
        Minimum fuzzy-match score (0–1) to accept an entity match.
    window_sizes:
        N-gram window sizes to slide over the token sequence when matching
        entities.  Larger windows catch multi-word app names ("Google Chrome");
        smaller windows catch individual words ("Chrome").
    """

    def __init__(
        self,
        vocabulary: Optional[MacVocabulary] = None,
        *,
        entity_threshold: float = 0.55,
        window_sizes: Tuple[int, ...] = (4, 3, 2, 1),
    ) -> None:
        self._vocab = vocabulary if vocabulary is not None else MacVocabulary()
        self._threshold = entity_threshold
        self._windows = window_sizes

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def vocabulary(self) -> MacVocabulary:
        return self._vocab

    def parse(self, sentence: str) -> ParsedCommand:
        """
        Parse *sentence* into a :class:`ParsedCommand`.

        This is the single public entry point for the interpretation layer.
        """
        cmd = ParsedCommand(raw=sentence)

        # 1. Normalise
        norm = _normalise(sentence)
        if not norm:
            return cmd

        # 2. Classify intent (multi-word phrases first, then single words)
        cmd.intent, cmd.intent_confidence = self._classify_intent(norm)

        # 3. Strip intent keywords from the normalised text to avoid matching
        #    them as entities.
        entity_text = self._strip_intent_tokens(norm, cmd.intent)

        # 4. Tokenise
        tokens = entity_text.split()

        # 5. Extract entities using sliding n-gram window
        cmd.entities, cmd.unresolved_tokens = self._extract_entities(tokens)

        # 6. Overall confidence
        cmd.overall_confidence = self._compute_confidence(cmd)

        return cmd

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _classify_intent(self, norm: str) -> Tuple[Optional[str], float]:
        """
        Return (intent_label, confidence).

        Scans for all keyword matches with proper word boundaries, then picks
        the one that appears **earliest** in the sentence (ties broken by
        **longest** phrase) so "set display" gives "set" not "show" even though
        "display" is a longer keyword for "show".
        """
        candidates: List[Tuple[int, int, str, float]] = []  # (pos, -len, intent, conf)
        for kw, intent in _KW_TO_INTENT.items():
            pos = norm.find(kw)
            if pos == -1:
                continue
            # Require word boundary before keyword
            if pos > 0 and norm[pos - 1] != " ":
                continue
            # Require word boundary after keyword
            end = pos + len(kw)
            if end < len(norm) and norm[end] != " ":
                continue
            phrase_ratio = len(kw) / max(len(norm), 1)
            confidence = min(0.5 + phrase_ratio, 1.0)
            candidates.append((pos, -len(kw), intent, confidence))

        if not candidates:
            return None, 0.0

        # Sort: earliest position first; for same position prefer longer phrase
        candidates.sort(key=lambda x: (x[0], x[1]))
        _, _, intent, confidence = candidates[0]
        return intent, confidence

    def _strip_intent_tokens(self, norm: str, intent: Optional[str]) -> str:
        """Remove intent keywords from *norm* so they are not entity-matched."""
        if intent is None:
            return norm
        text = norm
        for kw, mapped in _KW_TO_INTENT.items():
            if mapped == intent:
                # Replace whole-word occurrences only
                text = re.sub(r"\b" + re.escape(kw) + r"\b", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def _extract_entities(
        self, tokens: List[str]
    ) -> Tuple[List[MatchedEntity], List[str]]:
        """
        Slide n-gram windows over *tokens*, greedily matching vocabulary items.

        Larger windows are tried first; once a span is matched its tokens are
        consumed and not reconsidered.  Spans that contain stop words (e.g.
        "safari and textedit") are skipped so they don't consume tokens that
        belong to separate entities.
        """
        vocab_items = self._vocab.items
        n = len(tokens)
        matched: List[MatchedEntity] = []
        consumed: set[int] = set()

        for window in self._windows:
            for start in range(n - window + 1):
                end = start + window
                # Skip if any token in this window already consumed
                if consumed.intersection(range(start, end)):
                    continue
                span_tokens = tokens[start:end]
                # Skip spans that contain stop words — they span multiple entities
                if any(t in _STOP_WORDS for t in span_tokens):
                    continue
                span = " ".join(span_tokens)
                result = _best_match(span, vocab_items, threshold=self._threshold)
                if result is not None:
                    item, score = result
                    matched.append(MatchedEntity(span=span, item=item, score=score))
                    consumed.update(range(start, end))

        unresolved = [tokens[i] for i in range(n) if i not in consumed]
        # Sort entities by position in original token list
        matched.sort(key=lambda e: tokens.index(e.span.split()[0]) if e.span.split() else 0)
        return matched, unresolved

    def _compute_confidence(self, cmd: ParsedCommand) -> float:
        """Heuristic overall confidence for the parsed command."""
        parts: List[float] = []

        if cmd.intent is not None:
            parts.append(cmd.intent_confidence)

        if cmd.entities:
            avg_entity = sum(e.score for e in cmd.entities) / len(cmd.entities)
            parts.append(avg_entity)
        else:
            # No entities resolved → low confidence
            parts.append(0.1)

        return sum(parts) / max(len(parts), 1)
