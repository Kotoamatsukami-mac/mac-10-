import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { usePreviewPrediction } from "./hooks/usePreviewPrediction";
import type { PreviewPrediction } from "./resolver/previewResolver";
import { runSpine } from "./spine/runSpine";
import {
  type StripStatus,
  statusFromOutcome,
  statusFromResolveNow,
} from "./spine/outcomeMessage";

const GHOST_DISPLAY_THRESHOLD = 0.28;

function shouldShowGhost(p: PreviewPrediction | null): boolean {
  if (!p || !p.completion) return false;
  switch (p.confidence_tier) {
    case "exact":
    case "prefix":
      return true;
    case "contains":
      return p.confidence >= GHOST_DISPLAY_THRESHOLD;
    default:
      return false;
  }
}

function resolvedAffordance(
  p: PreviewPrediction | null,
  typed: string,
): string | null {
  if (!p || !p.target_ref) return null;
  if (p.completion) return null;
  if (p.confidence_tier !== "exact" && p.confidence_tier !== "prefix") {
    return null;
  }
  const label = p.target_ref.label;
  if (label.trim().toLowerCase() === typed.trim().toLowerCase()) return null;
  return label;
}

export default function App() {
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<StripStatus>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const statusTimerRef = useRef<number | null>(null);

  const { prediction, snapshot, resolveNow } = usePreviewPrediction(value);
  const showGhost = shouldShowGhost(prediction);
  const ghostVisible = status.kind === "idle" && showGhost;
  const completion = ghostVisible && prediction ? prediction.completion : "";
  const affordance =
    status.kind === "idle" && !showGhost
      ? resolvedAffordance(prediction, value)
      : null;
  const showPrompt = status.kind === "idle" && !value;

  const clearStatusTimer = () => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  };

  const setStripStatus = (next: StripStatus) => {
    clearStatusTimer();
    setStatus(next);
    if (next.kind === "idle") return;
    const ms = next.kind === "ok" ? 1200 : next.kind === "hint" ? 2500 : 3000;
    statusTimerRef.current = window.setTimeout(() => {
      statusTimerRef.current = null;
      setStatus({ kind: "idle" });
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<void>("focus-input", () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  const togglePin = async () => {
    const next = !pinned;
    setPinned(next);
    try {
      await invoke("set_pinned", { pinned: next });
    } catch (err) {
      console.error("pin toggle failed", err);
      setPinned(!next);
    }
  };

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".no-drag")) return;
    getCurrentWindow()
      .startDragging()
      .catch(() => {});
  };

  const acceptCompletion = () => {
    if (!completion) return;
    const next = value + completion;
    setValue(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.setSelectionRange(next.length, next.length);
    });
  };

  const submit = async () => {
    const submittedInput = value;
    if (!submittedInput.trim()) return;

    const resolved = resolveNow(submittedInput);
    const resolveStatus = statusFromResolveNow(resolved);
    if (resolveStatus) {
      setStripStatus(resolveStatus);
      return;
    }

    if (resolved.kind !== "resolved" || !resolved.prediction) return;

    const outcome = await runSpine(resolved.prediction, snapshot);
    const next = statusFromOutcome(outcome);
    if (outcome.execution?.kind === "ok") {
      setValue("");
    }
    setStripStatus(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && menuOpen) {
      e.preventDefault();
      setMenuOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
      return;
    }
    if (!ghostVisible || !completion) return;
    if (e.key === "Tab") {
      e.preventDefault();
      acceptCompletion();
      return;
    }
    if (e.key === "ArrowRight") {
      const el = e.currentTarget;
      if (
        el.selectionStart === el.value.length &&
        el.selectionEnd === el.value.length
      ) {
        e.preventDefault();
        acceptCompletion();
      }
    }
  };

  return (
    <main className="shell-stage" onMouseDown={startDrag}>
      <section className="strip" aria-label="Macten command strip">
        <span className="strip-sheen" aria-hidden="true" />

        <div className="command-hub" aria-hidden="true">
          <span className="command-symbol">cmd</span>
          <span className="command-divider" />
        </div>

        <div className="input-wrap no-drag">
          <div className="input-stack">
            {showPrompt ? (
              <div className="empty-prompt" aria-hidden="true">
                <span className="prompt-title">Ask your Mac</span>
                <span className="prompt-hint">Try "open Safari"</span>
              </div>
            ) : status.kind !== "idle" ? (
              <div className="input-ghost" aria-hidden="true">
                <span className="ghost-typed">{value}</span>
                <span className={`strip-status strip-status-${status.kind}`}>
                  {status.msg}
                </span>
              </div>
            ) : ghostVisible && prediction ? (
              <div className="input-ghost" aria-hidden="true">
                <span className="ghost-typed">{value}</span>
                <span className="ghost-completion">{prediction.completion}</span>
              </div>
            ) : affordance ? (
              <div className="input-affordance" aria-hidden="true">
                <span className="affordance-arrow">Enter</span>
                <span className="affordance-label">{affordance}</span>
              </div>
            ) : null}
            <input
              ref={inputRef}
              className="command-input"
              type="text"
              value={value}
              aria-label="Command"
              onChange={(e) => {
                setValue(e.target.value);
                if (status.kind !== "idle") {
                  clearStatusTimer();
                  setStatus({ kind: "idle" });
                }
              }}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        </div>

        <div className="toolbar no-drag">
          <button
            type="button"
            className={`tool-button layer-button ${pinned ? "active" : ""}`}
            onClick={togglePin}
            title={pinned ? "Unpin from front" : "Keep in front"}
            aria-pressed={pinned}
          >
            <span className="layer-glyph" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>

          <span className="toolbar-divider" aria-hidden="true" />

          <button
            type="button"
            className={`tool-button settings-button ${menuOpen ? "active" : ""}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="settings-popover"
            title="Settings"
          >
            <span className="gear-glyph" aria-hidden="true">gear</span>
          </button>
        </div>
      </section>

      {menuOpen ? (
        <aside
          id="settings-popover"
          className="settings-popover no-drag"
          aria-label="Macten settings summary"
        >
          <div className="popover-caret" aria-hidden="true" />
          <div className="settings-row">
            <span className="settings-icon accent-ring" aria-hidden="true" />
            <span>
              <strong>Accent</strong>
              <em>Rainbow</em>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-icon stack-icon" aria-hidden="true" />
            <span>
              <strong>Load Style</strong>
              <em>Liquid Glass</em>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-icon pin-icon" aria-hidden="true" />
            <span>
              <strong>Keep in Front</strong>
              <em>{pinned ? "On" : "Off"}</em>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-icon lock-icon" aria-hidden="true" />
            <span>
              <strong>Permissions</strong>
              <em>Accessibility, Automation</em>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-icon history-icon" aria-hidden="true" />
            <span>
              <strong>History</strong>
              <em>Recent activity</em>
            </span>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
