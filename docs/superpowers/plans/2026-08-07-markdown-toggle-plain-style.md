# Markdown Toggle Plain Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Markdown expand/collapse controls look like lightweight text links instead of bordered buttons.

**Architecture:** Update only the existing `.markdown-toggle` CSS rule in the extension options stylesheet. Preserve the shared markup and JavaScript behavior, including keyboard focus handling.

**Tech Stack:** Chrome MV3 extension, CSS.

## Global Constraints

- Keep the existing toggle labels and behavior.
- Remove border, background, and horizontal button padding from `.markdown-toggle`.
- Add a darker underlined hover state.
- Preserve a visible `:focus-visible` outline.
- Do not modify renderer, storage, or preview collapse logic.

---

### Task 1: Restyle Markdown toggle

**Files:**
- Modify: `extension/src/options/options.css:167-168`

**Interfaces:**
- Consumes: existing `.markdown-toggle` elements emitted by `renderMarkdownPreview()`.
- Produces: borderless text-style expand/collapse controls.

- [ ] **Step 1: Update the CSS rule**

Use:

```css
.markdown-toggle {
  margin: var(--xs) 0;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
  color: var(--text-mute);
}
.markdown-toggle:hover {
  color: var(--text-ink);
  text-decoration: underline;
}
.markdown-toggle:focus-visible {
  outline: 1px solid var(--ink);
  outline-offset: 3px;
}
```

- [ ] **Step 2: Verify the focused change**

Run: `node --test --experimental-modules extension/src/lib/markdown.test.js`

Run: `node --check --experimental-modules extension/src/options/options.js`

Run: `git diff --check`

Expected: 8 Markdown tests pass, syntax check exits 0, and diff check is clean.

- [ ] **Step 3: Commit**

```bash
git add extension/src/options/options.css
git commit -m "style: make markdown toggle borderless"
```
