import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { usePreviewPrediction } from "./hooks/usePreviewPrediction";
import { runSpine } from "./spine/runSpine";
import {
  type StripStatus,
  statusFromOutcome,
  statusFromResolveNow,
} from "./spine/outcomeMessage";

// How long each status kind remains visible before reverting to idle.
// Lives at module scope so the durations are inspectable in one place
// rather than buried inside an event handler.
const STATUS_DURATIONS_MS: Record<Exclude<StripStatus["kind"], "idle">, number> = {
  ok: 1400,
  hint: 2800,
  blocked: 3200,
};

// Rotating example commands shown in the empty prompt's helper line.
// Pulled from the live command surface — no aspirational copy. Each focus
// without prior typing rolls a new one so the strip feels lived-in.
const PROMPT_HINTS: readonly string[] = [
  'Try "open Safari"',
  'Try "quit Spotify"',
  'Try "volume 50"',
  'Try "downloads"',
  'Try "focus Chrome"',
  'Try "mute"',
  'Try "open Settings"',
] as const;

function pickPromptHint(): string {
  return PROMPT_HINTS[Math.floor(Math.random() * PROMPT_HINTS.length)]!;
}

const HELP_TRIGGERS = ["help", "?", "commands"];
function isHelpInput(raw: string): boolean {
  return HELP_TRIGGERS.includes(raw.trim().toLowerCase());
}

type DropdownSuggestion = {
  fill: string;
  label: string;
  intent: string;
  tier: "exact" | "prefix" | "contains" | "fuzzy" | "ambiguous" | "no_match" | "static";
};

function commandFromPromptHint(hint: string): string {
  return /"([^"]+)"/.exec(hint)?.[1] ?? hint;
}

function intentBadgeFor(fill: string): string {
  return fill.trim().split(/\s+/, 1)[0]?.toLowerCase() || "try";
}

function labelFromCommand(fill: string): string {
  const trimmed = fill.trim();
  const [, label] = /^(\S+)\s+(.+)$/.exec(trimmed) ?? [];
  return label ?? trimmed;
}

function staticDropdownSuggestion(fill: string): DropdownSuggestion {
  return {
    fill,
    label: labelFromCommand(fill),
    intent: intentBadgeFor(fill),
    tier: "static",
  };
}

function shortIntentLabel(intent: string): string {
  return intent.trim().toLowerCase() || "try";
}

export default function App() {
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [inputHovered, setInputHovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [status, setStatus] = useState<StripStatus>({ kind: "idle" });
  const [promptHint, setPromptHint] = useState<string>(() => pickPromptHint());
  const inputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<number | null>(null);

  const { snapshot, resolveNow, getSuggestions } =
    usePreviewPrediction(value);
  const showPrompt = status.kind === "idle" && !value && !helpOpen;

  // Engagement-driven dropdown visibility.
  //
  // The dropdown follows user intent, not typing state. It opens when the
  // user signals engagement (input focus, input hover) and closes when the
  // user signals dismissal (Escape, click outside, window blur). Once
  // dismissed, it does not return until the user re-engages explicitly.
  // Typing alone — including continuing to type after dismissal — does
  // not reopen it.
  const engaged = (focused || inputHovered) && !dismissed;
  const showDropdown =
    engaged && status.kind === "idle" && !menuOpen && !helpOpen;

  // Dropdown contents: empty input shows the static pool, non-empty input
  // shows live resolver suggestions. Both branches are fill-only projection
  // rows; submit still re-resolves the input through the spine.
  const suggestions: DropdownSuggestion[] = (() => {
    if (!showDropdown) return [];
    if (!value.trim()) {
      return PROMPT_HINTS.map(commandFromPromptHint).map(staticDropdownSuggestion);
    }
    return getSuggestions(value, 6).map((s) => ({
      fill: s.fill,
      label: s.label,
      intent: s.intent,
      tier: s.tier,
    }));
  })();

  // Reset keyboard selection when suggestions change.
  const suggestionsKey = suggestions.map((s) => `${s.intent}:${s.fill}:${s.tier}`).join("|");
  useEffect(() => {
    setSelectedIndex(-1);
  }, [suggestionsKey]);

  const fillFromCommand = (cmd: string) => {
    setValue(cmd);
    setInputHovered(false);
    setDismissed(true);
    setSelectedIndex(-1);

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cmd.length, cmd.length);
    });
  };

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
    const ms = STATUS_DURATIONS_MS[next.kind];
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

  // Outside-click dismissal: a pointerdown anywhere outside the strip and
  // outside the dropdown panel signals the user is done with the dropdown
  // for now. It stays dismissed until explicit re-engagement.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const insideStrip = stripRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideStrip && !insideDropdown) {
        setDismissed(true);
        setInputHovered(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // Window-blur dismissal: when the Macten window loses focus (user
  // switches apps, clicks another window), treat it as a dismissal. The
  // dropdown will not reappear until the user re-engages the input.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    getCurrentWindow()
      .listen("tauri://blur", () => {
        setDismissed(true);
        setInputHovered(false);
        setFocused(false);
      })
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
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
    // Only drag when pointer is over the visible strip, not the transparent
    // surround. CSS app-region: drag on .strip handles the OS-level case;
    // this JS handler is the Tauri fallback for the same boundary.
    if (!stripRef.current?.contains(e.target as Node)) return;
    getCurrentWindow().startDragging().catch(() => {});
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
    setDismissed(true); // submitting is itself a dismissal of the dropdown

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
      setDismissed(true);
      setSelectedIndex(-1);
      return;
    }

    // Dropdown keyboard navigation.
    if (showDropdown && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === "Tab" && selectedIndex >= 0) {
        e.preventDefault();
        const sel = suggestions[selectedIndex];
        if (sel) fillFromCommand(sel.fill);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // If a dropdown suggestion is keyboard-selected, fill it instead of submitting.
      if (showDropdown && selectedIndex >= 0) {
        const sel = suggestions[selectedIndex];
        if (sel) { fillFromCommand(sel.fill); return; }
      }
      void submit();
      return;
    }
  };

  return (
    <main className="shell-stage" onMouseDown={startDrag}>
      <section
        ref={stripRef}
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
        <div
          className="input-wrap no-drag"
          onMouseEnter={() => { setInputHovered(true); setDismissed(false); }}
          onMouseLeave={() => setInputHovered(false)}
        >
          <div className="input-stack">
            {showPrompt ? (
              <div className="empty-prompt" aria-hidden="true">
                <span className="prompt-title">Ask your Mac</span>
                <span className="prompt-hint">{promptHint}</span>
              </div>
            ) : status.kind !== "idle" ? (
              <div className="status-line" aria-hidden="true">
                <span className="status-typed">{value}</span>
                <span className={`status-chip status-chip-${status.kind}`}>
                  {status.msg}
                </span>
              </div>
            ) : null}
            <input
              ref={inputRef}
              className="command-input"
              type="text"
              value={value}
              aria-label="Command"
              onFocus={() => {
                setFocused(true);
                setDismissed(false);
                if (!value) setPromptHint(pickPromptHint());
              }}
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

      {showDropdown && suggestions.length > 0 && (
        <aside
          ref={dropdownRef}
          className="hover-dropdown no-drag"
          aria-label="Command suggestions"
          onMouseEnter={() => { setInputHovered(true); setDismissed(false); }}
          onMouseLeave={() => setInputHovered(false)}
        >
          <span className="hover-dropdown__caption">
            {value.trim() ? "Matches" : "Try one"}
          </span>
          <div className="hover-dropdown__rows">
            {suggestions.map((item, i) => (
              <button
                key={`${item.intent}:${item.fill}`}
                type="button"
                className={`hover-dropdown__row hover-dropdown__row-${item.tier}${i === selectedIndex ? " is-selected" : ""}`}
                onClick={() => fillFromCommand(item.fill)}
                title={item.fill}
              >
                <span className="hover-dropdown__intent">{shortIntentLabel(item.intent)}</span>
                <span className="hover-dropdown__label">{item.label}</span>
                <span className={`hover-dropdown__confidence hover-dropdown__confidence-${item.tier}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </aside>
      )}

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
