# 報表區間與摘要高度修正設計

## 目標

修正 extension 報表的專案趨勢圖：本週固定呈現週一至週日，今日保留往前 5 天的趨勢參考；hover 日期前後「區間總計」區塊維持固定高度，不推動下方圖表。

## 現況與根因

`renderReport` 的統計資料 `rows` 依目前選取區間計算，但趨勢圖的日期軸另外由 `lineFrom` 與目前時間決定。今日會往前補 6 天，而本週的 `lineTo` 一律是現在時間，因此本週在週一只建立一個日期，圖表看起來像只有今天。

`setTrendHover` 會在未 hover 的區間摘要與 hover 日期摘要之間替換 HTML。未 hover 摘要通常兩行，hover 摘要包含選取專案、日期與當日明細，通常三行；目前 `.project-trend-tooltip` 只有 `min-height`，所以內容增加時容器變高並推動下方內容。

## 設計

### 趨勢日期軸

- `today`：日期軸從今天往前 5 天到今天，共 6 天；KPI 與區間總計仍只計算今天的 `rows`。
- `week`：日期軸固定從本週開始日到本週開始日加 6 天，共 7 天；未來日期保留並以 0 秒呈現。KPI 與區間總計仍只計算目前時間以前、且落在本週的工作紀錄。
- `month`、`all` 與 custom 維持既有行為，避免擴大本次修正範圍。

為了讓本週未來日期正確補零，`dailySeries` 的來源資料仍只使用已結束且未刪除的紀錄，日期軸則使用完整的 week bounds。

### Hover 摘要

`.project-trend-tooltip` 固定容納三行摘要，並設定 `box-sizing: border-box`、固定 `height` 與 `overflow: hidden`。摘要的明細行禁止換行並使用 `text-overflow: ellipsis`；超出內容被截斷，但 hover 互動與圖表位置不變。

## 測試

先新增趨勢日期範圍的純函式測試，涵蓋今日 6 天與本週 7 天 bounds，再把 `renderReport` 改為使用該規則。另新增 CSS／來源契約測試，確認 tooltip 使用固定高度、禁止明細換行與省略號。

驗證 extension 的既有 `.mjs` 與 `.js` 測試、focused range test、options layout contract、`git diff --check`，並以人工檢查確認今日／本週按鈕與 hover 前後版面。

## 範圍

本次只修改 extension options 報表的趨勢日期軸與 tooltip 版面，不改 KPI 統計定義、資料儲存、Web 報表頁、heatmap 資料計算或其他報表元件。
