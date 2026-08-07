# Single Markdown Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicate bottom Markdown expand button while preserving the single top toggle's expand/collapse behavior.

**Architecture:** Change only the shared `renderMarkdownPreview()` markup in the extension options page. Existing delegated click handling already updates every `[data-markdown-toggle]`, so one remaining top button will continue to switch labels and ARIA state without JavaScript restructuring.

**Tech Stack:** Chrome MV3 extension, vanilla JavaScript, CSS, Node test runner.

## Global Constraints

- Keep one toggle above the Markdown content.
- Short previews still show no toggle; long previews still use the existing length measurement.
- Expanded state still changes the same button to `[-] 收闔全文`.
- Do not change the Markdown renderer, storage schema, or unrelated workspace features.

---

### Task 1: Remove duplicate bottom toggle

**Files:**
- Modify: `extension/src/options/options.js:23-29`

**Interfaces:**
- Consumes: existing `renderMarkdownPreview(markdown, className)` helper and delegated `[data-markdown-toggle]` event handler.
- Produces: one top `[data-markdown-toggle]` button per preview.

- [ ] **Step 1: Remove the bottom button from the shared markup**

Change the helper from two buttons to one:

```js
function renderMarkdownPreview(markdown, className = '') {
  return `<div class="${className} markdown-preview" data-markdown-preview>
    <button type="button" class="btn-sm markdown-toggle markdown-toggle-top" data-markdown-toggle hidden aria-expanded="false">[+] 展開全文</button>
    <div data-markdown-content>${markdownToHTML(markdown)}</div>
  </div>`;
}
```

Do not modify `setMarkdownPreviewExpanded()`, `measureMarkdownPreview()`, or the delegated click handler; their `querySelectorAll()` behavior remains valid for one button.

- [ ] **Step 2: Run verification**

Run: `node --test --experimental-modules extension/src/lib/markdown.test.js`

Run: `node --check --experimental-modules extension/src/options/options.js`

Run: `git diff --check`

Expected: all 8 Markdown tests pass, syntax check exits 0, and diff check is clean.

- [ ] **Step 3: Commit the focused UI change**

```bash
git add extension/src/options/options.js
git commit -m "fix: keep one markdown expand toggle"
```

