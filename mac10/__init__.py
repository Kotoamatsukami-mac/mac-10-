"""mac10 — command your Mac in one sentence."""

from .vocabulary import MacVocabulary
from .interpreter import Interpreter
from .actions import ActionExecutor

__all__ = ["MacVocabulary", "Interpreter", "ActionExecutor"]
