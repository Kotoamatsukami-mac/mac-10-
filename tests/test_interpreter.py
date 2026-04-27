"""Tests for mac10.interpreter — Interpreter and ParsedCommand."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mac10.vocabulary import MacVocabulary, VocabItem
from mac10.interpreter import Interpreter, ParsedCommand, _normalise, _similarity, _best_match


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_interpreter(*names_kinds) -> Interpreter:
    """Build an Interpreter with a synthetic vocabulary (no file-system access)."""
    items = [VocabItem(name=n, kind=k, aliases=[]) for n, k in names_kinds]
    vocab = MacVocabulary(auto_refresh=False)
    vocab._items = items
    return Interpreter(vocab, entity_threshold=0.55)


# ---------------------------------------------------------------------------
# Unit tests for helper functions
# ---------------------------------------------------------------------------

class TestSimilarity(unittest.TestCase):
    def test_identical(self):
        self.assertAlmostEqual(_similarity("safari", "safari"), 1.0)

    def test_completely_different(self):
        self.assertLess(_similarity("safari", "zzz"), 0.5)

    def test_close_strings(self):
        score = _similarity("safri", "safari")  # 1 typo
        self.assertGreater(score, 0.7)


class TestBestMatch(unittest.TestCase):
    def setUp(self):
        self.items = [
            VocabItem("Safari", "app"),
            VocabItem("Google Chrome", "app", aliases=["Chrome"]),
            VocabItem("TextEdit", "app"),
        ]

    def test_exact_match(self):
        result = _best_match("safari", self.items, threshold=0.55)
        self.assertIsNotNone(result)
        item, score = result
        self.assertEqual(item.name, "Safari")
        self.assertAlmostEqual(score, 1.0)

    def test_alias_match(self):
        result = _best_match("chrome", self.items, threshold=0.55)
        self.assertIsNotNone(result)
        item, score = result
        self.assertEqual(item.name, "Google Chrome")

    def test_fuzzy_match(self):
        result = _best_match("safri", self.items, threshold=0.55)
        self.assertIsNotNone(result)
        item, _ = result
        self.assertEqual(item.name, "Safari")

    def test_no_match_below_threshold(self):
        result = _best_match("zzznomatch", self.items, threshold=0.55)
        self.assertIsNone(result)

    def test_empty_span(self):
        result = _best_match("", self.items, threshold=0.55)
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# Intent classification
# ---------------------------------------------------------------------------

class TestIntentClassification(unittest.TestCase):
    def setUp(self):
        self.interp = _make_interpreter(("Safari", "app"))

    def _intent(self, sentence: str) -> str | None:
        return self.interp.parse(sentence).intent

    def test_open_intent(self):
        self.assertEqual(self._intent("open Safari"), "open")

    def test_launch_maps_to_open(self):
        self.assertEqual(self._intent("launch Safari"), "open")

    def test_close_intent(self):
        self.assertEqual(self._intent("close Safari"), "close")

    def test_quit_maps_to_close(self):
        self.assertEqual(self._intent("quit Safari"), "close")

    def test_search_intent(self):
        self.assertEqual(self._intent("search for something"), "search")

    def test_play_intent(self):
        self.assertEqual(self._intent("play some music"), "play")

    def test_shutdown_intent(self):
        self.assertEqual(self._intent("shut down the Mac"), "shutdown")

    def test_sleep_intent(self):
        self.assertEqual(self._intent("sleep now"), "sleep")

    def test_no_intent_returns_none(self):
        self.assertIsNone(self._intent(""))

    def test_intent_confidence_positive(self):
        cmd = self.interp.parse("open Safari")
        self.assertGreater(cmd.intent_confidence, 0.0)


# ---------------------------------------------------------------------------
# Entity extraction
# ---------------------------------------------------------------------------

class TestEntityExtraction(unittest.TestCase):
    def test_single_entity_exact(self):
        interp = _make_interpreter(("Safari", "app"))
        cmd = interp.parse("open Safari")
        self.assertEqual(len(cmd.entities), 1)
        self.assertEqual(cmd.entities[0].item.name, "Safari")

    def test_multi_word_entity(self):
        interp = _make_interpreter(("Google Chrome", "app"))
        cmd = interp.parse("open Google Chrome")
        self.assertEqual(len(cmd.entities), 1)
        self.assertEqual(cmd.entities[0].item.name, "Google Chrome")

    def test_fuzzy_entity(self):
        interp = _make_interpreter(("Safari", "app"))
        cmd = interp.parse("open Safarri")
        # Should still resolve to Safari despite typo
        self.assertEqual(len(cmd.entities), 1)
        self.assertEqual(cmd.entities[0].item.name, "Safari")

    def test_no_entity_for_garbage(self):
        interp = _make_interpreter(("Safari", "app"))
        cmd = interp.parse("open zzznomatch")
        self.assertEqual(len(cmd.entities), 0)

    def test_multiple_entities(self):
        interp = _make_interpreter(("Safari", "app"), ("TextEdit", "app"))
        cmd = interp.parse("open Safari and TextEdit")
        names = {e.item.name for e in cmd.entities}
        self.assertIn("Safari", names)
        self.assertIn("TextEdit", names)

    def test_alias_resolves(self):
        items = [VocabItem("Google Chrome", "app", aliases=["Chrome"])]
        vocab = MacVocabulary(auto_refresh=False)
        vocab._items = items
        interp = Interpreter(vocab, entity_threshold=0.55)
        cmd = interp.parse("open Chrome")
        self.assertEqual(len(cmd.entities), 1)
        self.assertEqual(cmd.entities[0].item.name, "Google Chrome")


# ---------------------------------------------------------------------------
# ParsedCommand properties
# ---------------------------------------------------------------------------

class TestParsedCommand(unittest.TestCase):
    def test_primary_entity_is_highest_score(self):
        interp = _make_interpreter(("Safari", "app"), ("TextEdit", "app"))
        cmd = interp.parse("open Safari and TextEdit")
        if cmd.entities:
            primary = cmd.primary_entity
            self.assertIsNotNone(primary)
            self.assertEqual(primary.score, max(e.score for e in cmd.entities))

    def test_overall_confidence_range(self):
        interp = _make_interpreter(("Safari", "app"))
        cmd = interp.parse("open Safari")
        self.assertGreaterEqual(cmd.overall_confidence, 0.0)
        self.assertLessEqual(cmd.overall_confidence, 1.0)

    def test_str_representation(self):
        interp = _make_interpreter(("Safari", "app"))
        cmd = interp.parse("open Safari")
        s = str(cmd)
        self.assertIn("intent=", s)
        self.assertIn("confidence=", s)

    def test_raw_preserved(self):
        interp = _make_interpreter(("Safari", "app"))
        sentence = "Please open Safari now"
        cmd = interp.parse(sentence)
        self.assertEqual(cmd.raw, sentence)

    def test_empty_sentence(self):
        interp = _make_interpreter(("Safari", "app"))
        cmd = interp.parse("")
        self.assertIsNone(cmd.intent)
        self.assertEqual(cmd.entities, [])


# ---------------------------------------------------------------------------
# End-to-end sentence examples
# ---------------------------------------------------------------------------

class TestEndToEnd(unittest.TestCase):
    def setUp(self):
        items = [
            VocabItem("Safari", "app", path="/Applications/Safari.app"),
            VocabItem("Spotify", "app", path="/Applications/Spotify.app"),
            VocabItem("Google Chrome", "app", aliases=["Chrome"],
                      path="/Applications/Google Chrome.app"),
            VocabItem("TextEdit", "app", path="/Applications/TextEdit.app"),
            VocabItem("Displays", "pref", path="/System/Library/PreferencePanes/Displays.prefPane"),
        ]
        vocab = MacVocabulary(auto_refresh=False)
        vocab._items = items
        self.interp = Interpreter(vocab, entity_threshold=0.55)

    def test_open_safari(self):
        cmd = self.interp.parse("open Safari")
        self.assertEqual(cmd.intent, "open")
        self.assertEqual(cmd.primary_entity.item.name, "Safari")

    def test_launch_chrome_alias(self):
        cmd = self.interp.parse("launch Chrome")
        self.assertEqual(cmd.intent, "open")
        self.assertEqual(cmd.primary_entity.item.name, "Google Chrome")

    def test_close_spotify(self):
        cmd = self.interp.parse("quit Spotify")
        self.assertEqual(cmd.intent, "close")
        self.assertEqual(cmd.primary_entity.item.name, "Spotify")

    def test_search_anything(self):
        cmd = self.interp.parse("search for my document")
        self.assertEqual(cmd.intent, "search")

    def test_play_spotify(self):
        cmd = self.interp.parse("play Spotify")
        self.assertEqual(cmd.intent, "play")
        self.assertEqual(cmd.primary_entity.item.name, "Spotify")

    def test_set_displays_pref(self):
        cmd = self.interp.parse("set display brightness")
        self.assertEqual(cmd.intent, "set")

    def test_case_insensitive(self):
        cmd = self.interp.parse("OPEN SAFARI")
        self.assertEqual(cmd.intent, "open")
        self.assertEqual(cmd.primary_entity.item.name, "Safari")

    def test_high_confidence_for_clear_command(self):
        cmd = self.interp.parse("open Safari")
        self.assertGreater(cmd.overall_confidence, 0.65)


if __name__ == "__main__":
    unittest.main()
