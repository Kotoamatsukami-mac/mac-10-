import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export default function App() {
  const [pinned, setPinned] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
        <input
          ref={inputRef}
          className="command-input"
          type="text"
          placeholder="Command your Mac in one sentence"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
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
