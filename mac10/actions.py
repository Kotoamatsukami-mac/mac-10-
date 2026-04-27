"""
ActionExecutor — turn a ParsedCommand into a real macOS action.

Each intent maps to a handler method.  Handlers use the safest available
mechanism: ``open`` CLI, ``osascript`` (AppleScript), or ``mdfind``/``mdls``.
All subprocess calls are guarded with timeouts so the interpreter stays
responsive even when Spotlight or AppleScript are slow.
"""

from __future__ import annotations

import os
import subprocess
from typing import Callable, Dict, Optional

from .interpreter import ParsedCommand


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Seconds to wait after the Spotlight keyboard shortcut before typing the query.
# Too short and the query is lost; too long and the UX feels sluggish.
SPOTLIGHT_ACTIVATION_DELAY: float = 0.5

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list, *, timeout: int = 10) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _applescript(script: str, *, timeout: int = 10) -> str:
    """Run *script* via osascript and return stdout (stripped)."""
    try:
        r = _run(["osascript", "-e", script], timeout=timeout)
        return r.stdout.strip()
    except Exception as exc:  # noqa: BLE001
        return f"(AppleScript error: {exc})"


def _open(path_or_name: str, *, reveal: bool = False, app_name: str | None = None) -> str:
    """Use the macOS `open` command to open a file/app/URL.

    Parameters
    ----------
    path_or_name:
        Filesystem path or URL to open.
    reveal:
        When True, passes ``-R`` to reveal the item in Finder instead of
        opening it.
    app_name:
        When provided, passes ``-a <app_name>`` so the named application
        is used.  The flag and the name are kept as separate list elements
        to handle app names that contain spaces or special characters safely.
    """
    args = ["open"]
    if reveal:
        args.append("-R")
    if app_name is not None:
        args.extend(["-a", app_name])
    else:
        args.append(path_or_name)
    try:
        r = _run(args, timeout=10)
        label = app_name or path_or_name
        if r.returncode == 0:
            return f"Opened {label!r}"
        return f"Could not open {label!r}: {r.stderr.strip()}"
    except Exception as exc:  # noqa: BLE001
        return f"Error: {exc}"


# ---------------------------------------------------------------------------
# Intent handlers
# ---------------------------------------------------------------------------

class ActionExecutor:
    """
    Execute a :class:`~mac10.interpreter.ParsedCommand` on the local Mac.

    Each ``handle_<intent>`` method receives the full :class:`ParsedCommand`
    and returns a human-readable result string.
    """

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------

    def execute(self, cmd: ParsedCommand) -> str:
        """Dispatch *cmd* to the appropriate handler and return a result string."""
        if cmd.intent is None:
            return self._handle_unknown(cmd)

        handler: Callable[[ParsedCommand], str] = getattr(
            self, f"handle_{cmd.intent}", self._handle_unknown
        )
        try:
            return handler(cmd)
        except Exception as exc:  # noqa: BLE001
            return f"Action failed: {exc}"

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------

    def handle_open(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity is None:
            return "Nothing to open — no matching vocabulary item found."
        item = entity.item
        if item.path:
            return _open(item.path)
        # Fall back to `open -a <name>` for apps, passing name as a separate arg
        if item.kind == "app":
            return _open("", app_name=item.name)
        return f"Don't know how to open {item.name!r} ({item.kind})"

    def handle_close(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity is None:
            return "Nothing to close — no matching vocabulary item found."
        item = entity.item
        if item.kind == "app":
            script = f'tell application "{item.name}" to quit'
            return _applescript(script) or f"Sent quit to {item.name!r}"
        return f"Cannot close {item.name!r} (kind={item.kind})"

    def handle_search(self, cmd: ParsedCommand) -> str:
        # Use unresolved tokens + entity names as the search query
        query_parts: list[str] = []
        if cmd.entities:
            query_parts.extend(e.span for e in cmd.entities)
        query_parts.extend(cmd.unresolved_tokens)
        query = " ".join(query_parts) if query_parts else cmd.raw
        # Open Spotlight with the query via AppleScript
        script = (
            'tell application "System Events" to keystroke " " using {command down}\n'
            f'delay {SPOTLIGHT_ACTIVATION_DELAY}\n'
            f'keystroke "{query}"\n'
        )
        _applescript(script)
        return f"Searching Spotlight for {query!r}"

    def handle_play(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        # If entity is an app (e.g. Spotify, Music) open it and press play
        if entity and entity.item.kind == "app":
            _open(entity.item.path or entity.item.name)
            script = f'tell application "{entity.item.name}" to play'
            _applescript(script)
            return f"Playing via {entity.item.name!r}"
        # Generic: send play to Music.app
        _applescript("tell application \"Music\" to play")
        return "Sent play to Music"

    def handle_pause(self, cmd: ParsedCommand) -> str:
        _applescript("tell application \"Music\" to pause")
        return "Paused playback"

    def handle_send(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        recipient = entity.item.name if entity else "(unknown)"
        return f"Composing message to {recipient!r} — please confirm in Mail/Messages."

    def handle_call(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity is None:
            return "No contact found to call."
        script = f'tell application "FaceTime" to activate'
        _applescript(script)
        return f"Opening FaceTime for {entity.item.name!r}"

    def handle_create(self, cmd: ParsedCommand) -> str:
        tokens = cmd.unresolved_tokens
        name = " ".join(tokens) if tokens else "Untitled"
        return f"Create {name!r} — feature coming soon."

    def handle_delete(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity is None or entity.item.path is None:
            return "No file found to delete."
        # Move to Trash via AppleScript for safety
        posix = entity.item.path
        script = (
            f'tell application "Finder" to move (POSIX file "{posix}") to trash'
        )
        _applescript(script)
        return f"Moved {entity.item.name!r} to Trash"

    def handle_set(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity and entity.item.kind == "pref":
            _open(entity.item.path or "")
            return f"Opened preference pane {entity.item.name!r}"
        return "Opened System Settings"

    def handle_show(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity and entity.item.path:
            return _open(entity.item.path, reveal=True)
        return f"Showing {entity.item.name if entity else 'unknown'}"

    def handle_sleep(self, _cmd: ParsedCommand) -> str:
        _applescript("tell application \"System Events\" to sleep")
        return "Sending Mac to sleep…"

    def handle_restart(self, _cmd: ParsedCommand) -> str:
        return "Restart requires confirmation. Run: sudo shutdown -r now"

    def handle_shutdown(self, _cmd: ParsedCommand) -> str:
        return "Shutdown requires confirmation. Run: sudo shutdown -h now"

    def _handle_unknown(self, cmd: ParsedCommand) -> str:
        entity = cmd.primary_entity
        if entity:
            return f"Unclear intent — did you want to open {entity.item.name!r}?"
        return f"Could not understand: {cmd.raw!r}"
