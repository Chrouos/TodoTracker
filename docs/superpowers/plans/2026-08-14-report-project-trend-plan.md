# 報表專案分布與每日趨勢融合實作計畫

## Objective and scope

將 extension options 報表的專案甜甜圈與每日折線趨勢整合為同一個「專案時間與每日趨勢」區塊：上方堆疊面積圖、下方專案 × 日期 Heatmap，兩者共享日期 hover、專案聚焦與既有日期範圍。保留 Todo 健康度、每日工作回顧、時間軸、KPI、CSV 與專案樹資料行為。

Out of scope:

- popup 不加入大型報表。
- 不引入第三方圖表套件。
- 不改動 entries、projects 或時間計算的資料格式。
- 不重做每日工作回顧與時間軸。

## Technical baseline

- `extension/src/options/options.js` 的 `renderReport()` 目前分別呼叫 `renderDonut(rows)` 與 `lineSVG(series)`。
- `extension/src/lib/charts.js` 目前輸出 SVG 字串，已有 `donutSVG()`、`lineSVG()`、`timelineSVG()`。
- 報表資料使用 `inRange()`、`db.durationSec()`、`S.projects`，專案父子累加沿用 `rollup()` 與目前甜甜圈的 focus 語意。
- 測試是可直接執行的 Node `.mjs` contract tests，沒有 npm test runner。

## Ordered implementation stages

### 1. RED：建立專案趨勢資料與 SVG contract tests

Files:

- Add `extension/test/report-trend.test.mjs`

Tests first:

- `buildProjectTrendData()` 使用同一組日期排序，輸出每日總工時。
- 專案直接紀錄與子專案紀錄依目前 focus 語意分桶，不重複計入每日總工時。
- 未分類時間保留為獨立 bucket。
- Heatmap 色階最大值以顯示範圍內最大儲存格工時計算，零工時儲存格維持零值。
- `stackedAreaSVG()` 與 `heatmapSVG()` 輸出 `role="img"`、日期 `data-trend-date`、Heatmap 儲存格 project/date data attributes 與可讀 `<title>`。
- 空資料輸出合理 empty state，不產生 NaN 或無限座標。

Verification:

- `node extension/test/report-trend.test.mjs`；預期在新模組尚未存在時失敗。

### 2. GREEN：建立純資料模型與圖表 SVG renderer

Files:

- Add `extension/src/lib/project-trend.js`
- Modify `extension/src/lib/charts.js`

Implementation:

- `buildProjectTrendData({ entries, projects, dates, durationSec, focusId = null, limit = 8 })` 回傳 `dates`、`series`、`dailyTotals`、`maxCellSeconds` 與 `focusId`。
- Bucket 規則：無 focus 時以頂層專案、未分類為主；有 focus 時以 focus 的直接子專案、focus 自身直接紀錄與未分類為主；子孫時間歸入對應 bucket。
- 超過 `limit` 的 bucket 合併為「其他」，但 tooltip 仍列出該日合併前的專案細節。
- `stackedAreaSVG(data)` 依日期與 series 產生堆疊面積，加入每日透明 hover zone、日期與 segment tooltip。
- `heatmapSVG(data)` 產生專案列與日期欄，儲存格顏色由 `maxCellSeconds` 正規化，加入精確時間與日佔比 tooltip。
- 所有 user-facing label 先 escape；色彩使用 project color，合併 bucket 使用既有灰色。

Verification:

- `node extension/test/report-trend.test.mjs` 轉為 GREEN。
- `node --check extension/src/lib/project-trend.js`
- `node --check extension/src/lib/charts.js`

### 3. RED/GREEN：將融合圖表接入 options report

Files:

- Modify `extension/src/options/options.html`
- Modify `extension/src/options/options.js`
- Modify `extension/src/options/options.css`
- Extend `extension/test/options-layout.test.mjs`

Implementation:

- 將現有專案分配與每日趨勢兩個主要 panel 改為一個融合 panel，保留每日工作回顧與時間軸。
- 新增 `projectTrend` 容器與 `projectHeatmap` 容器；標題、日期範圍 label 與收合行為維持既有報表語彙。
- `renderReport()` 用同一組 `rows` 與同一組 `dates` 建立 `buildProjectTrendData()`，輸出兩張 SVG；既有 donut/line 的資料不再各自重算主畫面。
- 新增共用的 report focus state：專案樹 focus 與圖表專案 focus 可清除、可重新 render；不影響既有 donut drill-down 的資料語意。
- 對 `projectTrend` 與 `projectHeatmap` 使用事件 delegation：`pointerover`、`pointerout`、`focusin`、`focusout` 對同日期元素同步加入／移除 `is-hovered`；點擊 project data 聚焦；Escape 或點擊全部清除 focus。
- 增加動態 tooltip／selection summary，至少顯示日期、總工時、專案工時與日佔比；鍵盤 focus 可讀取同樣資訊。
- CSS 讓兩張圖垂直排列，Heatmap 在窄畫面可水平捲動，保留 report panel 收合與既有 responsive 規則。

Verification:

- `node extension/test/options-layout.test.mjs`
- `node extension/test/report-trend.test.mjs`
- `node --check extension/src/options/options.js`

### 4. 清理舊主圖表接線並保留相容性

Files:

- Modify `extension/src/options/options.js`
- Modify `extension/src/options/options.css` only where obsolete donut/line layout rules conflict with the new panel.

Implementation:

- 移除主報表對 `renderDonut()` 與獨立 `lineSVG()` 的呼叫與不再使用的 DOM 依賴；若其他功能仍需要 donut drill-down，保留純函式但不重複顯示。
- 保留時間軸、每日回顧、range controls、KPI、CSV 與 collapse 初始化。
- 確認 report panel grouping 不會重複包裝或遺留空 panel。

Verification:

- `rg -n "byProject|byDay|renderDonut|lineSVG" extension/src/options/options.js extension/src/options/options.html`
- `git diff --check`

### 5. 全量驗證與手動驗收

Commands:

- `node extension/test/report-trend.test.mjs`
- `node extension/test/options-layout.test.mjs`
- `node extension/test/task-hierarchy.test.mjs`
- `node extension/test/todo-priority.test.mjs`
- `node --check extension/src/lib/project-trend.js`
- `node --check extension/src/lib/charts.js`
- `node --check extension/src/options/options.js`
- `git diff --check`

Manual acceptance:

- 本週、今天、本月、全部、自訂區間切換後，上下面積圖與 Heatmap 日期一致。
- Hover 日期時兩圖同步 highlight，tooltip 總和與 KPI／entry 秒數一致。
- 點擊專案列後只顯示該專案焦點；清除後恢復全部。
- 有父子專案、未分類、單日資料、無資料、超過 8 個專案時畫面可讀且不出現 NaN。
- 報表收合、每日回顧、時間軸、CSV、Todo 與既有 popup 功能不回歸。

## Integration and compatibility constraints

- 以目前 report 的 local time/date grouping 為準，不自行改用 UTC。
- 不改寫既有 `rollup()`、`timelineData()` 或 entry duration 的公開行為。
- SVG 互動不能只依賴顏色；必須有 tooltip、文字或 focus 狀態。
- 避免將完整 entry 陣列直接嵌入 DOM data attribute；tooltip 使用預先聚合的資料。
