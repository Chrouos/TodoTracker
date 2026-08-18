# 報表 Todo Tracker 設計

## 背景

報表目前有專案每日趨勢圖與專案 × 日期 heatmap。這兩者都回答專案投入時間，但還沒有呈現 Todo 從建立到完成的生命週期。使用者希望知道每個 Todo 何時開始、何時結束，以及實際投入了多少工時，並能點開查看細節。

## 目標

- 保留現有專案趨勢圖與 heatmap。
- 在 heatmap 下方新增 Todo tracker。
- 以 Todo 的 `openedAt` 到 `completedAt`／目前時間呈現生命週期 bar。
- 未完成 Todo 的終點每分鐘自動更新。
- 點擊 Todo bar 後顯示 Todo 狀態、專案、生命週期時間、區間實際工時與工作紀錄。
- 將 heatmap 與 tracker 的 hover 強調從厚重黑框改為淡色、可讀的視覺。

## 圖表與資料定義

### 日期軸

Tracker 沿用目前報表專案趨勢使用的 `trendDates`：

- 今日：今天加前五天，避免只有單一欄位。
- 本週：週一至週日。
- 本月、自訂與全部：沿用目前報表的日期範圍。

橫軸每格代表一個日曆日，但 bar 的左右位置會依實際時間計算，因此同一天內建立或完成的時間仍可在 hover 與細節中辨識。

### Todo 生命週期

- 起點使用 Todo 的 `openedAt`。
- 已完成 Todo 的終點使用 `completedAt`。
- 未完成 Todo 的終點使用目前時間。
- 只顯示生命週期與目前報表日期窗口有交集，bar 超出窗口的部分裁切在圖內。
- 排除 `archived` Todo；保留 `todo`、`doing` 與 `done`。

### 實際工時

點開 Todo 後，從選定報表日期窗口內、`taskId` 相同且未刪除的已結束 entries 計算實際工時。跨越日期窗口邊界的 entry 只計算落在窗口內的重疊秒數。細節同時列出每段 entry 的開始、結束、工時與備註摘要。

## 使用者介面

Tracker 由日期標頭、Todo 列與詳細區塊組成：

- 每列左側顯示 Todo 名稱、狀態與專案。
- 右側以淡色 bar 顯示生命週期，bar 內顯示區間工時。
- 未完成 bar 使用進行中樣式，已完成 bar 使用完成樣式。
- hover 顯示白底資訊卡：Todo 名稱、狀態、起訖時間與區間實際工時。
- click／鍵盤操作 bar 會在 tracker 下方展開詳細區塊；再次點擊同一列或關閉按鈕可收起。
- 沒有符合範圍的 Todo 時顯示明確空狀態，不顯示空圖框。
- Tracker 本體可垂直捲動，避免 Todo 數量增加時推長整個報表；日期軸可在窄螢幕水平捲動。

Heatmap 保持原本的專案 × 日期資料與 tooltip，但 hover cell 改用淡色 project color 的 outline，避免黑色粗框造成視覺干擾。

## 自動更新

報表建立 tracker 後啟動一個 60 秒 interval。每次更新只重繪 tracker 與目前選取的 Todo 詳細區塊，不重繪整個報表；切換報表區間時重新建立資料與 interval 狀態。

## 技術方案

- 新增純函式 `extension/src/lib/todo-tracker.js`，負責日期窗口、生命週期交集、entry 工時裁切與 Todo 排序資料。
- 在 `options.js` 新增 tracker render、hover、click、詳細區塊與 60 秒刷新狀態，沿用現有 `S.tasks`、`S.entries` 與報表 `trendDates`。
- 在 `charts.js` 保持現有專案圖與 heatmap 生成介面，不將 Todo tracker 塞進 SVG；tracker 使用語意化 HTML button，便於鍵盤操作與點擊細節。
- 在 `options.css` 新增 tracker layout、bar、tooltip 與 scroll 樣式，並調整 heatmap hover outline。

## 錯誤與相容性

- 缺少或無效的 `openedAt`／`completedAt` 不應讓整個報表失敗；該 Todo 只在可推導出有效窗口時顯示。
- 無 entries 的 Todo 仍顯示生命週期，實際工時顯示 `0m`。
- 不修改既有 entry、timer、Todo 保存格式，也不新增資料庫欄位。
- 不改變現有 heatmap 的數值計算與日期範圍。

## 不在本次範圍

- 不顯示 Todo 的多段 reopen 歷史；現有資料只有目前 `openedAt`、`completedAt` 與 `reopenCount`，本次呈現目前生命週期。
- 不提供拖曳修改 Todo 日期。
- 不把 Todo tracker 改成替代 heatmap。
