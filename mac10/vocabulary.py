"""
MacVocabulary — build a live index of the Mac's real local vocabulary.

Sources included
----------------
* Installed applications  (/Applications, ~/Applications)
* Contacts                (via `contacts` CLI / address-book Spotlight query)
* Recent Spotlight items  (mdfind recent-documents)
* System-preference panes (~/Library/PreferencePanes + /System/…)
* Shell commands          ($PATH executables)
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import List, Optional


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class VocabItem:
    """A single entry in the Mac's local vocabulary."""

    name: str                   # human-readable display name
    kind: str                   # 'app' | 'contact' | 'file' | 'pref' | 'cmd'
    path: Optional[str] = None  # filesystem path when applicable
    aliases: List[str] = field(default_factory=list)  # alternative names

    # Normalised lowercase name (derived automatically)
    def __post_init__(self) -> None:
        self._norm = _normalise(self.name)
        self._alias_norms: List[str] = [_normalise(a) for a in self.aliases]

    @property
    def norm(self) -> str:
        return self._norm

    @property
    def alias_norms(self) -> List[str]:
        return self._alias_norms

    def all_norms(self) -> List[str]:
        """All normalised name variants for this item."""
        return [self._norm] + self._alias_norms


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lower-case, collapse whitespace, strip punctuation."""
    text = text.lower()
    text = re.sub(r"['''\u2018\u2019]", "", text)   # smart quotes / apostrophes
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _run(cmd: List[str], timeout: int = 5) -> str:
    """Run *cmd* and return stdout; return '' on any error."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Individual source readers
# ---------------------------------------------------------------------------

def _read_apps() -> List[VocabItem]:
    """Return VocabItems for every .app bundle visible to the user."""
    app_dirs = [
        "/Applications",
        os.path.expanduser("~/Applications"),
        "/System/Applications",
        "/System/Applications/Utilities",
    ]
    seen: set[str] = set()
    items: List[VocabItem] = []
    for directory in app_dirs:
        try:
            entries = os.listdir(directory)
        except OSError:
            continue
        for entry in entries:
            if not entry.endswith(".app"):
                continue
            name = entry[:-4]  # strip ".app"
            full_path = os.path.join(directory, entry)
            if full_path in seen:
                continue
            seen.add(full_path)
            # Build useful aliases (e.g. "Google Chrome" -> ["chrome"])
            aliases = _app_aliases(name)
            items.append(VocabItem(name=name, kind="app", path=full_path, aliases=aliases))
    return items


def _app_aliases(name: str) -> List[str]:
    """Generate short-form aliases for an application name."""
    aliases: List[str] = []
    # Drop common suffixes
    for suffix in (" for mac", " for macos", " desktop", " app"):
        if name.lower().endswith(suffix):
            aliases.append(name[: -len(suffix)])
    # If multi-word, add the last word (e.g. "Google Chrome" -> "Chrome")
    parts = name.split()
    if len(parts) > 1:
        aliases.append(parts[-1])
        aliases.append(parts[0])
    # CamelCase split: "TextEdit" -> "Text Edit"
    camel = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    if camel != name:
        aliases.append(camel)
    return list(dict.fromkeys(aliases))  # deduplicate, preserve order


def _read_contacts() -> List[VocabItem]:
    """
    Return VocabItems for contacts via a Spotlight (mdfind) query.
    Falls back gracefully when Spotlight cannot access the address book.
    """
    raw = _run(
        ["mdfind", "-onlyin", os.path.expanduser("~/Library/Application Support/AddressBook"),
         "kMDItemContentType == 'com.apple.addressbook.person'"],
        timeout=5,
    )
    items: List[VocabItem] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Extract display name from filename
        basename = os.path.splitext(os.path.basename(line))[0]
        if basename:
            items.append(VocabItem(name=basename, kind="contact", path=line))
    return items


def _read_preference_panes() -> List[VocabItem]:
    """Return VocabItems for System Preferences / System Settings panes."""
    pref_dirs = [
        "/System/Library/PreferencePanes",
        "/Library/PreferencePanes",
        os.path.expanduser("~/Library/PreferencePanes"),
    ]
    items: List[VocabItem] = []
    for directory in pref_dirs:
        try:
            entries = os.listdir(directory)
        except OSError:
            continue
        for entry in entries:
            if not entry.endswith(".prefPane"):
                continue
            name = entry[:-9]
            items.append(
                VocabItem(
                    name=name,
                    kind="pref",
                    path=os.path.join(directory, entry),
                    aliases=["preferences " + name, name + " settings"],
                )
            )
    return items


def _read_path_commands() -> List[VocabItem]:
    """Return VocabItems for executables found on $PATH."""
    items: List[VocabItem] = []
    seen: set[str] = set()
    path_env = os.environ.get("PATH", "")
    for directory in path_env.split(os.pathsep):
        try:
            entries = os.listdir(directory)
        except OSError:
            continue
        for entry in entries:
            if entry in seen:
                continue
            full = os.path.join(directory, entry)
            if os.path.isfile(full) and os.access(full, os.X_OK):
                seen.add(entry)
                items.append(VocabItem(name=entry, kind="cmd", path=full))
    return items


def _read_recent_files(limit: int = 200) -> List[VocabItem]:
    """
    Return VocabItems for recently-used documents via Spotlight.
    Limited to *limit* results to stay fast.
    """
    raw = _run(
        ["mdfind", "-onlyin", os.path.expanduser("~"),
         "-attr", "kMDItemLastUsedDate",
         "kMDItemLastUsedDate >= $time.today(-30)"],
        timeout=8,
    )
    items: List[VocabItem] = []
    for line in raw.splitlines()[:limit]:
        line = line.strip()
        if not line or line.startswith("\t"):
            continue
        name = os.path.splitext(os.path.basename(line))[0]
        if name:
            items.append(VocabItem(name=name, kind="file", path=line))
    return items


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class MacVocabulary:
    """
    Live index of the Mac's local vocabulary.

    Call :meth:`refresh` to rebuild from the current system state.
    """

    def __init__(self, *, auto_refresh: bool = True) -> None:
        self._items: List[VocabItem] = []
        if auto_refresh:
            self.refresh()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def refresh(self) -> None:
        """Re-read all vocabulary sources from the system."""
        items: List[VocabItem] = []
        items.extend(_read_apps())
        items.extend(_read_preference_panes())
        items.extend(_read_contacts())
        items.extend(_read_recent_files())
        items.extend(_read_path_commands())
        self._items = items

    @property
    def items(self) -> List[VocabItem]:
        return list(self._items)

    def by_kind(self, kind: str) -> List[VocabItem]:
        return [i for i in self._items if i.kind == kind]

    def find(self, query: str) -> List[VocabItem]:
        """Return items whose normalised name contains *query* (substring)."""
        q = _normalise(query)
        return [i for i in self._items if q in i.norm or any(q in a for a in i.alias_norms)]

    def __len__(self) -> int:
        return len(self._items)

    def __repr__(self) -> str:
        by_kind = {}
        for item in self._items:
            by_kind.setdefault(item.kind, 0)
            by_kind[item.kind] += 1
        return f"MacVocabulary({by_kind})"
