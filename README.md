# mac-10-
COMMAND YOUR MAC IN ONE SENTENCE.

## Overview

**mac-10-** is a natural-language command layer for macOS.  
Type one sentence — mac-10 reads it against your Mac's **real, live vocabulary** (apps, contacts, files, preference panes, shell commands) and executes the right action.

```
▶ open Safari
▶ launch Chrome
▶ quit Spotify
▶ search for my tax document
▶ play Spotify
▶ set display brightness
▶ send email to Alice
```

## How it works

### 1. Vocabulary — reading the Mac's real data

`mac10/vocabulary.py` indexes multiple local sources at startup:

| Source | Examples |
|---|---|
| Installed apps (`/Applications`, `~/Applications`, `/System/Applications`) | Safari, TextEdit, Xcode |
| System preference panes | Displays, Network, Security & Privacy |
| Recent files via Spotlight (`mdfind`) | Documents used in the last 30 days |
| Address Book contacts (Spotlight) | Alice Smith, Bob Jones |
| Shell commands (`$PATH`) | git, brew, python |

Each entry becomes a `VocabItem` with its display name, kind, path, and auto-generated aliases (e.g. "Google Chrome" → "Chrome", "Text Edit").

### 2. Interpretation — AI-grade parsing

`mac10/interpreter.py` processes every sentence through a pipeline:

1. **Normalise** — lowercase, collapse whitespace, strip punctuation.
2. **Classify intent** — scan for verb/trigger keywords with word-boundary matching; earliest position wins so "set display" correctly maps to `set`, not `show`.
3. **Strip intent tokens** — remove matched intent words so they don't pollute entity search.
4. **Extract entities** — slide n-gram windows (4 → 3 → 2 → 1 words) over remaining tokens; stop-word spans ("safari **and** textedit") are skipped so both entities can be resolved independently.
5. **Fuzzy-match** — `difflib.SequenceMatcher` scores each span against every vocabulary item; substring containment gets a boosted score; matches below the threshold (default 0.55) are discarded.
6. **Score confidence** — combine intent confidence and average entity score.

### 3. Actions — executing the command

`mac10/actions.py` dispatches each `ParsedCommand` to a handler:

- **open** — `open <path>` / `open -a <app>`
- **close** — AppleScript `tell application … to quit`
- **search** — opens Spotlight via AppleScript keystrokes
- **play / pause** — AppleScript to Music / Spotify
- **send / call** — opens Mail / FaceTime
- **set** — opens the matched preference pane
- **sleep / restart / shutdown** — system AppleScript calls

## Installation

```bash
# From the repo root
pip install -e .
```

## Usage

```bash
# One-shot command
mac10 "open Safari"

# Dry-run (parse only, no execution)
mac10 --dry-run --verbose "launch Chrome"

# Show vocabulary summary
mac10 --show-vocab

# Interactive REPL
mac10
```

## Running tests

```bash
python -m pytest tests/ -v
```

No external dependencies — uses only the Python standard library.
