"""Tests for mac10.vocabulary — MacVocabulary and VocabItem."""

from __future__ import annotations

import os
import sys
import types
import unittest

# Ensure the repo root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mac10.vocabulary import (
    MacVocabulary,
    VocabItem,
    _normalise,
    _app_aliases,
    _read_apps,
)


class TestNormalise(unittest.TestCase):
    def test_lowercase(self):
        self.assertEqual(_normalise("Safari"), "safari")

    def test_strips_punctuation(self):
        self.assertEqual(_normalise("App Store"), "app store")

    def test_collapses_spaces(self):
        self.assertEqual(_normalise("  Google  Chrome  "), "google chrome")

    def test_removes_apostrophes(self):
        self.assertEqual(_normalise("Don't"), "dont")

    def test_empty(self):
        self.assertEqual(_normalise(""), "")


class TestAppAliases(unittest.TestCase):
    def test_multi_word_aliases(self):
        aliases = _app_aliases("Google Chrome")
        self.assertIn("Chrome", aliases)
        self.assertIn("Google", aliases)

    def test_camel_case_split(self):
        aliases = _app_aliases("TextEdit")
        self.assertIn("Text Edit", aliases)

    def test_suffix_removal(self):
        aliases = _app_aliases("Dropbox for Mac")
        self.assertIn("Dropbox", aliases)

    def test_no_duplicate_aliases(self):
        aliases = _app_aliases("Final Cut Pro")
        # Should not contain duplicates
        self.assertEqual(len(aliases), len(set(aliases)))


class TestVocabItem(unittest.TestCase):
    def test_norm_property(self):
        item = VocabItem(name="Google Chrome", kind="app")
        self.assertEqual(item.norm, "google chrome")

    def test_alias_norms(self):
        item = VocabItem(name="Google Chrome", kind="app", aliases=["Chrome"])
        self.assertIn("chrome", item.alias_norms)

    def test_all_norms_includes_main_name(self):
        item = VocabItem(name="Safari", kind="app", aliases=["Web Browser"])
        norms = item.all_norms()
        self.assertIn("safari", norms)
        self.assertIn("web browser", norms)


class TestMacVocabularyReadApps(unittest.TestCase):
    """
    _read_apps() reads the filesystem, so it will return nothing useful inside
    CI, but the function must not raise and must return a list.
    """

    def test_returns_list(self):
        apps = _read_apps()
        self.assertIsInstance(apps, list)

    def test_items_are_vocab_items(self):
        apps = _read_apps()
        for app in apps:
            self.assertIsInstance(app, VocabItem)
            self.assertEqual(app.kind, "app")

    def test_names_are_non_empty(self):
        for app in _read_apps():
            self.assertTrue(app.name, f"Empty name for {app!r}")


class TestMacVocabularyInterface(unittest.TestCase):
    """Test MacVocabulary with a pre-seeded fake vocabulary."""

    def _make_vocab(self, items) -> MacVocabulary:
        v = MacVocabulary(auto_refresh=False)
        v._items = items
        return v

    def test_len(self):
        items = [VocabItem("Safari", "app"), VocabItem("TextEdit", "app")]
        v = self._make_vocab(items)
        self.assertEqual(len(v), 2)

    def test_by_kind_filters_correctly(self):
        items = [
            VocabItem("Safari", "app"),
            VocabItem("Wi-Fi", "pref"),
        ]
        v = self._make_vocab(items)
        self.assertEqual(len(v.by_kind("app")), 1)
        self.assertEqual(v.by_kind("app")[0].name, "Safari")

    def test_find_substring(self):
        items = [VocabItem("Google Chrome", "app"), VocabItem("Safari", "app")]
        v = self._make_vocab(items)
        results = v.find("chrome")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].name, "Google Chrome")

    def test_find_alias(self):
        items = [VocabItem("Google Chrome", "app", aliases=["Chrome"])]
        v = self._make_vocab(items)
        results = v.find("chrome")
        self.assertEqual(len(results), 1)

    def test_find_returns_empty_for_no_match(self):
        items = [VocabItem("Safari", "app")]
        v = self._make_vocab(items)
        self.assertEqual(v.find("zzznomatch"), [])

    def test_repr_contains_kind_counts(self):
        items = [VocabItem("Safari", "app"), VocabItem("TextEdit", "app")]
        v = self._make_vocab(items)
        r = repr(v)
        self.assertIn("app", r)


if __name__ == "__main__":
    unittest.main()
