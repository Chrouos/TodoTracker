# Todo Tracker 專案配色與日期格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將正式 Todo Tracker 改為以日期為主要資訊，每個有實際工作紀錄的日期填滿一格，並沿用各 Todo 所屬專案的顏色。

**Architecture:** 保留既有 lifecycle 與 work segment 資料計算；資料層額外輸出每個 Todo 的實際工作日期，報表 render 將日期去重後繪製成日期格。每個 Todo 使用所屬 project color，生命週期線、日期格、標籤色標與明細邊線共享同一色彩來源。

**Tech Stack:** Chrome extension、原生 JavaScript、CSS、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-08-18-todo-tracker-design.md` 與已確認的日期型 Tracker mockup。

## Global Constraints

- 圖表只表達日期，不以框寬表達實際工時長度。
- 有工作紀錄的日期才顯示日期格；0m 紀錄不顯示。
- 同一個 Todo 的所有日期格使用同一個專案顏色；顏色不代表狀態或工時。
- 開單到結單仍以淡色跨度線表示。
- Hover、鍵盤操作與選取明細維持可用。
- 不修改資料庫 schema，也不改變既有報表區間與 tracker 日期軸邏輯。

---

### Task 1: 輸出 Todo 的實際工作日期

**Files:**
- Modify: `extension/src/lib/todo-tracker.js`
- Test: `extension/src/lib/todo-tracker.test.js`

- [ ] **Step 1: Write the failing test**

新增測試，確認同一 Todo 的工作紀錄會輸出排序且去重的 `workedDates`，跨午夜紀錄要包含起訖兩天。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extension/src/lib/todo-tracker.test.js`

Expected: FAIL because `workedDates` does not exist.

- [ ] **Step 3: Write minimal implementation**

在 `buildTodoTrackerData()` 的 item 內輸出 `workedDates: [...workedDateKeys(itemEntries)].sort()`，沿用目前 30 秒門檻與既有 entry clipping。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test extension/src/lib/todo-tracker.test.js`

Expected: PASS。

### Task 2: 以日期格取代時間長度工作框

**Files:**
- Modify: `extension/src/options/options.js`
- Test: `extension/test/todo-tracker-layout.test.mjs`

- [ ] **Step 1: Write the failing test**

新增 source contract assertions：renderer 使用 `workedDates`、輸出 `--todo-day` 或等價日期格定位、不得以 `showSegmentLabel` 在工作框內渲染工時文字，並保留 `todoTrackerColor(project)` 與 `--todo-color`。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extension/test/todo-tracker-layout.test.mjs`

Expected: FAIL because renderer still draws time-sized segments and duration labels.

- [ ] **Step 3: Write minimal implementation**

在每個 item 內將 `workedDates` 映射到 `data.dates` 的 index，輸出每個日期一個 `.todo-tracker-work` button，使用 `--todo-day` 定位並以該 item 的 project color 設定 `--todo-color`。Tooltip 與 aria-label 只顯示 Todo、日期與有工作紀錄；生命週期線維持現有百分比定位。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test extension/test/todo-tracker-layout.test.mjs`

Expected: PASS。

### Task 3: 將日期格與專案配色落地到 CSS

**Files:**
- Modify: `extension/src/options/options.css`
- Test: `extension/test/todo-tracker-layout.test.mjs`

- [ ] **Step 1: Write the failing test**

新增 CSS contract assertions：日期格使用 `--todo-day`、寬度為單日欄寬扣除固定內距、工作框不依 `--todo-width` 拉伸，並保留 `--todo-color`。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extension/test/todo-tracker-layout.test.mjs`

Expected: FAIL because current CSS positions by percentage width.

- [ ] **Step 3: Write minimal implementation**

將 `.todo-tracker-work` 改為以 `--todo-day` 計算 `left` 與單日 `width`，固定較小高度；移除框內工時文字的視覺依賴，保留 project color、hover、focus 與 tooltip。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test extension/test/todo-tracker-layout.test.mjs`

Expected: PASS。

### Task 4: 完整驗證與本機合併

**Files:**
- Review: `extension/src/lib/todo-tracker.js`, `extension/src/options/options.js`, `extension/src/options/options.css`, tests above

- [ ] **Step 1: Run all extension tests**

Run: `Get-ChildItem extension/test -Filter '*.test.mjs' | ForEach-Object { node --test $_.FullName }; Get-ChildItem extension/src/lib -Filter '*.test.js' | ForEach-Object { node --test $_.FullName }`

Expected: all tests pass。

- [ ] **Step 2: Run syntax and diff checks**

Run: `node --check extension/src/options/options.js; git diff --check`

Expected: no output/errors。

- [ ] **Step 3: Commit the feature**

Run: `git add extension/src/lib/todo-tracker.js extension/src/lib/todo-tracker.test.js extension/src/options/options.js extension/src/options/options.css extension/test/todo-tracker-layout.test.mjs docs/superpowers/plans/2026-08-18-todo-tracker-project-color-date-plan.md; git commit -m "feat: render todo tracker by project color and date"`

- [ ] **Step 4: Merge locally into main**

Run from the repository main worktree: `git merge --ff-only 奴隸`

Expected: local `main` points at the new feature commit and retains unrelated untracked user files.
