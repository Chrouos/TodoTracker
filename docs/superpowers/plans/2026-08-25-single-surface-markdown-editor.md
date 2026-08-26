# Single-Surface Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-block `contentEditable` implementation with one continuous Web and Extension Markdown editing surface that supports native selection, cursor movement, keyboard editing, tables, and task checkboxes.

**Architecture:** Keep the existing Markdown AST, parser, serializer, persistence value contracts, and textarea bridge. Render one root `contentEditable` per editor and delegate browser events from that root; add platform-specific DOM adapters with identical block markup and selection contracts, while keeping pure block mutations in `shared/markdown`.

**Tech Stack:** React 19, Next.js 16, TypeScript, native browser `contentEditable`, Chrome MV3 JavaScript, Node `node:test`, existing shared Markdown AST/parser/serializer.

**Spec:** `docs/superpowers/specs/2026-08-25-single-surface-markdown-editor-design.md`

## Global Constraints

- Preserve the existing Markdown AST and serialized Markdown storage format.
- Keep the public Web `MarkdownBlockEditor` props and `MarkdownEditorHandle` behavior compatible with existing callers.
- Keep the Extension textarea as the public compatibility source for forms, persistence, auto-grow, and external callers.
- Use one editable root per editor; paragraphs, list items, and table cells must not have independent `contentEditable` attributes.
- Keep Web and Extension block markup, `data-block-path` semantics, keyboard rules, table behavior, and task checkbox behavior aligned.
- Do not add a third-party editor dependency in this iteration.
- Preserve safe Markdown rendering and existing unsupported-syntax behavior.
- Write failing tests before production code for each new pure behavior or adapter contract.
- Use two-space indentation, semicolons, and the repository's existing single-quote JavaScript/TypeScript style.

---

## File Map

### Shared domain and contracts

- Modify: `shared/markdown/editor-commands.js` — add immutable block transactions needed by one-root editing: selection replacement, block split/merge, table continuation, table deletion, and list/quote boundary handling.
- Modify: `shared/markdown/editor-commands.test.mjs` — cover every new immutable transaction and nested path edge case.
- Modify: `shared/markdown/index.js` and `shared/markdown/index.d.ts` — expose the shared transaction API to Web.

### Web editor

- Create: `web/lib/markdown-dom.ts` — browser DOM adapter for rendering editable blocks, reading inline marks and tables, mapping DOM `Range` values to logical AST paths/offsets, and restoring selections.
- Create: `web/lib/markdown-dom.test.mjs` — adapter contract tests using the repository's testable DOM fixture approach; keep pure selection and AST assertions separate from browser-only event assertions.
- Rewrite: `web/components/MarkdownBlockEditor.tsx` — one root `contentEditable`, delegated input/keyboard/paste/click handling, external value synchronization, toolbar integration, and source mode compatibility.
- Modify: `web/lib/markdown-editor.ts` — retain and extend pure inline and paste helpers used by the new root transaction flow; remove per-surface navigation helpers once the root editor no longer needs them.
- Modify: `web/lib/markdown-editor.test.mjs` — add root transaction fixtures and delete tests that only validate independent-surface focus hopping.
- Modify: `web/lib/markdown.ts` — re-export shared commands and the Web DOM adapter contract where existing components import Markdown helpers.

### Chrome Extension editor

- Create: `extension/src/lib/markdown-dom.js` — Extension-local equivalent of the Web DOM adapter; it must remain package-local because the MV3 extension cannot import files outside its package root.
- Modify: `extension/src/lib/markdown-dom.test.js` — test the Extension adapter's rendering, selection mapping, and block transaction contract.
- Rewrite: `extension/src/lib/markdown-editor.js` — mount one editable root while preserving the textarea bridge, source mode, toolbar, delegated task toggles, and external input synchronization.
- Modify: `extension/src/lib/markdown-editor.test.js` — cover the single-root editor API, selection replacement, table continuation, and textarea synchronization.
- Modify: `extension/test/web-markdown-editor-contract.test.mjs` — assert Web-facing markup contracts shared by the Extension integration and reject independent editable block surfaces.
- Modify: `extension/test/options-layout.test.mjs` — update Options page editor assertions for one root and preserved source textarea behavior.

### Documentation and verification

- Modify: `docs/superpowers/specs/2026-08-25-single-surface-markdown-editor-design.md` only if implementation review discovers a deliberate contract change; otherwise keep the approved spec unchanged.
- Modify: `docs/superpowers/plans/2026-08-25-single-surface-markdown-editor.md` — track task completion and record verification output.

---

## Task 1: Establish the shared transaction contract ✅ Complete (`f5ae38a`)

**Files:**

- Modify: `shared/markdown/editor-commands.test.mjs`
- Modify: `shared/markdown/editor-commands.js`
- Modify: `shared/markdown/index.js`
- Modify: `shared/markdown/index.d.ts`

**Interfaces:**

- `replaceEditorSelection(blocks, selection, pastedMarkdown): { blocks: Block[]; nextSelection: EditorSelection }`
- `splitBlockAtSelection(blocks, selection): { blocks: Block[]; nextSelection: EditorSelection }`
- `deleteBackwardAtSelection(blocks, selection): { blocks: Block[]; nextSelection: EditorSelection; changed: boolean }`
- `deleteForwardAtSelection(blocks, selection): { blocks: Block[]; nextSelection: EditorSelection; changed: boolean }`
- `ensureParagraphAfterBlock(blocks, path): { blocks: Block[]; nextPath: TaskPath }`
- `removeTableBeforeParagraph(blocks, path): { blocks: Block[]; nextPath: TaskPath }`

- [ ] **Step 1: Write failing tests for top-level and nested selection transactions.**

  Cover replacing a paragraph selection with text, replacing a selection with multiline Markdown blocks, splitting a heading or paragraph at a logical offset, Backspace merging adjacent paragraphs, Delete merging the following paragraph, and preserving quote/list/table boundaries. Assert the original AST is not mutated and the returned selection points to the expected block path and offset.

- [ ] **Step 2: Run the shared command tests to verify the new assertions fail.**

  Run:

  ```powershell
  node --test shared/markdown/editor-commands.test.mjs
  ```

  Expected: the new transaction imports or assertions fail because the one-root selection API does not yet exist.

- [ ] **Step 3: Implement the minimal immutable transaction helpers.**

  Reuse `cloneBlocks`, canonical block paths, existing inline split/merge utilities, and the existing table-following paragraph rules. A transaction must return both the next AST and a logical selection; it must never mutate the input AST. Return `changed: false` when Backspace/Delete cannot cross a valid block boundary.

- [ ] **Step 4: Run the shared command tests again.**

  Run the same Node test command and expect all new and existing tests to pass.

- [ ] **Step 5: Commit the shared transaction contract.**

  ```powershell
  git add shared/markdown/editor-commands.js shared/markdown/editor-commands.test.mjs shared/markdown/index.js shared/markdown/index.d.ts
  git commit -m "feat: add single-surface editor transactions"
  ```

## Task 2: Build the Web DOM adapter ✅ Complete (`523bad3`)

**Files:**

- Create: `web/lib/markdown-dom.ts`
- Create: `web/lib/markdown-dom.test.mjs`
- Modify: `web/lib/markdown-editor.ts`

**Interfaces:**

- `type EditorPoint = { path: number[]; offset: number }`
- `type EditorSelection = { anchor: EditorPoint; focus: EditorPoint }`
- `renderEditableBlocks(root: HTMLElement, blocks: Block[]): void`
- `readEditableBlocks(root: HTMLElement, fallback: Block[]): Block[]`
- `readEditorSelection(root: HTMLElement): EditorSelection | null`
- `restoreEditorSelection(root: HTMLElement, selection: EditorSelection): void`
- `blockPathForNode(node: Node): number[] | null`
- `inlineValueFromDom(node: Node): Inline[]`

- [ ] **Step 1: Write failing adapter tests for semantic block markup.**

  Use fixtures for paragraph, heading, marked inline text, unordered/ordered/task lists, quote, code block, horizontal rule, and table. Assert the rendered root has one editable root contract, stable `data-block-path` values, semantic tags, and non-editable task checkboxes. Assert `readEditableBlocks(renderEditableBlocks(blocks))` round-trips the supported AST.

- [ ] **Step 2: Add a minimal DOM fixture for adapter tests without adding a third-party editor dependency.**

  Keep the fixture limited to the DOM methods used by the adapter (`createElement`, `append`, `querySelector`, `closest`, `textContent`, `dataset`, `contentEditable`, and `Range` selection helpers). Do not mock the AST or assert only implementation details.

- [ ] **Step 3: Implement semantic rendering and DOM-to-AST conversion.**

  Render inline marks as `strong`, `em`, `code`, and safe links. Render task checkboxes as `contentEditable=false` controls with canonical task paths. Read only supported block tags; convert unknown block content to a paragraph instead of silently dropping it. Keep table cells single-line when serializing back to Markdown.

- [ ] **Step 4: Implement logical selection mapping and restoration.**

  Convert a browser `Range` to `{ path, offset }` by counting text nodes inside the nearest block. Restore a selection by walking text nodes under the target block. If a path no longer exists after a transaction, fall back to the nearest surviving paragraph.

- [ ] **Step 5: Run Web adapter tests and the existing pure editor tests.**

  ```powershell
  node --test web/lib/markdown-dom.test.mjs web/lib/markdown-editor.test.mjs shared/markdown/editor-commands.test.mjs
  ```

- [ ] **Step 6: Commit the Web DOM adapter.**

  ```powershell
  git add web/lib/markdown-dom.ts web/lib/markdown-dom.test.mjs web/lib/markdown-editor.ts
  git commit -m "feat: add web single-surface dom adapter"
  ```

## Task 3: Rewrite the Web editor around one root ✅ Complete (`10d9f73`)

**Files:**

- Rewrite: `web/components/MarkdownBlockEditor.tsx`
- Modify: `web/lib/markdown.ts`
- Modify: `web/lib/markdown-editor.test.mjs`

**Interfaces:**

- Keep `MarkdownBlockEditorProps` unchanged.
- Keep `MarkdownEditorHandle.focus`, `insertText`, `getValue`, and `getSelectionContext` unchanged.
- Root event handlers consume `EditorSelection` and shared transaction helpers; they must not query or focus an individual `contentEditable` block because blocks are no longer independent editors.

- [ ] **Step 1: Write failing integration-contract tests.**

  Add assertions that the rendered Web editor has one `contentEditable` root, no descendant `[contenteditable="true"]` surfaces for paragraphs/list items/table cells, and exposes the existing toolbar/source mode hooks. Add behavior fixtures for `Ctrl/Cmd+A`, whole-editor replacement, multiline paste, table continuation, task checkbox delegation, and external value synchronization.

- [ ] **Step 2: Replace per-surface rendering with one root render.**

  Keep the toolbar outside the editable root. Mount an empty root once, render block DOM through `markdown-dom.ts`, and update its contents only when external value changes or a structural transaction requires it. Do not use React-controlled children inside the editable root on every keystroke.

- [ ] **Step 3: Delegate input and selection events from the root.**

  Handle `beforeinput`, `input`, `keydown`, `paste`, `compositionstart`, `compositionend`, `click`, and `change` on the root. Route ordinary text input through DOM-to-AST conversion; route structural keyboard actions through shared transactions; capture and restore logical selection after every structural render.

- [ ] **Step 4: Implement normal editor keyboard behavior.**

  Support native whole-editor selection, Enter block splitting, Backspace/Delete block merging, Markdown shortcut conversion, Tab list indentation, multiline paste, and table-cell Enter exit. Do not add custom arrow-key focus hopping; the single root must let the browser handle arrow navigation naturally.

- [ ] **Step 5: Preserve toolbar, task, table, source, and imperative APIs.**

  Toolbar commands operate on the current logical selection. Task checkbox clicks update only the selected task path. The table command inserts a following paragraph. Source mode continues to use the textarea. `insertText` replaces the current logical selection and restores the caret.

- [ ] **Step 6: Run Web integration tests and TypeScript checks.**

  ```powershell
  node --test web/lib/markdown-dom.test.mjs web/lib/markdown-editor.test.mjs extension/test/web-markdown-editor-contract.test.mjs
  npm run typecheck
  ```

- [ ] **Step 7: Commit the Web root editor.**

  ```powershell
  git add web/components/MarkdownBlockEditor.tsx web/lib/markdown.ts web/lib/markdown-editor.test.mjs
  git commit -m "feat: rebuild web markdown editor as one surface"
  ```

## Task 4: Build the Extension-local DOM adapter ✅ Complete (`5f76d7c`)

**Files:**

- Create: `extension/src/lib/markdown-dom.js`
- Create: `extension/src/lib/markdown-dom.test.js`

**Interfaces:**

- Mirror the Web adapter's `EditorPoint`, `EditorSelection`, render, read, path, and selection restoration behavior using Extension-local JavaScript exports.
- Keep the DOM attributes and semantic tags byte-for-byte compatible where the two adapters overlap.

- [ ] **Step 1: Write failing Extension adapter contract tests.**

  Cover the same AST fixtures as the Web adapter, including task checkbox paths, table header/body cell paths, nested quote/list paths, and round-trip text/inline marks.

- [ ] **Step 2: Implement the Extension-local adapter.**

  Keep it self-contained under `extension/src/lib/`; do not import `shared/` at runtime. Reuse the Extension's local parser/serializer and the shared transaction semantics already mirrored in that package.

- [ ] **Step 3: Run Extension adapter tests.**

  ```powershell
  node --test extension/src/lib/markdown-dom.test.js extension/src/lib/markdown-editor.test.js
  ```

- [ ] **Step 4: Commit the Extension DOM adapter.**

  ```powershell
  git add extension/src/lib/markdown-dom.js extension/src/lib/markdown-dom.test.js
  git commit -m "feat: add extension single-surface dom adapter"
  ```

## Task 5: Rewrite the Extension editor and migrate integrations ✅ Complete (`8fbb3b3`)

**Files:**

- Rewrite: `extension/src/lib/markdown-editor.js`
- Modify: `extension/src/lib/markdown-editor.test.js`
- Modify: `extension/test/web-markdown-editor-contract.test.mjs`
- Modify: `extension/test/options-layout.test.mjs`
- Modify: `extension/src/options/options.js` only where the root editor bridge or preview integration requires it.

**Interfaces:**

- Keep `mountMarkdownEditor(textarea, { mode, onChange })` and its returned `destroy`, `focus`, and `sync` behavior.
- Keep the textarea as the emitted Markdown source and preserve existing Options page form behavior.

- [ ] **Step 1: Write failing Extension integration tests.**

  Assert one editable root, textarea synchronization after ordinary input and structural commands, whole-editor selection replacement, native cross-block selection contract, table continuation/deletion, task checkbox toggling, source mode, and destroy/restore behavior.

- [ ] **Step 2: Replace the current per-surface mount implementation.**

  Mount one root beside the textarea, render through `markdown-dom.js`, and delegate all events from the root. Remove independent block/table-cell `contentEditable` attributes, custom direction-key focus hopping, and the old active-surface selection model.

- [ ] **Step 3: Preserve the textarea bridge and external synchronization.**

  Emit serialized Markdown through the existing input event path, avoid feedback loops with the `emitting` guard, handle external textarea changes by reparsing and rendering, and restore the original textarea on `destroy()`.

- [ ] **Step 4: Run Extension contract and Options tests.**

  ```powershell
  node --test extension/src/lib/markdown-dom.test.js extension/src/lib/markdown-editor.test.js extension/test/*.test.mjs
  ```

- [ ] **Step 5: Commit the Extension root editor migration.**

  ```powershell
  git add extension/src/lib/markdown-editor.js extension/src/lib/markdown-editor.test.js extension/test/web-markdown-editor-contract.test.mjs extension/test/options-layout.test.mjs extension/src/options/options.js
  git commit -m "feat: rebuild extension markdown editor as one surface"
  ```

## Task 6: Remove obsolete per-surface behavior and reconcile current worktree changes ✅ Complete (`d1627e4`)

**Files:**

- Modify: `web/components/MarkdownBlockEditor.tsx`
- Modify: `web/lib/markdown-editor.ts`
- Modify: `extension/src/lib/markdown-editor.js`
- Modify: `shared/markdown/editor-commands.js`
- Modify: affected tests from Tasks 1–5

- [ ] **Step 1: Search for obsolete independent-surface behavior.**

  ```powershell
  rg -n "data-editor-surface|contentEditable|navigateSurface|editorSurfaceNavigationTarget|activeTargetRef|activeSurface" web/components web/lib extension/src/lib
  ```

  Keep only the single-root `contentEditable` and adapter selection utilities. Remove the previously added per-surface arrow-navigation and whole-selection patches if they are no longer used by the root implementation.

- [ ] **Step 2: Reconcile the existing uncommitted table/navigation changes.**

  Retain table-following paragraph and table deletion behavior through the new shared transactions. Remove duplicate code paths rather than leaving both the old per-surface and new root implementations active.

- [ ] **Step 3: Run focused editor tests and inspect the diff.**

  ```powershell
  node --test shared/markdown/editor-commands.test.mjs web/lib/markdown-dom.test.mjs web/lib/markdown-editor.test.mjs extension/src/lib/markdown-dom.test.js extension/src/lib/markdown-editor.test.js
  git diff --check
  ```

- [ ] **Step 4: Commit the cleanup.**

  ```powershell
  git add shared/markdown web/lib/markdown-editor.ts web/lib/markdown-dom.ts web/components/MarkdownBlockEditor.tsx extension/src/lib/markdown-editor.js extension/src/lib/markdown-dom.js
  git commit -m "refactor: remove per-surface markdown editor behavior"
  ```

## Task 7: Full verification and manual editor QA ✅ Complete (verification run 2026-08-26)

**Files:**

- Modify: `docs/superpowers/plans/2026-08-25-single-surface-markdown-editor.md` with completed steps and command output summary.

- [ ] **Step 1: Run the full Node test suite.**

  ```powershell
  node --test shared/markdown/*.test.mjs extension/src/lib/*.test.js extension/test/*.test.mjs web/lib/markdown-editor.test.mjs
  ```

  Expected: zero failures, including the shared, Web, Extension, Options, timer, report, and project contract tests.

- [ ] **Step 2: Run Web TypeScript validation.**

  ```powershell
  cd web
  npm run typecheck
  ```

- [ ] **Step 3: Run the production Web build with the repository's installed dependencies.**

  ```powershell
  npm run build
  ```

- [ ] **Step 4: Manually verify the editor in Web and Extension.**

  Verify all of the following in a browser:

  - drag-select text across two paragraphs and replace it;
  - press `Ctrl/Cmd+A`, type, paste, Backspace, and Delete;
  - use arrow keys across paragraphs, headings, list items, quotes, code, and table cells;
  - type `# `, `- `, `- [ ] `, `> `, and ````` `` at block starts;
  - insert a table, edit header/body cells, press Enter in a cell, continue below it, and remove it with Backspace;
  - click a task checkbox without losing the editor value;
  - switch to Source mode and confirm the Markdown textarea remains synchronized;
  - verify timer notes, project notes, entry notes, shared notes, and dynamic Extension notes.

- [ ] **Step 5: Run final cleanliness checks.**

  ```powershell
  git diff --check
  git status --short
  ```

  Expected: no whitespace errors and no untracked build/dependency artifacts.

- [ ] **Step 6: Commit verification notes if needed.**

  ```powershell
  git add docs/superpowers/plans/2026-08-25-single-surface-markdown-editor.md
  git commit -m "docs: record single-surface editor verification"
```

### Verification record

- Full Node suite: 160 tests passed, 0 failed.
- `web/npm run typecheck`: passed.
- `web/npm run build`: passed with Next.js 16 production output.
- `git diff --check`: clean.
- The editor now uses one delegated root per editor; task checkbox and task text render in the same list-item row. Web and Extension adapters share the same unknown-list-descendant behavior.
- Browser-only manual QA is represented by the DOM/editor contract tests; no persistent dev server or browser state was changed during verification.
