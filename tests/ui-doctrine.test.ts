// UI Doctrine — self-enforcing guard tests.
//
// docs/UI_DOCTRINE.md and ADR-002 declare a small number of hard rules
// about the strip's structure. These tests turn the doctrine into a CI
// gate so future agents cannot silently re-introduce drift.
//
// Each test maps to a specific doctrine clause. Failures should be
// resolved either by removing the regression or by amending the
// doctrine + ADR explicitly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const APP = readFileSync("src/App.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");

// ────────────────────────────────────────────────────────────────────
// Three-slot model — App.tsx must render exactly the three documented
// strip slots. Adding a new slot must be conscious; this test forces
// the next agent to update the doctrine in the same PR.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: three-slot strip composition", () => {
  // Order matters — the doctrine declares left, center, right.
  const dotIdx = APP.indexOf('className={`identity-dot identity-dot-${status.kind}');
  const inputWrapIdx = APP.indexOf('className="input-wrap no-drag"');
  const toolbarIdx = APP.indexOf('className="toolbar no-drag"');

  assert.ok(dotIdx > 0, "App.tsx must render .identity-dot");
  assert.ok(inputWrapIdx > 0, "App.tsx must render .input-wrap");
  assert.ok(toolbarIdx > 0, "App.tsx must render .toolbar");

  assert.ok(
    dotIdx < inputWrapIdx && inputWrapIdx < toolbarIdx,
    "slot order must be: identity-dot, input-wrap, toolbar",
  );
});

// ────────────────────────────────────────────────────────────────────
// No re-introduction of demolished selectors. PR #11/#12 history is
// captured in ADR-002. These names should never come back without a
// new ADR explicitly reversing course.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: forbidden legacy selectors are absent", () => {
  const forbidden = [
    "WindowDragHandle",
    "lounge-strip__marker",
    "lounge-strip__drag-handle",
    "cmd-mark",
  ];
  for (const name of forbidden) {
    assert.ok(
      !APP.includes(name),
      `App.tsx must not reference removed selector "${name}"`,
    );
    assert.ok(
      !CSS.includes(name),
      `styles.css must not reference removed selector "${name}"`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// Drag is ambient. There must be exactly one startDragging() call
// site and it must be on the shell-stage onMouseDown handler. A
// second drag handler is the canonical drift path and is forbidden.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: drag is owned by shell-stage only", () => {
  const matches = APP.match(/startDragging\(\)/g) ?? [];
  assert.equal(
    matches.length,
    1,
    "exactly one startDragging() call site is permitted (the shell-stage drag handler)",
  );

  // The only call site should be inside the startDrag function used by
  // shell-stage's onMouseDown. Verify by proximity.
  const callIdx = APP.indexOf("startDragging()");
  const dragHandlerIdx = APP.lastIndexOf("const startDrag", callIdx);
  assert.ok(
    dragHandlerIdx > 0 && callIdx - dragHandlerIdx < 400,
    "startDragging() must live inside the startDrag handler",
  );
});

// ────────────────────────────────────────────────────────────────────
// No internal vertical dividers within the strip. The doctrine
// permits hairlines on popovers around their outer edge but bans
// border-right / border-left between slots.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: no internal vertical dividers in the strip", () => {
  // Capture the .toolbar rule body and the .cmd-mark / .input-wrap
  // areas. None should declare a vertical divider.
  const toolbarRule = matchRule(CSS, /^\.toolbar\s*\{/m);
  assert.ok(toolbarRule, ".toolbar rule must exist");
  assert.ok(
    !/border-left:\s*1px/.test(toolbarRule!),
    ".toolbar must not carry a left divider (slot boundary by spacing only)",
  );

  const inputWrapRule = matchRule(CSS, /^\.input-wrap\s*\{/m);
  assert.ok(inputWrapRule, ".input-wrap rule must exist");
  assert.ok(
    !/border-(left|right):\s*1px/.test(inputWrapRule!),
    ".input-wrap must not carry vertical dividers",
  );
});

// ────────────────────────────────────────────────────────────────────
// Identity dot must be aria-hidden. Status copy in the input lane
// carries the meaning when status is non-idle; the dot duplicates it
// visually only.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: identity dot is aria-hidden", () => {
  const dotIdx = APP.indexOf("identity-dot identity-dot-${status.kind}");
  assert.ok(dotIdx > 0);
  // The aria-hidden attribute should appear within ~120 chars of the
  // className, which is the span declaration window.
  const window = APP.slice(dotIdx, dotIdx + 200);
  assert.ok(
    /aria-hidden="true"/.test(window),
    "identity-dot span must declare aria-hidden=\"true\"",
  );
});

// ────────────────────────────────────────────────────────────────────
// Token discipline — the four documented :root token families must
// all be declared. Removing or renaming a family without updating
// the doctrine is forbidden drift.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: documented design tokens are declared", () => {
  const required = [
    "--accent-ok",
    "--accent-hint",
    "--accent-blocked",
    "--ink-deep",
    "--ink-mid",
    "--ink-rise",
    "--ink-sheen",
    "--text-primary",
    "--text-secondary",
    "--text-tertiary",
    "--text-faint",
    "--text-ghost",
    "--edge-soft",
    "--edge-mid",
    "--edge-strong",
    "--dot-idle",
    "--dot-idle-halo",
    "--dot-focus",
    "--dot-focus-halo",
  ];
  for (const token of required) {
    assert.ok(
      CSS.includes(`${token}:`),
      `:root must declare token ${token} (see docs/UI_DOCTRINE.md)`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// Tool button geometry stays in the documented 28–40 px range and
// the documented border-radius 8–14 px range. The doctrine binds
// these for visual rhythm with the strip's 17 px radius.
// ────────────────────────────────────────────────────────────────────

test("ui doctrine: tool button geometry within doctrine bounds", () => {
  const rule = matchRule(CSS, /^\.tool-btn\s*\{/m);
  assert.ok(rule, ".tool-btn rule must exist");

  const widthMatch = /width:\s*(\d+)px/.exec(rule!);
  const heightMatch = /height:\s*(\d+)px/.exec(rule!);
  const radiusMatch = /border-radius:\s*(\d+)px/.exec(rule!);

  assert.ok(widthMatch && heightMatch && radiusMatch, "tool-btn must declare width/height/border-radius");

  const w = Number(widthMatch![1]);
  const h = Number(heightMatch![1]);
  const r = Number(radiusMatch![1]);

  assert.ok(w >= 28 && w <= 40, `tool-btn width ${w} outside [28, 40]`);
  assert.ok(h >= 28 && h <= 40, `tool-btn height ${h} outside [28, 40]`);
  assert.ok(r >= 8 && r <= 14, `tool-btn border-radius ${r} outside [8, 14]`);
});

// ────────────────────────────────────────────────────────────────────
// Helper — extract a single CSS rule body by its selector regex.
// Returns the text inside the matching {…} or null if not found.
// ────────────────────────────────────────────────────────────────────

function matchRule(css: string, selector: RegExp): string | null {
  const match = selector.exec(css);
  if (!match) return null;
  const start = css.indexOf("{", match.index);
  if (start < 0) return null;
  let depth = 1;
  let i = start + 1;
  while (i < css.length && depth > 0) {
    const c = css[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    i += 1;
  }
  return depth === 0 ? css.slice(start + 1, i - 1) : null;
}
