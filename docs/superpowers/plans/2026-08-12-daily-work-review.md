# 每日工作回顧報表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將報表由左右並排的小型時間軸改為單欄、可閱讀工作內容的每日工作回顧。

**Architecture:** 保留現有 KPI、Todo 健康度、專案分布與每日工時折線圖；移除 SVG 時間軸，新增純 HTML 的每日工作回顧。日期分組與排序放在可測試的 `time.js` helper，畫面組裝留在 `options.js`，沿用現有 `esc`、專案色彩與 Markdown preview。

**Tech Stack:** Chrome Extension options page、原生 JavaScript ES modules、HTML/CSS、Node built-in test runner。

## Global Constraints

- 不新增資料庫欄位或外部依賴。
- 只顯示已結束且未刪除的工作紀錄。
- 工作標題、描述、專案名稱與備註必須沿用現有 escaping／Markdown renderer。
- 快速區間與自訂區間的篩選行為維持現有邏輯。
- 每日工作回顧必須保留選定日期範圍內沒有紀錄的日期。
- 報表所有面板改為單欄排列，不能再讓專案分布與工作回顧左右各佔半欄。

---

### Task 1: 建立每日日期分組與排序 helper

**Files:**
- Modify: `extension/src/lib/time.js`
- Modify: `extension/src/lib/time.test.js`

**Interfaces:**
- Consumes: `entries`，每筆含 `startedAt`、`endedAt`、`deletedAt` 等現有欄位；`dates` 為 `YYYY-MM-DD[]`。
- Produces: `dailyReviewData(entries, dates)`，回傳依 `dates` 原順序排列的 `{ date, entries }[]`；每組 entries 只保留 `endedAt` 存在且沒有 `deletedAt` 的紀錄，並依 `startedAt` 由早到晚排序。

- [ ] **Step 1: Write the failing tests**

在 `extension/src/lib/time.test.js` 加入：

```js
import { dailyReviewData } from './time.js';

test('dailyReviewData keeps empty dates and sorts work by start time', () => {
  const result = dailyReviewData([
    { id: 'late', startedAt: '2026-08-11T13:00:00+08:00', endedAt: '2026-08-11T14:00:00+08:00' },
    { id: 'deleted', startedAt: '2026-08-10T09:00:00+08:00', endedAt: '2026-08-10T10:00:00+08:00', deletedAt: '2026-08-10T10:01:00+08:00' },
    { id: 'early', startedAt: '2026-08-11T09:00:00+08:00', endedAt: '2026-08-11T10:00:00+08:00' },
    { id: 'open', startedAt: '2026-08-12T09:00:00+08:00' },
  ], ['2026-08-10', '2026-08-11', '2026-08-12']);

  assert.deepEqual(result.map((group) => group.date), ['2026-08-10', '2026-08-11', '2026-08-12']);
  assert.deepEqual(result[0].entries, []);
  assert.deepEqual(result[1].entries.map((entry) => entry.id), ['early', 'late']);
  assert.deepEqual(result[2].entries, []);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test extension/src/lib/time.test.js`

Expected: FAIL because `dailyReviewData` is not exported yet.

- [ ] **Step 3: Implement the minimal helper**

Add `dailyReviewData(entries, dates)` to `extension/src/lib/time.js`. Build a `Map` from each date to an empty array, ignore entries without `endedAt` or with `deletedAt`, append by `fmtDate(entry.startedAt)`, sort each array by `new Date(startedAt)`, and return the date groups in the original `dates` order.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test extension/src/lib/time.test.js`

Expected: PASS, including empty dates and chronological order.

- [ ] **Step 5: Commit the helper**

```powershell
git add extension/src/lib/time.js extension/src/lib/time.test.js
git commit -m "Add daily work review grouping"
```

### Task 2: Replace the SVG timeline with daily review markup

**Files:**
- Modify: `extension/src/options/options.html`
- Modify: `extension/src/options/options.js`

**Interfaces:**
- Consumes: `dailyReviewData`, the existing report `series` dates, `S.entries`, `S.projects`, `fmtHM`, `fmtClock`, `db.durationSec`, `esc`, and `renderMarkdownPreview`.
- Produces: `#dailyReview` HTML containing one `.daily-review-day` per selected review date and one `.daily-review-entry` per completed, non-deleted entry.

- [ ] **Step 1: Replace the timeline section in HTML**

In `extension/src/options/options.html`, replace the `rep-time` heading and `#timeline` body with:

```html
<h2 class="sec" data-collapse="rep-review">
  <span class="mark">[-]</span> 每日工作回顧 <span id="reviewLabel" class="mute"></span>
</h2>
<div id="dailyReview" data-collapse-body="rep-review"></div>
```

- [ ] **Step 2: Add the daily review renderer in `options.js`**

Import `dailyReviewData` from `../lib/time.js`. Add `renderDailyReview(groups)` that:

1. Maps weekday numbers to `日、一、二、三、四、五、六`.
2. Renders each group with the date, weekday, sum of `db.durationSec(entry)`, and entry count.
3. Renders empty groups as `這天沒有工作紀錄`.
4. Renders each entry in start-time order with `fmtClock(startedAt)–fmtClock(endedAt)`, a project color swatch, project name, description or fallback title, and duration.
5. Includes `renderMarkdownPreview(entry.notes)` when notes exist.
6. Uses `esc` for all plain text and never injects raw entry content.

Use this shape for each entry:

```html
<div class="daily-review-entry">
  <div class="daily-review-time num">09:00–10:30</div>
  <span class="daily-review-swatch" style="background:#..." aria-hidden="true"></span>
  <div class="daily-review-main">
    <div class="daily-review-title">工作內容 <span class="cap">專案名稱</span></div>
    <div class="daily-review-notes">Markdown preview</div>
  </div>
  <div class="daily-review-duration num">1h 30m</div>
</div>
```

- [ ] **Step 3: Replace timeline rendering in `renderReport()`**

Remove the `timelineData` / `timelineSVG` rendering block. Keep the existing `series` used by the line chart. Derive review dates from `series.map((item) => item.date).slice(customBounds ? 0 : -14)`, call `dailyReviewData(rows, reviewDates)`, and assign `$('dailyReview').innerHTML = renderDailyReview(groups)`. Keep `lineLabel` and `byDay` behavior unchanged.

- [ ] **Step 4: Update report panel grouping**

In `groupReportPanels()`, replace `['rep-time', 'timeline', 'report-panel-time']` with `['rep-review', 'dailyReview', 'report-panel-review']`.

- [ ] **Step 5: Run syntax and focused tests**

Run: `node --check extension/src/options/options.js; node --test extension/src/lib/time.test.js`

Expected: no syntax errors and all time tests pass.

### Task 3: Make the report single-column and style the review for readability

**Files:**
- Modify: `extension/src/options/options.css`

**Interfaces:**
- Consumes: `.report-panel-review`, `.daily-review-day`, `.daily-review-entry`, and existing report panel classes.
- Produces: a readable single-column report with no horizontal scrolling for work content.

- [ ] **Step 1: Write the CSS changes**

Change the report grid to one column:

```css
#p-report {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: 0;
}
#p-report > .report-panel-health,
#p-report > .report-panel-donut,
#p-report > .report-panel-review,
#p-report > .report-panel-wide { grid-column: 1; }
```

Remove the old `.report-panel-donut { grid-column: 1; }` / `.report-panel-time { grid-column: 2; }` split behavior and any `timeline`-specific sizing rules.

Add daily review styles with a full-width day header, clear date metadata, a three-part row (`time`, `main`, `duration`), a left project color bar or swatch, readable 14px content, `min-width: 0`, and wrapping for notes. On narrow screens, stack the duration below the title without horizontal scrolling.

- [ ] **Step 2: Verify CSS formatting**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Run the full test suite**

Run: `node --test extension/src/lib/*.test.js; node --check extension/src/options/options.js`

Expected: all tests pass and syntax check exits successfully.

### Task 4: Integrate, manually verify, and publish

**Files:**
- Modify: none beyond Tasks 1–3.

- [ ] **Step 1: Inspect the final diff**

Run: `git diff HEAD~3 -- extension/src/lib/time.js extension/src/lib/time.test.js extension/src/options/options.html extension/src/options/options.js extension/src/options/options.css`

Confirm the old `timeline` DOM target and `timelineSVG` render call are gone from the options page, and `extension.zip` is not staged.

- [ ] **Step 2: Reload the unpacked extension and manually check the report**

In Chrome Extensions, reload the unpacked extension from `C:\Users\7157\Documents\Personal\TodoTracker\extension`. Open 報表 and verify:

- 專案時間分布、每日工作回顧、每日工時趨勢各自佔滿報表寬度。
- 每日工作回顧的工作內容可直接閱讀，不需要看 SVG 小字或 tooltip。
- 工作依時間排序，專案色彩可辨識，耗時正確。
- 空白日期顯示「這天沒有工作紀錄」。
- 本週、全部與自訂區間都會更新每日區塊與空白日期。
- Markdown 備註仍正常顯示且沒有 XSS raw HTML。

- [ ] **Step 3: Commit the integrated feature**

```powershell
git add extension/src/lib/time.js extension/src/lib/time.test.js extension/src/options/options.html extension/src/options/options.js extension/src/options/options.css
git commit -m "Replace timeline with daily work review"
```

- [ ] **Step 4: Push and verify repository state**

Run: `git push origin main; git status --short --branch`

Expected: `main` matches `origin/main`; only the pre-existing untracked `extension.zip` remains.

## Out of Scope

- 不重做專案 donut 的資料模型或互動鑽取功能。
- 不新增完整月曆格狀視圖。
- 不修改 entries 儲存格式、CSV 欄位或資料庫 migration。
- 不處理 Orca 的外部 `post tool use hook failed` runtime 問題。
