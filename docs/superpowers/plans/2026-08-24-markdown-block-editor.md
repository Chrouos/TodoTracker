# Markdown Block Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 TodoTracker 的 Markdown 欄位升級為跨 Web／Extension 一致的 Notion 式 block editor，支援現有 Markdown 功能、自動 shortcuts 與可點擊 Todo checkbox。

**Architecture:** 建立不依賴框架的 `shared/markdown/` core，負責 AST、parse、serialize、render 與純編輯命令。Web 用 React wrapper，Extension 用原生 DOM adapter；兩者都以既有 `notes` Markdown 字串作為唯一保存格式。

**Tech Stack:** Node built-in test runner、原生 JavaScript、React 19／Next.js 16、TypeScript 5.7、Chrome MV3 DOM APIs；不新增第三方 editor dependency。

**Spec:** `docs/superpowers/specs/2026-08-24-markdown-block-editor-design.md`

## Global Constraints

- Markdown 是唯一儲存格式；Block AST 只存在於編輯器執行期間。
- 筆記內的 Todo checkbox 不會改變外層 Todo entity 的 `status`。
- Web 與 Extension 必須共用 parser、serializer、renderer 與 editor command fixtures。
- 不改變資料庫欄位，不新增 migration，不改變既有保存時機。
- Extension 維持無 build step；Web 的 TypeScript 透過 `shared/markdown/index.d.ts` 取得型別。
- 所有輸出文字與 table cell 必須 escape；連結只允許 `https://`。
- 每個 task 先寫 failing test，再實作，再執行該 task 的 focused test，最後建立獨立 Conventional Commit。

---

## File Map

### Shared core

- Create: `shared/markdown/ast.js` — AST 建構與 clone／path helper。
- Create: `shared/markdown/parser.js` — Markdown 字串轉 Block AST。
- Create: `shared/markdown/serializer.js` — Block AST 轉 Markdown。
- Create: `shared/markdown/renderer.js` — AST／Markdown 轉安全 HTML，支援 interactive task metadata。
- Create: `shared/markdown/editor-commands.js` — shortcut、Enter、階層與 checkbox 的純函式操作。
- Create: `shared/markdown/index.js` — 對外 export。
- Create: `shared/markdown/index.d.ts` — Web 使用的 AST 與 API 型別。
- Create: `shared/markdown/*.test.mjs` — parser、serializer、renderer、commands 測試。

### Web

- Modify: `web/lib/markdown.ts` — 改為 shared renderer 的型別安全 wrapper。
- Modify: `web/lib/markdown.test.ts` — 對齊 shared fixtures 與 task list 測試。
- Create: `web/components/MarkdownBlockEditor.tsx` — React block editor、toolbar、source mode adapter。
- Modify: `web/components/MarkdownPreview.tsx` — 使用 shared renderer，編輯器模式支援 task toggle callback。
- Modify: `web/components/ProjectNotes.tsx` — 專案筆記欄位改用 block editor。
- Modify: `web/components/EntryDialog.tsx` — 時間紀錄 notes 改用 block editor。
- Modify: `web/components/TimerPanel.tsx` — 計時 notes 改用 block editor，保留 stamp 與 autosave。
- Modify: `web/app/todos/page.tsx` — Todo notes 改用 block editor。
- Modify: `web/app/schedules/page.tsx` — 排程 notes 改用 block editor。
- Modify: `web/app/log/page.tsx` — 編輯中的 log notes 改用 block editor。
- Modify: `web/app/globals.css` — block、toolbar、task list、focus 與 responsive styles。
- Create: `extension/test/web-markdown-editor-contract.test.mjs` — Web Markdown 欄位的 source contract test。

### Extension

- Modify: `extension/src/lib/markdown.js` — 保留 preview collapse helper，renderer 改用 shared core。
- Modify: `extension/src/lib/markdown.test.js` — 改用 shared renderer 行為與 task list fixtures。
- Modify: `extension/src/lib/markdown-editor.js` — 保留 `formatMarkdownSelection` 相容 API，新增 DOM mount／source mode／block editor command wiring。
- Modify: `extension/src/lib/markdown-editor.test.js` — 新增 shortcut、task toggle、IME guard 的純函式測試。
- Modify: `extension/src/options/options.js` — 初始化 shared editor、移除 textarea-only toolbar path、串接 interactive task callback。
- Modify: `extension/src/options/options.css` — block editor styles、source mode、task checkbox 與 keyboard focus。
- Modify: `extension/test/options-layout.test.mjs` — 更新 editor mount 與 Todo toolbar contract。

---

### Task 1: 建立 shared Markdown AST 與型別契約

**Files:**
- Create: `shared/markdown/ast.js`
- Create: `shared/markdown/index.d.ts`
- Create: `shared/markdown/ast.test.mjs`

**Interfaces:**
- Produces `Block`, `Inline`, `ListItem`, `TaskItem` 的 JSDoc／declaration shape。
- Produces `cloneBlocks(blocks)`、`pathToItem(blocks, path)`、`updateAtPath(blocks, path, updater)`。
- Path 使用 `number[]`：第一個數字是 block index，後續數字是巢狀 item index。

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneBlocks, updateAtPath } from './ast.js';

test('updates a nested task item without mutating the original tree', () => {
  const source = [{
    type: 'taskList',
    items: [{ checked: false, inlines: [{ type: 'text', value: 'Parent' }], children: [
      { type: 'taskList', items: [{ checked: false, inlines: [{ type: 'text', value: 'Child' }], children: [] }] },
    ] }],
  }];
  const next = updateAtPath(source, [0, 0, 0], (item) => ({ ...item, checked: true }));
  assert.equal(next[0].items[0].children[0].items[0].checked, true);
  assert.equal(source[0].items[0].children[0].items[0].checked, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/markdown/ast.test.mjs`

Expected: FAIL because `ast.js` and `updateAtPath` do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement immutable recursive cloning and path traversal. Keep AST objects plain serializable objects; do not add DOM references, React state, or database IDs.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/markdown/ast.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add declarations and commit**

Declare `Inline`, `Block`, `ListItem`, `TaskItem`, `MarkdownEditorMode`, and the AST helper signatures in `shared/markdown/index.d.ts`. Commit with:

```bash
git add shared/markdown/ast.js shared/markdown/ast.test.mjs shared/markdown/index.d.ts
git commit -m "feat: define shared markdown block model"
```

### Task 2: 實作 Markdown parser／serializer／renderer

**Files:**
- Create: `shared/markdown/parser.js`
- Create: `shared/markdown/serializer.js`
- Create: `shared/markdown/renderer.js`
- Create: `shared/markdown/index.js`
- Create: `shared/markdown/markdown-core.test.mjs`

**Interfaces:**
- `parseMarkdown(markdown: string): Block[]`
- `serializeMarkdown(blocks: Block[]): string`
- `renderMarkdown(markdown: string, options?: { interactiveTasks?: boolean }): string`
- `renderBlocks(blocks: Block[], options?: { interactiveTasks?: boolean }): string`
- `shared/markdown/index.js` re-exports all public functions.

- [ ] **Step 1: Write the failing fixtures**

Cover one fixture for each supported structure:

```js
const source = [
  '# Title', '',
  '**bold** *italic* `code` [link](https://example.com)', '',
  '- [ ] Open',
  '  - [x] Nested done',
  '',
  '> Quote', '',
  '```js', 'const value = <tag>;', '```', '',
  '| A | B |', '| --- | ---: |', '| x | 2 |', '',
  '---',
].join('\n');
```

Assert the AST block types, checked states, table alignments, semantic serialization, and escaped renderer output. Assert `interactiveTasks: true` emits a `data-markdown-task-path` attribute while the default renderer emits disabled checkboxes.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/markdown/markdown-core.test.mjs`

Expected: FAIL because the shared parser／serializer／renderer exports do not exist.

- [ ] **Step 3: Implement parser and serializer**

Normalize CRLF to LF. Parse headings, paragraphs, fenced code, horizontal rules, blockquotes, tables, ordered／unordered lists, nested task items, and inline marks. Serialize with stable formatting: blank lines between top-level blocks, two-space indentation for nested list items, `[ ]`／`[x]` task markers, and preserved code fence language.

- [ ] **Step 4: Implement safe renderer**

Reuse one escaping function for text, code, table cells, and link labels. Allow only `https://` links. Render task checkboxes with `disabled` unless `interactiveTasks` is true; interactive output must include the item path and checked value for the editor adapter.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test shared/markdown/markdown-core.test.mjs`

Expected: PASS for every block, round-trip, escaping, and interactive task case.

- [ ] **Step 6: Commit**

```bash
git add shared/markdown
git commit -m "feat: add shared markdown parser and renderer"
```

### Task 3: 實作純函式 editor commands

**Files:**
- Create: `shared/markdown/editor-commands.js`
- Create: `shared/markdown/editor-commands.test.mjs`
- Modify: `shared/markdown/index.js`
- Modify: `shared/markdown/index.d.ts`

**Interfaces:**
- `detectMarkdownShortcut(text: string): Shortcut | null`
- `continueBlock(blocks: Block[], path: number[]): Block[]`
- `exitEmptyBlock(blocks: Block[], path: number[]): Block[]`
- `indentListItem(blocks: Block[], path: number[], direction: 'in' | 'out'): Block[]`
- `toggleTaskItem(blocks: Block[], path: number[]): Block[]`

- [ ] **Step 1: Write the failing tests**

Test that `detectMarkdownShortcut('# ')` returns heading level 1, `detectMarkdownShortcut('- [ ] ')` returns an unchecked task item, and that list continuation, empty-list exit, indentation, and checkbox toggle return new trees without mutating input.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/markdown/editor-commands.test.mjs`

Expected: FAIL because command functions do not exist.

- [ ] **Step 3: Implement commands**

Shortcut detection must only trigger at the beginning of an empty block before the first content character. The UI adapter must call it only after a space insertion and must suppress conversion while `compositionstart` is active. `continueBlock` duplicates the current list type with an empty item; `exitEmptyBlock` converts an empty list item to a paragraph after the list; indentation moves an item under the previous sibling; task toggle flips only `checked`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/markdown/editor-commands.test.mjs`

Expected: PASS, including nested paths and IME-safe command eligibility.

- [ ] **Step 5: Commit**

```bash
git add shared/markdown/editor-commands.js shared/markdown/editor-commands.test.mjs shared/markdown/index.js shared/markdown/index.d.ts
git commit -m "feat: add markdown editor commands"
```

### Task 4: 遷移 Web renderer 並建立 React block editor

**Files:**
- Create: `web/components/MarkdownBlockEditor.tsx`
- Modify: `web/lib/markdown.ts`
- Modify: `web/lib/markdown.test.ts`
- Modify: `web/components/MarkdownPreview.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- `MarkdownBlockEditorProps`: `{ value: string; onChange(value: string): void; placeholder?: string; min?: number; max?: number; mode?: 'blocks' | 'source'; onTaskToggle?: (value: string) => void }`.
- `MarkdownEditorHandle`: `{ focus(): void; insertText(text: string): void; getValue(): string }`.
- `markdownToHtml(value)` remains exported from `web/lib/markdown.ts` as a compatibility wrapper around `renderMarkdown(value)`.
- `MarkdownPreview` accepts optional `interactiveTasks` and `onChange` only for editor-owned content; read-only previews remain disabled.

- [ ] **Step 1: Write the failing Web tests／type contract**

Extend `web/lib/markdown.test.ts` with exact renderer assertions:

```ts
assert.match(markdownToHtml('- [ ] Open\n- [x] Done'), /type="checkbox"/);
assert.match(markdownToHtml('| A | B |\n| --- | --- |\n| x | y |'), /<table>/);
```

Use `shared/markdown/editor-commands.test.mjs` for block state transitions because the repository has no browser component test runner; the React wrapper must consume those already-tested pure commands.

- [ ] **Step 2: Run the focused checks to verify the new expectations fail**

Run: `cd web; npm run typecheck`

Expected: FAIL until `web/lib/markdown.ts` exposes the shared renderer types and `MarkdownBlockEditor` exists.

- [ ] **Step 3: Implement the React wrapper**

Initialize blocks from `parseMarkdown(value)`. Render each block with stable `data-block-path` attributes. Keep text editing in contenteditable block surfaces, map DOM selection back to the active block, and serialize after each committed input. Handle `compositionstart`／`compositionend`, shortcut conversion after space, Enter／double-Enter, Tab／Shift+Tab, toolbar commands, and interactive task clicks. When `value` changes externally and the editor is not dirty, reparse it; when dirty, preserve the local draft until the parent acknowledges `onChange`.

Implement `mode="source"` with the existing textarea behavior for recovery／advanced editing. `insertText` must insert at the current selection so TimerPanel's timestamp action remains available.

- [ ] **Step 4: Migrate Web renderer and styles**

Make `web/lib/markdown.ts` a typed wrapper over `shared/markdown/index.js`. Keep `MarkdownPreview`'s existing class names and collapse behavior. Add styles for `.markdown-block-editor`, block focus, toolbar, nested list indentation, task checkbox alignment, code, table overflow, and the existing min／max height constraints.

- [ ] **Step 5: Run Web validation**

Run: `cd web; npm run typecheck`

Expected: PASS with no implicit-any errors from the shared JavaScript module and no broken existing imports.

- [ ] **Step 6: Commit**

```bash
git add web/lib/markdown.ts web/lib/markdown.test.ts web/components/MarkdownBlockEditor.tsx web/components/MarkdownPreview.tsx web/app/globals.css
git commit -m "feat: add web markdown block editor"
```

### Task 5: 將 Web 所有 Markdown 欄位換成 block editor

**Files:**
- Modify: `web/app/todos/page.tsx`
- Modify: `web/components/ProjectNotes.tsx`
- Modify: `web/components/EntryDialog.tsx`
- Modify: `web/components/TimerPanel.tsx`
- Modify: `web/app/schedules/page.tsx`
- Modify: `web/app/log/page.tsx`

**Interfaces:**
- Each existing `AutoTextarea` that stores Markdown is replaced by `MarkdownBlockEditor`; `AutoTextarea` remains for non-Markdown text fields.
- Existing `onChange` callbacks keep receiving a Markdown string.
- TimerPanel keeps `notesRef` behavior by switching it to `MarkdownEditorHandle` and calling `insertText()` from `stamp()`.

- [ ] **Step 1: Add integration assertions**

Create `extension/test/web-markdown-editor-contract.test.mjs` with this source contract:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'web/app/todos/page.tsx',
  'web/components/ProjectNotes.tsx',
  'web/components/EntryDialog.tsx',
  'web/components/TimerPanel.tsx',
  'web/app/schedules/page.tsx',
  'web/app/log/page.tsx',
];

test('all Markdown note fields use the block editor', () => {
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(source, /MarkdownBlockEditor/);
  }
});
```

Keep the existing domain action calls unchanged; the contract test only verifies the migration boundary.

- [ ] **Step 2: Run the contract test and typecheck to verify the integration assertions／types fail**

Run: `node --test extension/test/web-markdown-editor-contract.test.mjs; cd web; npm run typecheck`

Expected: the contract test fails until each component imports `MarkdownBlockEditor`; typecheck fails until the new props and TimerPanel ref are adapted.

- [ ] **Step 3: Migrate fields one group at a time**

Replace Todo, project, entry, timer, schedule, and log notes fields without changing surrounding domain actions. Preserve placeholders, min／max sizes, save buttons, dialog lifecycle, project note Ctrl+Enter behavior, and timer 500 ms autosave. Do not add a new database action.

- [ ] **Step 4: Run Web validation and manually inspect the field matrix**

Run: `cd web; npm run typecheck`

Manually verify: create/edit Todo, add project note, edit an entry, start a timer and stamp a timestamp, create/edit a schedule, and edit a log note. Confirm Markdown persists after reload and task checkbox clicks alter only the notes string.

- [ ] **Step 5: Commit**

```bash
git add web/app/todos/page.tsx web/components/ProjectNotes.tsx web/components/EntryDialog.tsx web/components/TimerPanel.tsx web/app/schedules/page.tsx web/app/log/page.tsx
git commit -m "feat: use markdown editor across web notes"
```

### Task 6: 遷移 Extension preview 與原生 DOM editor

**Files:**
- Modify: `extension/src/lib/markdown.js`
- Modify: `extension/src/lib/markdown.test.js`
- Modify: `extension/src/lib/markdown-editor.js`
- Modify: `extension/src/lib/markdown-editor.test.js`
- Modify: `extension/src/options/options.js`
- Modify: `extension/src/options/options.css`
- Modify: `extension/test/options-layout.test.mjs`

**Interfaces:**
- `mountMarkdownEditor(textarea, { mode, onChange })` returns `{ destroy(), focus(), insertText(text) }`.
- The original textarea remains the compatibility source element and receives the serialized Markdown plus a bubbling `input` event.
- `initializeMarkdownEditors(mode)` mounts block mode when settings are `toolbar`, and keeps the textarea visible／toolbar hidden for `source`.
- `renderMarkdownPreview` calls shared `renderMarkdown`; only editor-owned previews pass `interactiveTasks: true`.

- [ ] **Step 1: Extend Extension tests before implementation**

Add tests for `mountMarkdownEditor`-independent command helpers: shortcut conversion, checkbox serialization, source mode normalization, and preservation of `formatMarkdownSelection`. Add layout assertions that the editor exposes Todo／table commands and the original textarea remains discoverable.

- [ ] **Step 2: Run Extension tests to verify the new expectations fail**

Run: `node --test extension/src/lib/markdown-editor.test.js extension/src/lib/markdown.test.js extension/test/options-layout.test.mjs`

Expected: FAIL because the new mount and shared renderer integration do not exist.

- [ ] **Step 3: Implement the native DOM adapter**

Wrap each textarea in `.markdown-editor`, render toolbar buttons and contenteditable blocks, and keep textarea value synchronized. Delegate clicks and keyboard events from the wrapper. Guard conversions during IME composition. In source mode, skip block DOM and expose the raw textarea. Ensure `destroy()` removes listeners and restores the original textarea structure so tab navigation and rerender remain safe.

- [ ] **Step 4: Migrate Extension preview calls**

Replace the local Markdown rendering implementation with shared `renderMarkdown`. Preserve `shouldShowMarkdownToggle`, collapse classes, timer preview, daily review, Todo tracker, project workspace, Todo list, and entry list behavior. Add explicit disabled checkboxes to read-only previews and interactive callbacks only where an editor owns the value.

- [ ] **Step 5: Add Extension CSS and layout contracts**

Style block rows, editable focus, toolbar, task checkbox, nested list, table scroll, code block, source mode, and compact timer notes. Keep existing `.markdown-preview` and collapse selectors so report layout does not regress.

- [ ] **Step 6: Run Extension validation**

Run: `node --test extension/src/lib/*.test.js extension/test/*.test.mjs`

Expected: PASS, including existing reporting／layout contracts and the new editor tests.

- [ ] **Step 7: Commit**

```bash
git add extension/src/lib/markdown.js extension/src/lib/markdown.test.js extension/src/lib/markdown-editor.js extension/src/lib/markdown-editor.test.js extension/src/options/options.js extension/src/options/options.css extension/test/options-layout.test.mjs
git commit -m "feat: add extension markdown block editor"
```

### Task 7: Cross-interface verification and handoff

**Files:**
- Modify: `docs/ARCHITECTURE.md` only if the shared Markdown boundary is not already documented.
- Modify: `docs/README` or the relevant Markdown editor documentation if the user-facing editing behavior needs a documented note.

- [ ] **Step 1: Run the complete shared／Extension test command**

Run: `node --test shared/markdown/*.test.mjs extension/src/lib/*.test.js extension/test/*.test.mjs`

Expected: PASS with parser, serializer, renderer, command, layout, and existing domain tests green.

- [ ] **Step 2: Run Web typecheck and production build**

Run: `cd web; npm run typecheck; npm run build`

Expected: both commands exit 0; the shared JavaScript declaration is resolved without `allowJs` changes.

- [ ] **Step 3: Perform manual browser／Extension acceptance checks**

Check each Markdown feature in both interfaces: heading, inline marks, link, ordered／unordered／nested list, task list toggle, quote, fenced code, table, horizontal rule, paste, undo, IME input, source mode, and reload persistence. Verify read-only report previews remain non-editable and disabled.

- [ ] **Step 4: Review the final diff for data-contract safety**

Run: `git diff --check; git status --short`

Confirm no database schema or unrelated domain files changed, no raw unsanitized HTML path exists, and every Markdown field still saves through its existing action.

- [ ] **Step 5: Commit documentation or final fixes**

If documentation changed, commit it with `docs: document markdown block editor`; otherwise leave the implementation commits intact and report the verification commands and manual acceptance results.
