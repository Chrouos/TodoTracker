# 報表標題留白與 Todo 健康度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 放寬報表區塊標題的上下間距，並加入使用現有 Todo 資料計算的健康度摘要。

**Architecture:** 在 `lib/tasks.js` 增加純函式 `todoHealth(tasks, today)`，集中計算非封存 Todo 的總數、完成數、完成率、進行中數與逾期數。`options.js` 只負責把結果轉成報表 HTML；`options.html` 提供可折疊區塊，`options.css` 負責標題留白與健康度卡片排版。

**Tech Stack:** Chrome Extension、原生 ES modules、原生 HTML/CSS、Node built-in test runner。

## Global Constraints

- 不新增第三方套件。
- Todo 健康度不受報表工時範圍（今日／本週／本月／全部）影響，使用目前所有非封存 Todo。
- 逾期定義為 `status !== 'done'`、`status !== 'archived'`、有 `dueDate` 且 `dueDate < today`。
- 沒有 Todo 時完成率必須是 `0`，UI 顯示 `—`，不可除以零。
- 保留現有報表折疊功能與手機版響應式行為。
- `extension.zip` 是既有未追蹤檔案，不加入任何 commit。

---

### Task 1: Todo 健康度純函式

**Files:**
- Modify: `extension/src/lib/tasks.js`
- Test: `extension/src/lib/tasks.test.js`

**Interfaces:**
- Produces `todoHealth(tasks, today = fmtDate(new Date().toISOString()))`，回傳 `{ total, done, completionRate, active, overdue }`。

- [ ] **Step 1: Write the failing tests**

在 `tasks.test.js` 增加：

```js
test('todoHealth counts active, completed, and overdue todos', () => {
  const result = todoHealth([
    { status: 'done', dueDate: '2026-08-10' },
    { status: 'doing', dueDate: '2026-08-11' },
    { status: 'todo', dueDate: '2026-08-01' },
    { status: 'todo', dueDate: '2026-08-20' },
    { status: 'archived', dueDate: '2026-08-01' },
  ], '2026-08-12');

  assert.deepEqual(result, {
    total: 4,
    done: 1,
    completionRate: 0.25,
    active: 1,
    overdue: 1,
  });
});

test('todoHealth handles empty todos without division by zero', () => {
  assert.deepEqual(todoHealth([], '2026-08-12'), {
    total: 0,
    done: 0,
    completionRate: 0,
    active: 0,
    overdue: 0,
  });
});
```

匯入 `todoHealth`，但先不要新增實作。

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test extension/src/lib/tasks.test.js`

Expected: FAIL because `todoHealth` is not exported yet.

- [ ] **Step 3: Implement the minimal calculation**

在 `tasks.js` 匯出函式，先排除 `status === 'archived'`，再依 `done`、`doing` 與逾期條件計數；`completionRate` 使用 `total ? done / total : 0`。

- [ ] **Step 4: Run the focused test**

Run: `node --test extension/src/lib/tasks.test.js`

Expected: PASS with 3 tests passing（既有測試加上兩個新測試）。

- [ ] **Step 5: Commit the unit and implementation change**

```powershell
git add extension/src/lib/tasks.js extension/src/lib/tasks.test.js
git commit -m "Add todo health metrics"
```

### Task 2: 報表健康度區塊

**Files:**
- Modify: `extension/src/options/options.html:45-65`
- Modify: `extension/src/options/options.js:1-150`

**Interfaces:**
- Consumes `todoHealth(S.tasks)` from Task 1.
- Produces a collapsible `rep-health` / `todoHealth` report panel with four values.

- [ ] **Step 1: Add the report panel markup**

在 KPI 區塊後新增：

```html
<h2 class="sec" data-collapse="rep-health">
  <span class="mark">[-]</span> Todo 健康度
</h2>
<div id="todoHealth" data-collapse-body="rep-health"></div>
```

- [ ] **Step 2: Register the panel grouping**

在 `groupReportPanels()` 的面板清單加入：

```js
['rep-health', 'todoHealth', 'report-panel-health'],
```

- [ ] **Step 3: Render health metrics**

從 `tasks.js` 匯入 `todoHealth`，在 `renderReport()` 取得 `health = todoHealth(S.tasks)`，將 `total`、`done`、`completionRate`、`active`、`overdue` 轉成四張摘要卡；完成率以 `Math.round(completionRate * 100)` 顯示，零筆時顯示 `—`。

- [ ] **Step 4: Run syntax and existing tests**

Run: `node --check extension/src/options/options.js`

Run: `node --test extension/src/lib/tasks.test.js extension/src/lib/relations.test.js extension/src/lib/markdown.test.js`

Expected: syntax check exit 0 and all tests pass.

### Task 3: 標題留白與健康度卡片樣式

**Files:**
- Modify: `extension/src/options/options.css:250-330`

- [ ] **Step 1: Increase report section title breathing room**

將 `.report-panel > h2.sec` 調整為保留現有字體層級，但使用 `margin: 0 0 14px; padding: 6px 2px 8px; line-height: 1.45;`，讓標題上下都有空間。

- [ ] **Step 2: Add health card layout**

新增 `.todo-health` 四欄 grid、卡片內距、分隔線、數值字級與完成率 accent；在 `max-width: 850px` 下改為兩欄，沿用現有 report responsive breakpoint。

- [ ] **Step 3: Run CSS and diff checks**

Run: `git diff --check`

Expected: no whitespace errors.

### Task 4: Full verification and delivery

**Files:**
- Verify: `extension/src/lib/tasks.js`
- Verify: `extension/src/lib/tasks.test.js`
- Verify: `extension/src/options/options.js`
- Verify: `extension/src/options/options.css`
- Verify: `extension/src/options/options.html`

- [ ] **Step 1: Run all unit tests**

Run: `node --test extension/src/lib/*.test.js`

Expected: zero failures.

- [ ] **Step 2: Run JavaScript syntax checks**

Run: `node --check extension/src/options/options.js; node --check extension/src/lib/tasks.js`

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the final diff and status**

Run: `git diff --check; git status --short --branch`

Confirm only the planned tracked files are changed and `extension.zip` remains untracked.

- [ ] **Step 4: Commit and push the implementation**

```powershell
git add extension/src/lib/tasks.js extension/src/lib/tasks.test.js extension/src/options/options.html extension/src/options/options.js extension/src/options/options.css
git commit -m "Add todo health report"
git push origin main
```

- [ ] **Step 5: Reload the unpacked extension**

In Chrome extensions, reload the unpacked extension from `Documents\Personal\TodoTracker\extension` and verify the report title spacing and Todo 健康度 panel visually.
