# 自訂區間與 Markdown Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在紀錄與報表加入共用自訂日期區間，並讓 Markdown preview 顯示 table。

**Architecture:** `time.js` 提供可測試的本機日期區間邊界函式；`options.js` 以共用 custom range 狀態套用到報表與紀錄，兩邊控制項同步。`markdown.js` 以純函式辨識 table separator row，沿用既有 inline escaping/conversion 產生 `<table>`。

**Tech Stack:** Chrome Extension、原生 ES modules、HTML/CSS、Node built-in test runner。

## Global Constraints

- 保留今日／本週／本月／全部快速篩選。
- 自訂區間包含開始日與結束日整天，使用本機時區。
- 缺少日期或開始日晚於結束日不得更新目前篩選。
- Markdown table 必須 escape HTML，且儲存格沿用既有 inline Markdown。
- 不新增第三方套件、不修改 Orca runtime 檔案。
- `extension.zip` 維持未追蹤，不加入 commit。

---

### Task 1: 日期區間邊界函式

**Files:**
- Modify: `extension/src/lib/time.js`
- Create: `extension/src/lib/time.test.js`

**Interfaces:**
- Produces `localDateRange(fromDate, toDate)`，回傳 `{ from: Date, to: Date }`，其中 `to` 是結束日隔天的本機午夜；輸入缺少或反向時回傳 `null`。

- [ ] **Step 1: Write the failing tests**

```js
test('localDateRange includes both local calendar dates', () => {
  const result = localDateRange('2026-08-10', '2026-08-12');
  assert.equal(result.from.getHours(), 0);
  assert.equal(result.from.getDate(), 10);
  assert.equal(result.to.getDate(), 13);
});

test('localDateRange rejects incomplete and reversed ranges', () => {
  assert.equal(localDateRange('', '2026-08-12'), null);
  assert.equal(localDateRange('2026-08-13', '2026-08-12'), null);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test extension/src/lib/time.test.js`

Expected: FAIL because the module and function do not exist yet.

- [ ] **Step 3: Implement the minimal helper**

Construct local midnight with `new Date(year, month - 1, day)`, add one calendar day to the end, and return `null` for missing or reversed `YYYY-MM-DD` inputs.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test extension/src/lib/time.test.js`

Expected: both tests pass.

### Task 2: Markdown table parser

**Files:**
- Modify: `extension/src/lib/markdown.js`
- Modify: `extension/src/lib/markdown.test.js`
- Modify: `extension/src/options/options.css`

**Interfaces:**
- `markdownToHTML()` recognizes consecutive pipe rows with a separator row and emits `<table><thead>…</thead><tbody>…</tbody></table>`.

- [ ] **Step 1: Add failing table tests**

```js
test('renders markdown tables with aligned cells and inline markdown', () => {
  assert.equal(
    markdownToHTML('| Name | Hours | Note |\n| :--- | ---: | :---: |\n| **API** | 2h | `fast` |'),
    '<table><thead><tr><th style="text-align:left">Name</th><th style="text-align:right">Hours</th><th style="text-align:center">Note</th></tr></thead><tbody><tr><td style="text-align:left"><strong>API</strong></td><td style="text-align:right">2h</td><td style="text-align:center"><code>fast</code></td></tr></tbody></table>',
  );
});

test('escapes table cells and pads short rows', () => {
  assert.equal(
    markdownToHTML('| A | B |\n| --- | --- |\n| <x> |'),
    '<table><thead><tr><th style="text-align:left">A</th><th style="text-align:left">B</th></tr></thead><tbody><tr><td style="text-align:left">&lt;x&gt;</td><td style="text-align:left"></td></tr></tbody></table>',
  );
});
```

- [ ] **Step 2: Run the Markdown tests and verify RED**

Run: `node --test extension/src/lib/markdown.test.js`

Expected: the existing tests pass and the two table tests fail because the parser emits a paragraph.

- [ ] **Step 3: Implement table detection and rendering**

Split escaped pipe cells, require at least one separator row cell matching `:?-{3,}:?`, use fixed alignment values (`left`, `right`, `center`), pad short rows, and pass every cell through `inline()`.

- [ ] **Step 4: Add preview table CSS**

Add border-collapse, cell borders/padding, alignment support from inline style, and `overflow-x: auto` on the table wrapper or preview content so narrow screens do not break the page.

- [ ] **Step 5: Run the Markdown tests and verify GREEN**

Run: `node --test extension/src/lib/markdown.test.js`

Expected: all Markdown tests pass.

### Task 3: Shared custom range controls and filtering

**Files:**
- Modify: `extension/src/options/options.html`
- Modify: `extension/src/options/options.js`
- Modify: `extension/src/options/options.css`

**Interfaces:**
- Shared state `customRange = { from: '', to: '' }`.
- `applyCustomRange(source)` validates date inputs with `localDateRange`, updates shared state, and rerenders both report and entries.

- [ ] **Step 1: Add failing range integration assertions**

Add a small pure filtering test helper only if needed; at minimum use Task 1’s boundary tests to lock inclusive date semantics before wiring DOM events.

- [ ] **Step 2: Add controls to both toolbars**

Add a `自訂` quick button and hidden date controls with separate IDs for report and entries. Each control has `type="date"` inputs for from/to and a `套用` button.

- [ ] **Step 3: Wire shared custom state**

Use `localDateRange()` for validation. `inRange()` and `filteredEntries()` filter `startedAt >= from && startedAt < to`. Synchronize both custom inputs and both custom buttons after applying.

- [ ] **Step 4: Apply the same bounds to report charts**

For custom report mode, build `dailySeries()` from the selected start date through the selected end date, use the same dates for the timeline, and label the report with `from ～ to`. Existing quick-range labels and behavior remain unchanged.

- [ ] **Step 5: Handle invalid input without changing data**

If either date is missing or reversed, call `alert('請選擇有效的日期區間')` and leave the current range and rendered data untouched.

- [ ] **Step 6: Run syntax and existing tests**

Run: `node --check extension/src/options/options.js; node --test extension/src/lib/*.test.js`

Expected: syntax check succeeds and all tests pass.

### Task 4: Final verification and delivery

**Files:**
- Verify all modified extension files.

- [ ] **Step 1: Run the complete test and syntax suite**

Run: `node --test extension/src/lib/*.test.js; node --check extension/src/options/options.js; node --check extension/src/lib/markdown.js; node --check extension/src/lib/time.js`

- [ ] **Step 2: Run whitespace and status checks**

Run: `git diff --check; git status --short --branch`

Confirm only planned tracked files changed and `extension.zip` remains untracked.

- [ ] **Step 3: Commit and push**

```powershell
git add extension/src/lib/markdown.js extension/src/lib/markdown.test.js extension/src/lib/time.js extension/src/lib/time.test.js extension/src/options/options.html extension/src/options/options.js extension/src/options/options.css
git commit -m "Add custom ranges and markdown tables"
git push origin main
```

- [ ] **Step 4: Reload the unpacked extension**

Reload `Documents\Personal\TodoTracker\extension` in Chrome and verify custom dates work in both tabs and Markdown tables render in notes.
