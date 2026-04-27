"""
cli.py — command-line entry-point for mac10.

Usage
-----
    python -m mac10 "open Safari"
    python -m mac10 --dry-run "close Spotify"
    python -m mac10 --show-vocab
    python -m mac10            # interactive REPL mode
"""

from __future__ import annotations

import argparse
import sys

from .interpreter import Interpreter
from .vocabulary import MacVocabulary
from .actions import ActionExecutor


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="mac10",
        description="Command your Mac in one sentence.",
    )
    p.add_argument(
        "sentence",
        nargs="?",
        help="Natural-language command (omit for interactive mode).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and show the command without executing it.",
    )
    p.add_argument(
        "--show-vocab",
        action="store_true",
        help="Print vocabulary summary and exit.",
    )
    p.add_argument(
        "--threshold",
        type=float,
        default=0.55,
        metavar="T",
        help="Fuzzy-match threshold 0–1 (default 0.55).",
    )
    p.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show parsed command details.",
    )
    return p


def _process(sentence: str, interpreter: Interpreter, executor: ActionExecutor,
             *, dry_run: bool, verbose: bool) -> None:
    parsed = interpreter.parse(sentence)

    if verbose or dry_run:
        print(f"\n  Intent   : {parsed.intent or '(none)'}")
        if parsed.entities:
            for e in parsed.entities:
                print(f"  Entity   : {e.span!r} → {e.item.name!r} [{e.item.kind}] (score={e.score:.2f})")
        else:
            print("  Entity   : (none matched)")
        if parsed.unresolved_tokens:
            print(f"  Leftover : {' '.join(parsed.unresolved_tokens)!r}")
        print(f"  Confidence: {parsed.overall_confidence:.2f}\n")

    if dry_run:
        print("(dry-run: action not executed)")
        return

    result = executor.execute(parsed)
    print(result)


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    print("🔍 Building local vocabulary…", end=" ", flush=True)
    vocab = MacVocabulary()
    print(f"done ({len(vocab)} items)")

    if args.show_vocab:
        by_kind: dict[str, int] = {}
        for item in vocab.items:
            by_kind[item.kind] = by_kind.get(item.kind, 0) + 1
        for kind, count in sorted(by_kind.items()):
            print(f"  {kind:10s} {count:4d}")
        return

    interpreter = Interpreter(vocab, entity_threshold=args.threshold)
    executor = ActionExecutor()

    if args.sentence:
        _process(args.sentence, interpreter, executor,
                 dry_run=args.dry_run, verbose=args.verbose)
    else:
        # Interactive REPL
        print("mac-10  ·  type a sentence, or 'exit' to quit.\n")
        while True:
            try:
                line = input("▶ ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if line.lower() in {"exit", "quit", "q"}:
                break
            if line:
                _process(line, interpreter, executor,
                         dry_run=args.dry_run, verbose=args.verbose)


if __name__ == "__main__":
    main()
