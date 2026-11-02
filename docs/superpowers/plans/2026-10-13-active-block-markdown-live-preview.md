# Active-Block Markdown Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian-style Markdown editor where only the active logical block shows source, inactive blocks show previews, formatting commands toggle, horizontal rules behave predictably, and fenced code supports literal multiline editing in both Web and Extension.

**Architecture:** Add a shared pure live-preview domain module for active-block serialization, source replacement, command toggling, and toolbar state. Keep an Extension-local runtime mirror with parity fixtures because the unpacked MV3 package cannot import outside `extension/`; replace the current contenteditable adapters with preview containers plus one active textarea while preserving existing value and textarea bridges.

**Tech Stack:** JavaScript ES modules, TypeScript 5.7, React 19, Next.js 16, Chrome Manifest V3, Node built-in test runner, existing Markdown AST/parser/serializer/renderer.

**Spec:** `docs/superpowers/specs/2026-10-13-active-block-markdown-live-preview-design.md`

## Global Constraints

- Markdown strings remain the only persisted and exported format; no database migration.
- Only one logical block is editable in live preview; source mode remains the cross-block editor.
- Web and Extension must produce identical Markdown for shared fixtures.
- Do not add CodeMirror, ProseMirror, or another editor dependency.
- Do not parse or rerender structural Markdown during IME composition.
- Every accepted active-source input must emit the complete Markdown document without waiting for blur.
- Invalid intermediate active source must remain saved and visible without replacing the last valid preview AST branch.
- Existing source mode, form submission, timer auto-save, task checkbox behavior, and Extension textarea bridge remain compatible.
- Use two-space indentation, semicolons, and single quotes.
- Do not create commits unless the user explicitly requests them.

## Review Focus

- Active source containing blank lines or incomplete fences must remain saved and editable instead of disappearing or splitting unexpectedly; Task 1 tests this composition path.
- Nested list and task item edits must preserve parent markers, sibling order, indentation, child blocks, and checked states; Tasks 1 and 2 run shared parity fixtures for these structures.
- Clicking toolbar controls while a textarea selection exists must preserve the exact selection and active path; Tasks 3 and 4 test mouse-down capture and restored selection.
- External value updates arriving during local editing must distinguish the last emitted local value from a genuinely new remote value; Tasks 3 and 4 test both branches.
- Enter and IME events inside fenced code must preserve literal newlines and never trigger empty-paragraph submit or block switching; Tasks 3 and 4 own these tests.

---

### Task 1: Shared Active-Block Domain Contract

**Files:**
- Create: `shared/markdown/live-preview.js`
- Create: `shared/markdown/live-preview.test.mjs`
- Create: `shared/markdown/live-preview-fixtures.js`
- Modify: `shared/markdown/index.js`
- Modify: `shared/markdown/index.d.ts`

**Interfaces:**
- Consumes: existing `Block`, `Inline`, canonical numeric paths, `parseMarkdown()`, `serializeMarkdown()`, and immutable clone/path helpers from `shared/markdown/`.
- Produces: `readActiveBlockSource(blocks, path)`, `replaceActiveBlockSource(blocks, path, source)`, `serializeWithActiveBlockSource(blocks, path, source)`, `toggleInlineSource(source, start, end, command, url?)`, `toggleBlockSource(source, command)`, `activeToolbarState(source, start, end)`, and shared literal parity fixtures.
- `replaceActiveBlockSource()` returns `{ blocks, valid, nextPath }`; invalid input returns the original AST, `valid: false`, and the unchanged path.
- `serializeWithActiveBlockSource()` always returns the complete document Markdown and injects raw active source even when that source is temporarily invalid.
- A top-level paragraph, heading, quote, code block, table, or rule source may replace its active block with one or more parsed top-level blocks; `nextPath` targets the final replacement block.
- A list or task item source may replace that item with one or more sibling items only when every parsed item has the same list kind at the same nesting level. Unrelated block shapes return `valid: false` and remain raw active source.

- [ ] **Step 1: Write failing active-block extraction and composition tests**

Add tests named:

- `reads paragraph, heading, task item, quote, fenced code, table, and rule source by canonical path`
- `serializes the full document with invalid active source without changing the valid AST`
- `replaces one nested task source without changing its parent, siblings, children, or checked states`
- `accepts multiple same-kind task items but rejects unrelated blocks inside one active task item`
- `keeps blank lines and incomplete fences in active raw source`

Use hand-written Markdown fixtures and assert exact source strings, `valid`, `nextPath`, and complete serialized documents.

- [ ] **Step 2: Run shared tests and verify RED**

Run: `node --test shared/markdown/live-preview.test.mjs`

Expected: FAIL because `live-preview.js` and the exported functions do not exist.

- [ ] **Step 3: Implement active-block source helpers**

Implement these exact signatures in `shared/markdown/live-preview.js`:

```js
export function readActiveBlockSource(blocks, path)
export function replaceActiveBlockSource(blocks, path, source)
export function serializeWithActiveBlockSource(blocks, path, source)
```

Resolve paragraphs, headings, individual list/task items, whole quotes, whole code blocks, whole tables, and horizontal rules. Preserve canonical nesting and indentation when raw source is inserted into the complete document.

- [ ] **Step 4: Run active-block tests and verify GREEN**

Run: `node --test shared/markdown/live-preview.test.mjs`

Expected: all active-block extraction, replacement, invalid-source, nested-list, and multiline-fence tests PASS.

- [ ] **Step 5: Write failing formatting-toggle tests**

Add tests named:

- `toggles bold italic and inline code on and off over a full selection`
- `marks a mixed selection instead of partially removing formatting`
- `inserts and selects placeholders for collapsed inline commands`
- `removes one existing safe link while preserving its label`
- `toggles heading list task quote code block and horizontal rule back to paragraphs`
- `keeps table as insertion-only and reports toolbar active state`

Assert exact Markdown, `selectionStart`, `selectionEnd`, and `aria-pressed`-ready state booleans.

- [ ] **Step 6: Run formatting tests and verify RED**

Run: `node --test shared/markdown/live-preview.test.mjs`

Expected: FAIL because the formatting functions are missing.

- [ ] **Step 7: Implement formatting-toggle helpers and public types**

Implement:

```js
export function toggleInlineSource(source, start, end, command, url = 'https://example.com')
export function toggleBlockSource(source, command)
export function activeToolbarState(source, start, end)
```

Export the functions from `shared/markdown/index.js`. Add `ActiveBlockReplacement`, `InlineSourceCommand`, `BlockSourceCommand`, `ToolbarState`, and function declarations to `shared/markdown/index.d.ts`.

- [ ] **Step 8: Run all shared Markdown tests**

Run: `node --test shared/markdown/*.test.mjs`

Expected: all shared Markdown tests PASS with zero failures.

### Task 2: Extension Runtime Mirror and Parity Contract

**Files:**
- Create: `extension/src/lib/markdown-live-preview.js`
- Create: `extension/src/lib/markdown-live-preview.test.js`
- Modify: `extension/test/web-markdown-editor-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 function signatures and `shared/markdown/live-preview-fixtures.js`.
- Produces: the same six live-preview exports from an Extension-local ES module that imports only files under `extension/`.
- Later Extension adapter work imports only `extension/src/lib/markdown-live-preview.js`; Web imports the shared module.

- [ ] **Step 1: Write the failing Extension fixture contract**

Import shared literal fixtures into `extension/src/lib/markdown-live-preview.test.js` and run every fixture against the Extension-local API. Add a contract test that compares shared and Extension output for active source extraction, invalid raw composition, nested task replacement, inline toggles, block toggles, horizontal rules, and multiline code.

- [ ] **Step 2: Run the parity test and verify RED**

Run: `node --test extension/src/lib/markdown-live-preview.test.js extension/test/web-markdown-editor-contract.test.mjs`

Expected: FAIL because the Extension-local module does not exist.

- [ ] **Step 3: Implement the Extension-local mirror**

Implement the same signatures as Task 1 in `extension/src/lib/markdown-live-preview.js`, using `extension/src/lib/markdown.js` for local AST parsing and serialization. Keep command names, return shapes, normalization, and safe URL behavior byte-for-byte compatible at the public boundary.

- [ ] **Step 4: Run parity and local Markdown tests**

Run: `node --test extension/src/lib/markdown-live-preview.test.js extension/src/lib/markdown.test.js extension/test/web-markdown-editor-contract.test.mjs`

Expected: all tests PASS and every parity fixture has identical output.

### Task 3: Extension Active-Block Adapter

**Files:**
- Modify: `extension/src/lib/markdown-editor.js:839-1170`
- Modify: `extension/src/lib/markdown-editor.test.js:510-940`
- Modify: `extension/src/lib/markdown-dom.js:4-210`
- Modify: `extension/src/lib/markdown-dom.test.js`
- Modify: `extension/src/options/options.css:97-163`

**Interfaces:**
- Consumes: Extension-local Task 2 functions and existing `mountMarkdownEditor(textarea, options)` public API.
- Produces: toolbar mode with a preview root, at most one `.markdown-editor-active-source` textarea, delegated task checkboxes, active `aria-pressed` toolbar buttons, and unchanged `destroy()`, `focus()`, `sync()`, `insertText()`, `getValue()`, and `getSelectionContext()` methods.

- [ ] **Step 1: Write failing Extension adapter tests**

Add fixture tests named:

- `activates one Markdown source textarea when a preview block is clicked`
- `commits the previous block before activating the next preview`
- `clicking outside commits source and leaves only previews`
- `bold toolbar mouse-down preserves selection and toggles bold off on the second click`
- `horizontal rule previews as hr, activates as three hyphens, and toggles to an empty paragraph`
- `Enter inside fenced code inserts a literal newline without submitting or creating a paragraph`
- `IME composition postpones parsing and preserves the textarea selection`
- `preview task checkbox changes Markdown without activating source`
- `matching external values preserve active source while new external values safely reconcile it`

Assert the public textarea value after every transaction, not private adapter flags.

- [ ] **Step 2: Run Extension editor tests and verify RED**

Run: `node --test extension/src/lib/markdown-editor.test.js extension/src/lib/markdown-dom.test.js`

Expected: FAIL because toolbar mode still mounts one contenteditable root and no active source textarea.

- [ ] **Step 3: Add preview block rendering contract**

Extend `markdown-dom.js` with preview rendering that keeps `data-block-path`, semantic tags, safe links, and interactive checkbox metadata but does not set the preview root `contentEditable`. Preserve existing renderer functions until the adapter migration tests no longer use them.

- [ ] **Step 4: Implement Extension active-block state and events**

Inside `mountMarkdownEditor()` toolbar mode, track:

```js
let activePath = null;
let activeSource = '';
let activeSelection = { start: 0, end: 0 };
let composing = false;
let lastEmittedValue = textarea.value;
```

Delegate preview activation, outside blur, toolbar mouse-down/click, checkbox changes, source input, keyboard shortcuts, and IME events. Emit `serializeWithActiveBlockSource()` on each input and parse into the valid AST only when `replaceActiveBlockSource().valid` is true.

- [ ] **Step 5: Add Extension live-preview styles**

Update `options.css` so the active textarea occupies the replaced block's width, uses inherited typography and block spacing, visibly indicates focus, preserves code whitespace, and gives toolbar `[aria-pressed="true"]` an active state. Ensure inactive `<hr>` spans the content width and is easy to click without displaying hyphen text.

- [ ] **Step 6: Run Extension adapter tests and verify GREEN**

Run: `node --test extension/src/lib/markdown-editor.test.js extension/src/lib/markdown-dom.test.js extension/src/lib/markdown-live-preview.test.js`

Expected: all adapter, DOM, parity, code-block, rule, checkbox, selection, sync, and IME tests PASS.

- [ ] **Step 7: Run the full Extension suite**

Run: `node --test extension/src/lib/*.test.js extension/test/*.test.mjs`

Expected: zero failures; report any unrelated pre-existing failure by exact test name without changing unrelated code.

### Task 4: Web Active-Block Adapter

**Files:**
- Modify: `web/components/MarkdownBlockEditor.tsx:334-730`
- Modify: `web/lib/markdown-editor.ts:1-110`
- Modify: `web/lib/markdown-editor.test.mjs:115-330`
- Modify: `web/lib/markdown-dom.ts:1-350`
- Modify: `web/lib/markdown-dom.test.mjs:171-340`
- Modify: `web/app/globals.css:74-110`
- Modify: `extension/test/web-markdown-editor-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 shared live-preview functions and the existing controlled `value`, `onChange`, `mode`, ref, and source-mode props.
- Produces: the same user-visible event and command contract as Task 3, while retaining the existing `MarkdownEditorHandle` API.

- [ ] **Step 1: Write failing Web behavior and contract tests**

Add pure and DOM adapter tests for active block source mapping, selection-preserving toolbar toggles, horizontal rule activation/toggle, literal multiline fenced code, IME deferral, task preview interaction, and controlled-value reconciliation. Extend the cross-interface contract to require the same command names, active source class, `data-block-path`, and `aria-pressed` behavior in Web and Extension.

- [ ] **Step 2: Run Web Markdown tests and verify RED**

Run: `node --test web/lib/markdown-editor.test.mjs web/lib/markdown-dom.test.mjs extension/test/web-markdown-editor-contract.test.mjs`

Expected: FAIL because `MarkdownBlockEditor` still uses the continuous contenteditable adapter.

- [ ] **Step 3: Add Web preview rendering helpers**

Update `web/lib/markdown-dom.ts` with typed preview-block rendering equivalent to Task 3. Keep canonical paths, safe URLs, semantic block tags, and interactive task metadata aligned with Extension.

- [ ] **Step 4: Replace Web contenteditable state with active-block state**

In `MarkdownBlockEditor.tsx`, use refs/state for `activePath`, `activeSource`, selection, composition, and last emitted value. Render inactive blocks through the preview adapter and replace only the active block with a controlled textarea. Preserve source mode and the existing imperative handle.

- [ ] **Step 5: Route toolbar and keyboard commands through shared toggles**

Use Task 1 helpers for toolbar mouse-down selection capture, inline toggles, block toggles, horizontal rule behavior, toolbar active state, code Enter handling, and full-document emission. Ensure Link prompts only for applying a link and removes an existing link without prompting.

- [ ] **Step 6: Add Web live-preview styles**

Update `globals.css` to match Extension layout, active textarea behavior, code whitespace, clickable horizontal rules, focus indication, and `[aria-pressed="true"]` toolbar state without changing unrelated global controls.

- [ ] **Step 7: Run Web Markdown tests and typecheck**

Run: `node --test web/lib/markdown*.test.mjs extension/test/web-markdown-editor-contract.test.mjs`

Expected: all Web Markdown and cross-interface tests PASS.

Run: `npm run typecheck` from `web/`

Expected: TypeScript exits 0 with no errors.

### Task 5: Documentation, Build, and End-to-End Verification

**Files:**
- Modify: `extension/README.md`
- Modify: `web/README.md`
- Modify if contract coverage requires it: `extension/test/options-layout.test.mjs`

**Interfaces:**
- Consumes: completed Task 1-4 behavior.
- Produces: documented live-preview workflow and final verification evidence for the whole repository scope.

- [ ] **Step 1: Update editor documentation**

Document that toolbar mode shows Markdown only for the active block, source mode handles cross-block edits, formatting buttons toggle, horizontal rules activate as `---`, and fenced code accepts literal multiline input. Keep Extension and Web descriptions consistent.

- [ ] **Step 2: Run all automated tests**

Run from the repository root:

```powershell
node --test shared/markdown/*.test.mjs web/lib/markdown*.test.mjs extension/src/lib/*.test.js extension/test/*.test.mjs
```

Expected: zero test failures.

- [ ] **Step 3: Run Web typecheck and production build**

Run from `web/`:

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit 0; the build completes without TypeScript or Next.js errors.

- [ ] **Step 4: Run diff and scope checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only planned files plus pre-existing user changes are present.

- [ ] **Step 5: Manually verify Chrome behavior**

Reload the unpacked `extension/` and verify timer notes, Todo notes, project notes, schedule notes, and entry notes:

- only one active block shows source;
- bold toggles off on the second command;
- horizontal rule switches between `<hr>`, `---`, and an empty paragraph;
- fenced code preserves multiple Enter-created lines;
- task preview checkboxes remain interactive;
- Chinese IME composition keeps text and selection;
- source mode edits multiple blocks;
- timer notes continue auto-saving.

- [ ] **Step 6: Manually verify Web behavior**

Run `npm run dev` from `web/`, open every Markdown field, and repeat the same active-block, toggle, rule, code, checkbox, IME, source-mode, and persistence checks. Confirm equivalent input produces equivalent stored Markdown in Web and Extension.
