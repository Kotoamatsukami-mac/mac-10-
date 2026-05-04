# Macten UI Doctrine

## Status

This document is a repo contract.

Labels used here:

- **Verified** — the current repository implements it
- **Principle** — a durable design rule applied to this repo
- **Future** — intended direction, not current behavior
- **Known limitation** — a real current gap
- **Do not introduce** — a design drift path

## Stance

The strip is projection. The command spine is authority.

The UI exists to render input, preview, status, and quiet affordances. It must not own command logic, lexicon, policy, or native dispatch. Visual decisions in this doc are about how the projection looks and feels, not about what it commands.

## Principle — one element, one role

Each visible element on the strip owns exactly one semantic responsibility.

A status indicator is not also a brand mark. A drag handle is not also a glyph. A divider is not also a slot. If an element cannot answer the question "what do I tell the user?" in a single sentence, it should be removed or merged into the element that can.

This rule prevents the failure mode where two adjacent decorative elements collapse into a single ambiguous cluster — a "chipped" left edge where the eye does not know what to read.

## Principle — the strip is a single slab

The strip reads as one continuous surface. No internal vertical dividers. No segmented chips. No Apple-Pay-style internal compartments.

Slot boundaries are conveyed through spacing and the natural geometry of contained elements (a dot, an input baseline, a button group), not through hairlines.

## Verified — three-slot model

The strip currently exposes exactly three slots in flexbox order:

```text
[ .identity-dot ]  [ .input-wrap ]  [ .toolbar ]
       left           center             right
```

Owner: `src/App.tsx` (structure) and `src/styles.css` (tokens, geometry, state).

| Slot | Role | Interactive | Drag |
| --- | --- | --- | --- |
| `.identity-dot` | Status-as-identity. 5px luminous orb. Color shifts with `status.kind` (idle / ok / hint / blocked). Brightens on focus. | No | Inherits stage drag |
| `.input-wrap` | The command input, the empty prompt, the ghost completion, the resolved affordance, the typed-plus-status line. Single visual lane. | Yes (text input) | `.no-drag` |
| `.toolbar` | Pin button (toggles always-on-top). Settings button (opens settings popover). | Yes (buttons) | `.no-drag` |

Auxiliary decorative spans (`.strip-rim`, `.strip-sheen`) are zero-thickness atmospheric elements, not slots.

## Verified — drag model

Drag is ambient, not a visible widget.

- `.shell-stage` (the outer `<main>`) carries `-webkit-app-region: drag` and an `onMouseDown` handler that calls `getCurrentWindow().startDragging()` for non-no-drag targets.
- `.no-drag` opts out specific elements: `.input-wrap`, `.toolbar`, popovers, panels.
- The user can drag from the strip's transparent surround, the rim atmosphere, or the strip body itself outside no-drag zones.

There is no explicit drag handle, three-dot affordance, or labeled drag region. This is intentional: explicit drag affordances make a thin command strip feel like a hardware widget instead of a native macOS surface.

## Principle — typography is a contrast system

Three opacity tiers carry meaning. They are not interchangeable.

| Tier | Variable | Use |
| --- | --- | --- |
| Primary | `--text-primary` (0.92) | Typed input, prompt title, active strong copy |
| Secondary | `--text-secondary` (0.56) | Active state second line, settings labels |
| Tertiary | `--text-tertiary` (0.34) | Inactive labels, settings values |
| Faint | `--text-faint` (0.22) | Background captions, footers |
| Ghost | `--text-ghost` (0.16) | Helper hints, ghost completion text |

Crisp contrast is built by widening the gap between adjacent tiers, not by raising every tier. A confident primary plus a quiet ghost reads sharper than two muted middles.

## Verified — design tokens

Tokens live in `:root` in `src/styles.css`. Categories:

| Token family | Purpose |
| --- | --- |
| `--accent-ok` `--accent-hint` `--accent-blocked` `--accent-iris` | Status accents — restrained, deeper, calmer |
| `--ink-deep` `--ink-mid` `--ink-rise` `--ink-sheen` | Midnight palette for the glass slab |
| `--text-primary` `--text-secondary` `--text-tertiary` `--text-faint` `--text-ghost` `--ghost-color` | Text contrast tiers |
| `--edge-soft` `--edge-mid` `--edge-strong` | Border/hairline tiers (used for borders only — never as internal dividers within the strip) |
| `--dot-idle` `--dot-idle-halo` `--dot-focus` `--dot-focus-halo` | Identity-dot tiers for idle and focused states (active states reuse `--accent-*`) |

## Principle — color discipline

- Ad-hoc `rgba(...)` literals must reference an already-declared token unless they describe a per-component shadow or gradient stop.
- Status accents are seasoning. The strip stays midnight at rest. Color appears for feedback (status chip, identity dot on outcome, focus rim) and disappears once the moment passes.
- The bottom rim accent is a single thin gradient whisper, not a halo. Side bleeds, top bleeds, and full-perimeter glows are forbidden.

## Verified — hover and focus discipline

Hover states are quiet:

- Tool buttons: border tint shifts from `--edge-soft` to a slightly more present blue-grey; background nudges one ink tier; an ambient glow at ~14px / 0.16 alpha. No transform-scale, no saturated halo.
- Pop rows: a thin `rgba(120, 140, 200, 0.06)` background fade. No movement.
- Active-press: a single 7% scale-down tap on tool buttons (`scale(0.93)`) — the only motion in the system, and it lasts 110ms.

Focus states are quiet:

- Strip border-color rises from `--edge-mid` to `rgba(150, 170, 230, 0.30)`.
- Inner indigo whisper appears at 0.12 alpha; ambient glow at 0.13 alpha and 32px radius.
- Identity dot in idle state brightens from 0.34 to 0.62 alpha.

The whole system asks for attention without raising its voice.

## Principle — strip geometry is conservative

- The strip should not grow taller, wider, or boxier without a reason that points to user evidence.
- Reclaim space whenever an element no longer earns it. This is a recurring obligation, not a one-time pass.
- Padding values are tuned: `0 7px 0 12px` on the strip itself, with the identity dot owning its own `6px / 14px` margins. Changes here ripple to the input baseline.

## Verified — current geometry

- Window: 920 × 380 (set in `src-tauri/tauri.conf.json`)
- Stage padding-top: 32 px
- Strip: `min(722px, calc(100vw - 48px))` × 56 px
- Border radius: 17 px
- Identity dot: 5 × 5 px, with 6 + 14 px horizontal margins
- Tool buttons: 32 × 32 px, radius 9 px
- Settings popover: 268 px wide, top: 100 px
- Help panel: `min(560px, calc(100vw - 48px))` wide, top: 100 px
- Hover dropdown: `min(360px, calc(100vw - 48px))` wide, top: 100 px

## Principle — popovers and panels follow strip discipline

The settings popover, help panel, and hover dropdown inherit the strip's design language: midnight glass, soft inner sheen, dark drop shadow, `--edge-mid` border, no internal vertical dividers, hairline horizontal dividers between rows only when row-to-row separation aids scanning.

Popovers should not introduce new accent colors, new typography weights, or new border tiers. They are quieter children of the strip.

## Verified — hover dropdown surface

The hover dropdown (`.hover-dropdown`) surfaces the example-command pool when the strip is at rest and the user engages the input via hover or focus.

Owner: `src/App.tsx` (state + render) and `src/styles.css` (geometry + glass).

Gating:

- Visible only when `showPrompt` is true (`status.kind === "idle" && !value && !helpOpen`)
- AND `(focused || inputHovered)` AND `!menuOpen`
- Cannot appear while typing, while a status is showing, while ghost completion is showing, or while another popover is open

Behavior:

- Each row is a `<button type="button">` carrying a quoted command
- Click on a row populates the input with the command and refocuses
- The dropdown's own `onMouseEnter`/`onMouseLeave` keeps it open while the cursor moves between input and dropdown
- An 180 ms slide-down intro animation; disabled under `prefers-reduced-motion: reduce`

Geometry:

- Width: `min(360px, calc(100vw - 48px))`
- Top: 100 px (same baseline as settings popover and help panel — they mutually exclude)
- Padding: 8 / 6 / 10 px

The dropdown is data-driven by `PROMPT_HINTS` in `src/App.tsx`. Adding a new hint adds a row automatically; the doctrine does not require an entry per hint.

## Do not introduce — design drift

Do not add:

- explicit drag-handle widgets (three-dot, two-bar, grab affordance)
- decorative cmd / ⌘ glyphs that do not earn their space with status meaning
- internal vertical dividers within the strip body
- saturated hover halos, full-perimeter glows, or rainbow auras
- multi-color accent stacks competing with the bottom rim
- toolbar buttons larger than 40 × 40 or smaller than 28 × 28
- new strip slots without entering this document
- `App.tsx` ownership of color literals — colors live in tokens
- inline event handlers in `App.tsx` that do native work — native work is owned by the spine

## Do not introduce — interactive drift

Do not add:

- click-to-open menus that overlap the strip body
- hover-triggered popovers (popovers are intentional; they require a click)
- tooltips with body copy beyond a single short label
- animated transitions longer than 320 ms outside `theme-factory`-style brand moments
- emoji, icons-as-status, or icon fonts in the strip
- pulse animations, marching-ants, or breathing effects on idle

## Verified — accessibility posture

- The strip is the primary surface and is reachable via global shortcut Cmd+Shift+Space (focuses input).
- The `.identity-dot` is `aria-hidden="true"` because its meaning is duplicated by status copy in the input lane when status is non-idle.
- All decorative spans (`.strip-rim`, `.strip-sheen`, prompts, ghosts, affordances) are `aria-hidden="true"`.
- The strip itself is `aria-label="Macten command strip"`.
- Reduced motion is respected: `.tool-btn`, `.command-input`, `.strip`, `.strip-rim`, and `.identity-dot` all collapse transition durations to 0 ms when `prefers-reduced-motion: reduce`.

## Future — interactive approval

When Phase 5 lands inline approval (e.g. `Quit Safari? Y/N` in the strip), the approval row must:

- live inside the existing `.input-wrap` slot, not a new panel
- use `--accent-hint` for the prompt and `--accent-ok` / `--accent-blocked` for the resolved branches
- be dismissable with Escape and clearable with any keystroke
- never block other input — typing replaces it the way it replaces a status line today

Do not introduce a separate approval modal, popover, or sheet.

## Verification

Minimum checks:

```bash
npx tsc --noEmit
npm test
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
```

UI changes additionally require:

- Manual drag from transparent surround
- Manual drag from strip body
- Input text selection works without dragging
- Pin toggles `set_pinned` and remains visually paired with state
- Settings popover and help panel both open and close cleanly
- Identity dot color shifts on submit (idle → ok / hint / blocked → idle)
- Focused state visibly engages strip without shouting
