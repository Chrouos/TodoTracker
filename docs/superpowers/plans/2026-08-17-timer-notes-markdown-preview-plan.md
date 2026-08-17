# 計時當下紀錄 Markdown 預覽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在管理頁的計時面板提供「當下紀錄」Markdown 編輯／預覽切換，並保留既有 timer 自動保存流程。

**Architecture:** HTML 提供切換控制項與獨立 preview 容器；options controller 以單一模式狀態控制 textarea 與 preview 的顯示，並重用既有 `renderMarkdownPreview()` 與 `initializeMarkdownPreviews()`。預覽容器限制高度並啟用垂直捲動，避免長內容改變整個計時面板的布局。

**Tech Stack:** Chrome extension options page、原生 HTML/CSS/JavaScript、Node `node:test` contract tests、既有 `markdownToHTML` renderer。

## Global Constraints

- 不修改既有 timer notes 的 autosave debounce、`db.patchTimer()` 或 `db.stopTimer()` 流程。
- 不新增 Markdown parser 或第三方 dependency。
- 預覽必須使用既有 `renderMarkdownPreview()` 與 `initializeMarkdownPreviews()`。
- 長預覽固定在最小 180px、最大 360px 範圍內，超出內容由預覽區自身垂直捲動。

---

### Task 1: 建立 Markdown preview wiring 的失敗測試

**Files:**
- Create: `extension/test/timer-markdown-preview.test.mjs`

**Interfaces:**
- Consumes: `extension/src/options/options.html`, `extension/src/options/options.css`, `extension/src/options/options.js`
- Produces: regression contract covering the timer notes preview controls and renderer wiring.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');

assert.match(html, /id="mgTimerNotesPreviewToggle"[^>]*type="button"/,
  'Timer notes should expose a Markdown preview toggle button');
assert.match(html, /id="mgTimerNotesPreview"[^>]*hidden/,
  'Timer notes should expose a hidden preview container');
assert.match(options, /function renderTimerNotesPreview\(\)/,
  'Timer should render notes through a dedicated preview function');
assert.match(options, /renderMarkdownPreview\(\$\('mgTimerNotes'\)\.value/,
  'Timer notes preview should reuse the Markdown renderer');
assert.match(options, /mgTimerNotesPreviewToggle.*addEventListener\('click'/s,
  'Timer notes preview should be user-toggleable');
assert.match(css, /\.timer-notes-preview\s*\{[^}]*max-height:\s*360px[^}]*overflow-y:\s*auto/s,
  'Timer notes preview should have a bounded scrollable height');

console.log('timer markdown preview contract passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extension/test/timer-markdown-preview.test.mjs`

Expected: FAIL because the timer notes preview button, container, rendering function, event binding, and bounded preview CSS do not exist yet.

### Task 2: Add timer notes preview controls and controller behavior

**Files:**
- Modify: `extension/src/options/options.html:49-52`
- Modify: `extension/src/options/options.js:220-260,312-318,1708-1717`

**Interfaces:**
- Consumes: existing `renderMarkdownPreview(markdown, className)` and `initializeMarkdownPreviews(container, preserveExpanded)` helpers.
- Produces: `renderTimerNotesPreview()` and a `timerNotesPreviewOpen` mode controlled by `mgTimerNotesPreviewToggle`.

- [ ] **Step 1: Write the minimal HTML controls**

Add a button and sibling container below `#mgTimerNotes`:

```html
<div class="timer-notes-preview-actions">
  <button id="mgTimerNotesPreviewToggle" type="button" class="btn-sm" aria-pressed="false">預覽 Markdown</button>
</div>
<div id="mgTimerNotesPreview" class="timer-notes-preview" hidden></div>
```

- [ ] **Step 2: Run the focused test and confirm the remaining failure**

Run: `node --test extension/test/timer-markdown-preview.test.mjs`

Expected: FAIL on the JavaScript and CSS assertions, proving the HTML contract is now covered while behavior is still missing.

- [ ] **Step 3: Implement the minimal preview state and render function**

Add `let timerNotesPreviewOpen = false;` near the existing timer state. Add:

```js
function renderTimerNotesPreview() {
  const container = $('mgTimerNotesPreview');
  container.innerHTML = renderMarkdownPreview($('mgTimerNotes').value, 'timer-notes-markdown');
  initializeMarkdownPreviews(container);
}

function setTimerNotesPreviewOpen(open) {
  timerNotesPreviewOpen = open;
  $('mgTimerNotes').hidden = open;
  $('mgTimerNotesPreview').hidden = !open;
  const toggle = $('mgTimerNotesPreviewToggle');
  toggle.textContent = open ? '編輯 Markdown' : '預覽 Markdown';
  toggle.setAttribute('aria-pressed', String(open));
  if (open) renderTimerNotesPreview();
  else growTimerNotes();
}
```

Call `renderTimerNotesPreview()` at the end of `renderTimer()` only when `timerNotesPreviewOpen` is true, so timer reloads preserve the selected mode. Add the click listener:

```js
$('mgTimerNotesPreviewToggle').addEventListener('click', () => {
  setTimerNotesPreviewOpen(!timerNotesPreviewOpen);
});
```

Do not change the existing notes `input` listener or the stop/start save calls.

- [ ] **Step 4: Run the focused test to verify the behavior wiring passes except styling**

Run: `node --test extension/test/timer-markdown-preview.test.mjs`

Expected: FAIL only on the CSS bounded-height assertion.

### Task 3: Style the bounded preview and finish regression verification

**Files:**
- Modify: `extension/src/options/options.css:60-61`

**Interfaces:**
- Consumes: `#mgTimerNotesPreview` and `.timer-notes-preview-actions` emitted by the timer options page.
- Produces: a preview area with the same Markdown visual language and a bounded scroll region.

- [ ] **Step 1: Add the focused preview CSS**

```css
.timer-notes-preview-actions { margin-top: var(--xs); }
.timer-notes-preview {
  min-height: 180px;
  max-height: 360px;
  overflow-y: auto;
  margin-top: var(--xs);
  padding: var(--sm);
  border: 1px solid var(--hairline);
  background: var(--surface-soft);
}
.timer-notes-markdown { margin-top: 0; }
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `node --test extension/test/timer-markdown-preview.test.mjs`

Expected: PASS with `timer markdown preview contract passed`.

- [ ] **Step 3: Run all extension tests and syntax checks**

Run: `Get-ChildItem extension/test -Filter '*.test.mjs' | ForEach-Object { node --test $_.FullName }; Get-ChildItem extension/src/lib -Filter '*.test.js' | ForEach-Object { node --test $_.FullName }; node --check extension/src/options/options.js; git diff --check`

Expected: all tests exit successfully, `node --check` exits successfully, and `git diff --check` prints no errors.

- [ ] **Step 4: Review the final diff against the spec**

Confirm that the diff only changes the timer notes UI, controller wiring, CSS, regression test, and the two planning documents; confirm no timer persistence calls or Markdown parser code changed.

- [ ] **Step 5: Commit the implementation**

```powershell
git add extension/src/options/options.html extension/src/options/options.js extension/src/options/options.css extension/test/timer-markdown-preview.test.mjs docs/superpowers/specs/2026-08-17-timer-notes-markdown-preview-design.md docs/superpowers/plans/2026-08-17-timer-notes-markdown-preview-plan.md
git commit -m "feat: add timer notes markdown preview"
```
