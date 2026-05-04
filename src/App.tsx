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
  if (p.confidence_tier !== "exact" && p.confidence_tier !== "prefix") return null;
  const label = p.target_ref.label;
  if (label.trim().toLowerCase() === typed.trim().toLowerCase()) return null;
  return label;
}

const HELP_TRIGGERS = ["help", "?", "commands"];
function isHelpInput(raw: string): boolean {
  return HELP_TRIGGERS.includes(raw.trim().toLowerCase());
}

export default function App() {
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<StripStatus>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const statusTimerRef = useRef<number | null>(null);

  const { prediction, snapshot, resolveNow } = usePreviewPrediction(value);
  const showGhost = shouldShowGhost(prediction);
  const ghostVisible = status.kind === "idle" && showGhost && !helpOpen;
  const completion = ghostVisible && prediction ? prediction.completion : "";
  const affordance =
    status.kind === "idle" && !showGhost && !helpOpen
      ? resolvedAffordance(prediction, value)
      : null;
  const showPrompt = status.kind === "idle" && !value && !helpOpen;

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
    const ms = next.kind === "ok" ? 1400 : next.kind === "hint" ? 2800 : 3200;
    statusTimerRef.current = window.setTimeout(() => {
      statusTimerRef.current = null;
      setStatus({ kind: "idle" });
    }, ms);
  };

  useEffect(() => () => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<void>("focus-input", () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  const togglePin = async () => {
    const next = !pinned;
    setPinned(next);
    try {
      await invoke("set_pinned", { pinned: next });
    } catch {
      setPinned(!next);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".no-drag")) return;
    getCurrentWindow().startDragging().catch(() => {});
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
    const submittedInput = value.trim();
    if (!submittedInput) return;

    if (isHelpInput(submittedInput)) {
      setHelpOpen(true);
      setValue("");
      return;
    }

    setHelpOpen(false);

    const resolved = resolveNow(submittedInput);
    const resolveStatus = statusFromResolveNow(resolved);
    if (resolveStatus) {
      setStripStatus(resolveStatus);
      return;
    }
    if (resolved.kind !== "resolved" || !resolved.prediction) return;

    const outcome = await runSpine(resolved.prediction, snapshot);
    const next = statusFromOutcome(outcome);
    if (outcome.execution?.kind === "ok") setValue("");
    setStripStatus(next);
  };

  const closeOverlays = () => {
    setMenuOpen(false);
    setHelpOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (menuOpen || helpOpen) { closeOverlays(); return; }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
      return;
    }
    if (!ghostVisible || !completion) return;
    if (e.key === "Tab") { e.preventDefault(); acceptCompletion(); return; }
    if (e.key === "ArrowRight") {
      const el = e.currentTarget;
      if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
        e.preventDefault();
        acceptCompletion();
      }
    }
  };

  return (
    <main className="shell-stage" onMouseDown={startDrag}>
      <section
        className={`strip ${focused ? "is-focused" : ""}`}
        aria-label="Macten command strip"
      >
        <span className="strip-rim" aria-hidden="true" />
        <span className="strip-sheen" aria-hidden="true" />

        {/* Identity dot — status-aware, the only thing on the left edge */}
        <span
          className={`identity-dot identity-dot-${status.kind}`}
          aria-hidden="true"
        />

        {/* Input — single-element prompt, never inline-collides */}
        <div className="input-wrap no-drag">
          <div className="input-stack">
            {showPrompt ? (
              <div className="empty-prompt" aria-hidden="true">
                <span className="prompt-title">Ask your Mac</span>
                <span className="prompt-hint">Try "open Safari"</span>
              </div>
            ) : status.kind !== "idle" ? (
              <div className="status-line" aria-hidden="true">
                <span className="status-typed">{value}</span>
                <span className={`status-chip status-chip-${status.kind}`}>
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
                <span className="affordance-typed">{value}</span>
                <span className="affordance-trail">
                  <span className="affordance-arrow">↩</span>
                  <span className="affordance-label">{affordance}</span>
                </span>
              </div>
            ) : null}
            <input
              ref={inputRef}
              className="command-input"
              type="text"
              value={value}
              aria-label="Command"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setValue(e.target.value);
                if (status.kind !== "idle") { clearStatusTimer(); setStatus({ kind: "idle" }); }
                if (helpOpen) setHelpOpen(false);
              }}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        </div>

        {/* Right toolbar — quiet, native-sized */}
        <div className="toolbar no-drag">
          <button
            type="button"
            className={`tool-btn ${pinned ? "is-active" : ""}`}
            onClick={togglePin}
            title={pinned ? "Unpin from front" : "Keep in front"}
            aria-pressed={pinned}
          >
            <LayerIcon size={18} />
          </button>

          <button
            type="button"
            className={`tool-btn ${menuOpen ? "is-active" : ""}`}
            onClick={() => { setMenuOpen((o) => !o); setHelpOpen(false); }}
            aria-expanded={menuOpen}
            aria-controls="settings-popover"
            title="Settings"
          >
            <GearIcon size={18} />
          </button>
        </div>
      </section>

      {menuOpen && (
        <aside
          id="settings-popover"
          className="settings-popover no-drag"
          aria-label="Settings"
        >
          <PopRow icon={<AccentIcon />} label="Accent" value="Rainbow" />
          <PopRow icon={<LayerIcon size={18} />} label="Load Style" value="Liquid Glass" />
          <PopRow
            icon={<PinIcon />}
            label="Keep in Front"
            value={pinned ? "On" : "Off"}
            onClick={togglePin}
          />
          <PopRow icon={<LockIcon />} label="Permissions" value="Microphone, Accessibility" />
          <PopRow icon={<ClockIcon />} label="History" value="View recent activity" />
        </aside>
      )}

      {helpOpen && (
        <aside className="help-panel no-drag" aria-label="Help">
          <div className="help-header">
            <span className="help-title">Macten commands</span>
            <button
              type="button"
              className="help-close"
              onClick={() => setHelpOpen(false)}
              aria-label="Close help"
            >✕</button>
          </div>
          <div className="help-body">
            <HelpRow cmd="open Safari" desc="Launch or focus an app" />
            <HelpRow cmd="focus Safari" desc="Bring app to front" />
            <HelpRow cmd="quit Safari" desc="Quit a running app" />
            <HelpRow cmd="open Settings" desc="Open System Settings pane" />
            <HelpRow cmd="volume 50" desc="Set system volume 0–100" />
            <HelpRow cmd="mute / unmute" desc="Toggle audio output" />
          </div>
          <p className="help-footer">Esc to dismiss · type any command to continue</p>
        </aside>
      )}
    </main>
  );
}

/* ── Inline icon set — clean SVG, no CSS hacks ──────────────────────────── */

function LayerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 3 8l9 5 9-5-9-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.62" />
      <path d="M3 18l9 5 9-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.36" />
    </svg>
  );
}

function GearIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.12-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.56-1.12 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.04a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.04a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.52 1.04Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8.2" stroke="url(#rainbowGrad)" strokeWidth="2.4" />
      <defs>
        <linearGradient id="rainbowGrad" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2effc4" />
          <stop offset="33%" stopColor="#7c6dff" />
          <stop offset="66%" stopColor="#ff3ea5" />
          <stop offset="100%" stopColor="#ffd456" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M11.5 2L13 6.5l4.5.5-3.5 3 1 4.5L11 12l-4 2.5 1-4.5-3.5-3 4.5-.5L10.5 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="9" width="12" height="9" rx="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4.5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PopRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`pop-row ${onClick ? "pop-row-interactive" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="pop-icon">{icon}</span>
      <span className="pop-text">
        <strong>{label}</strong>
        <em>{value}</em>
      </span>
    </div>
  );
}

function HelpRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="help-row">
      <code className="help-cmd">{cmd}</code>
      <span className="help-desc">{desc}</span>
    </div>
  );
}
