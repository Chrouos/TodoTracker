# 報表 Todo Tracker Implementation Plan

**Objective:** 在現有報表保留專案 heatmap 的前提下，新增可自動更新、可點擊查看細節的 Todo 生命週期 tracker。

**Scope:** 純資料計算、報表 HTML tracker、Todo 詳細區塊、60 秒刷新、tracker／heatmap hover 樣式與 regression tests。

**Out of scope:** Todo reopen 歷史資料模型、拖曳修改日期、資料庫 schema、替換或重算既有專案趨勢與 heatmap。

## Technical baseline

- 報表入口：`extension/src/options/options.js`
- 既有專案圖與 heatmap：`extension/src/lib/charts.js`、`extension/src/lib/project-trend.js`
- Todo 欄位：`openedAt`、`completedAt`、`status`、`projectId`、`title`、`notes`
- 工作紀錄欄位：`taskId`、`startedAt`、`endedAt`、`deletedAt`
- 報表日期軸：`renderReport()` 產生的 `trendDates`
- 測試執行方式：`node --test`，extension contract tests 在 `extension/test`，純 library tests 在 `extension/src/lib`。

## Ordered implementation stages

### Stage 1: 建立 Todo tracker 純資料模型（TDD）

**Files:**

- Create: `extension/src/lib/todo-tracker.test.js`
- Create: `extension/src/lib/todo-tracker.js`

**Interface:**

```js
buildTodoTrackerData({
  tasks,
  entries,
  dates,
  now,
  durationSec,
})
```

Returns:

```js
{
  dates: string[],
  windowStart: Date,
  windowEnd: Date,
  items: [{
    id,
    title,
    projectId,
    status,
    notes,
    openedAt,
    endedAt,
    visibleStart,
    visibleEnd,
    lifecycleSeconds,
    trackedSeconds,
    entries: [{ id, startedAt, endedAt, seconds, notes, description }],
  }],
}
```

Implementation rules:

1. Convert the first date to local midnight and the day after the final date to an exclusive `windowEnd`.
2. Exclude `archived` tasks and tasks whose lifecycle does not intersect `[windowStart, windowEnd)`.
3. Use `openedAt` as lifecycle start; use `completedAt` when present, otherwise the supplied `now`.
4. Clamp `visibleStart` and `visibleEnd` to the report window.
5. Include only non-deleted, ended entries matching `taskId`; calculate each entry’s overlap with the report window so entries crossing a boundary count only for the visible portion.
6. Sort items by `openedAt` ascending and title as a stable tie-breaker.
7. Preserve raw timestamps and notes for the UI detail panel; a task with no entries remains visible with `trackedSeconds: 0`.

**Tests first:**

- A completed task spanning the window is clamped to the window but keeps its actual lifecycle timestamps.
- An active task uses `now` as its end and is included when it intersects the window.
- A task outside the window and an archived task are excluded.
- An entry crossing the report window is clipped before its seconds are added; deleted and open entries are ignored.
- Items are sorted deterministically and a task without entries returns zero tracked seconds.

**Verification:**

```powershell
node --test extension/src/lib/todo-tracker.test.js
```

### Stage 2: 建立 tracker markup 與詳細資料狀態（TDD）

**Files:**

- Modify: `extension/src/options/options.html`
- Modify: `extension/src/options/options.js`
- Create: `extension/test/todo-tracker-layout.test.mjs`

**State and functions:**

- Import `buildTodoTrackerData`.
- Add `todoTrackerState`, `todoTrackerSource`, `todoTrackerSelectedId`, and `todoTrackerRefreshTimer`.
- Add `renderTodoTracker(entries, dates)` to build a semantic HTML tracker inside `#todoTracker` and store the data source.
- Add `renderTodoTrackerDetail()` to fill `#todoTrackerDetail`; show Todo name, project path, status, opened/completed/current time, lifecycle elapsed time, tracked seconds, notes preview, and entry rows.
- Add `startTodoTrackerRefresh()` / `stopTodoTrackerRefresh()`; refresh only tracker data and selected detail every 60 seconds using `new Date()`.
- Add delegated click handling for `[data-todo-tracker-id]` and `[data-todo-tracker-close]` before existing project-link handling.
- Add delegated pointer and focus handling for tracker bars without reusing `[data-trend-date]`, so project trend/heatmap hover behavior remains independent.
- Call `renderTodoTracker(entries, dates)` from `renderProjectTrend()` after rendering the existing heatmap. Keep heatmap markup intact.

**Markup contract:**

- `#todoTracker` contains a `.todo-tracker` with date headers and one `.todo-tracker-row` per item.
- Each item uses a keyboard-accessible `<button data-todo-tracker-id="...">` bar with CSS custom properties for percentage left/width.
- `#todoTrackerDetail` starts hidden and is shown only after selection.

**Tests first:**

`extension/test/todo-tracker-layout.test.mjs` reads the existing HTML/CSS/options source and asserts:

- The report keeps `projectHeatmap` and adds `todoTracker` / `todoTrackerDetail` mount points.
- `options.js` imports `buildTodoTrackerData`, calls `renderTodoTracker`, binds `data-todo-tracker-id`, and contains the 60-second refresh.
- The tracker uses a separate data attribute and detail close action.

Run the test before production edits and confirm it fails because the mount points and wiring are absent; then add the minimum HTML mount points and JavaScript wiring until it passes.

**Verification:**

```powershell
node --test extension/test/todo-tracker-layout.test.mjs
node --check extension/src/options/options.js
```

### Stage 3: 接入 tracker 到現有報表 render flow

**Files:**

- Modify: `extension/src/options/options.js`

Implementation details:

1. Pass the existing `trendEntries` and `trendDates` into `renderProjectTrend`; use `S.tasks` plus the selected date window for lifecycle bars.
2. Calculate each bar’s percentage from `windowStart` to `windowEnd`; a same-window task still receives a visible minimum width of 2px.
3. Preserve `todoTrackerSelectedId` across the 60-second refresh when the task still exists; clear it when the selected task leaves the report window.
4. Call `initializeMarkdownPreviews()` after rendering the selected Todo notes preview.
5. On report range changes, rebuild the tracker and restart the refresh timer; do not alter project trend or heatmap calculations.
6. On empty tracker data, render a text empty state and keep `#todoTrackerDetail` hidden.

**Manual acceptance checks:**

- A Todo opened before the selected range and completed inside it shows a bar starting at the left edge and ending on its completion date.
- An active Todo bar reaches the current time and moves after a minute without refreshing the page.
- Clicking a bar opens details; clicking close hides them; keyboard focus and Enter/Space activate the same behavior.
- Existing heatmap remains visible and clickable.

### Stage 4: 完成視覺與 hover 調整

**Files:**

- Modify: `extension/src/options/options.css`

Add:

- `.todo-tracker` grid with a fixed label column, horizontally scrollable date track, and vertically scrollable rows.
- Date header and day grid lines aligned with the bar track.
- `.todo-tracker-bar` styles for active/done states, hover/focus states, duration text, and a white bounded tooltip.
- `.todo-tracker-detail` styles for KPI badges, Markdown notes, daily entry rows, and responsive layout.
- A visual minimum bar width for same-day tasks.

Change only hover emphasis for existing heatmap cells from the black `var(--ink)` 2px outline to a lighter hairline/project-color treatment. Do not change heatmap values or selected-project behavior.

**Verification:**

```powershell
node --test extension/test/todo-tracker-layout.test.mjs
git diff --check
```

### Stage 5: 完整驗證與交付

**Files:**

- Review all changes above; no additional files expected.

Run:

```powershell
$ErrorActionPreference = 'Stop'
Get-ChildItem extension/test -Filter '*.test.mjs' | ForEach-Object { node --test $_.FullName }
Get-ChildItem extension/src/lib -Filter '*.test.js' | ForEach-Object { node --test $_.FullName }
node --check extension/src/options/options.js
git diff --check
```

Also inspect the final diff to verify that:

- heatmap markup and data calculations remain present;
- no database writes or schema changes were introduced;
- the interval is cleared/replaced when the report rerenders;
- the tracker detail does not use unescaped user text in HTML.

Commit after fresh verification:

```powershell
git add extension/src/lib/todo-tracker.js extension/src/lib/todo-tracker.test.js extension/src/options/options.js extension/src/options/options.css extension/src/options/options.html extension/test/todo-tracker-layout.test.mjs
git commit -m "feat: add todo lifecycle tracker to reports"
```
