import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { usePreviewPrediction } from "./hooks/usePreviewPrediction";
import type { PreviewPrediction } from "./resolver/previewResolver";
import { runSpine } from "./spine/runSpine";

const CONTAINS_THRESHOLD = 0.5;

function shouldShowGhost(p: PreviewPrediction | null): boolean {
  if (!p || !p.completion) return false;
  switch (p.confidence_tier) {
    case "exact":
    case "prefix":
      return true;
    case "contains":
      return p.confidence >= CONTAINS_THRESHOLD;
    default:
      return false;
  }
}

export default function App() {
  const [pinned, setPinned] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { prediction, resolveNow } = usePreviewPrediction(value);
  const showGhost = shouldShowGhost(prediction);
  const completion = showGhost && prediction ? prediction.completion : "";

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
    if (
      e.target !== e.currentTarget &&
      (e.target as HTMLElement).closest(".no-drag")
    ) {
      return;
    }
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
    if (resolved.kind === "unavailable") {
      console.log("[macten spine]", {
        kind: "rejected",
        raw_input: submittedInput,
        reason: resolved.reason,
      });
      return;
    }

    if (!resolved.prediction) return;

    const outcome = await runSpine(resolved.prediction);
    if (outcome.execution?.kind === "ok") {
      setValue("");
    } else {
      console.log("[macten spine]", outcome);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
      return;
    }
    if (!showGhost || !completion) return;
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
    <div className="strip">
      <div
        className="drag-handle drag-handle-left"
        onMouseDown={startDrag}
        aria-label="drag"
      >
        <span className="grip" />
      </div>

      <div className="input-wrap no-drag">
        <div className="input-stack">
          {showGhost && prediction && (
            <div className="input-ghost" aria-hidden="true">
              <span className="ghost-typed">{value}</span>
              <span className="ghost-completion">{prediction.completion}</span>
            </div>
          )}
          <input
            ref={inputRef}
            className="command-input"
            type="text"
            placeholder="Command your Mac in one sentence"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      <button
        type="button"
        className={`pin-button no-drag ${pinned ? "active" : ""}`}
        onClick={togglePin}
        title={pinned ? "Unpin" : "Pin"}
        aria-pressed={pinned}
      >
        <span className="pin-glyph">{pinned ? "●" : "○"}</span>
      </button>

      <div
        className="drag-handle drag-handle-right"
        onMouseDown={startDrag}
        aria-label="drag"
      >
        <span className="grip" />
      </div>
    </div>
  );
}
