# TodoTracker — Chrome 擴充

零 build step。改完檔案按「重新載入」就生效。

## 安裝

1. Chrome 開 `chrome://extensions`
2. 右上角開啟「開發人員模式」
3. 「載入未封裝項目」→ 選這個 `extension/` 資料夾
4. 釘選到工具列

## 用法

| 動作 | 怎麼做 |
|---|---|
| 開始 / 停止 | 點擴充圖示 → `[>] 開始計時`；或在 popup 內按空白鍵 |
| 換專案、改描述 | 計時中直接改，不用重開 |
| 計時中隨手記 | 計時一開始，「工作紀錄」框就出現，打字停 0.5 秒自動存；`[時間]` 插入 HH:MM |
| 收工補寫 | 停止計時後會自動跳出輸入框，`Ctrl+Enter` 存 |
| 補寫舊的紀錄 | 「最近」列表每列的 `[ ]`（已寫過會變 `[x]`） |
| 對某個 todo 計時 | Todo 分頁 → 該列的 `[>]` |
| 重複前一段工作 | 「最近」列表的 `[>]` |
| 報表 / CSV / 設定 | popup 右上角 `[管理]` |

計時中圖示會顯示分鐘數（每分鐘更新一次，那是 MV3 alarm 的最小週期）。

## 語言

設定頁可選擇 `繁體中文`、`English`、`日本語`，或使用 `依瀏覽器語言` 自動判斷。支援的自動判斷結果為 Traditional Chinese、Japanese，其他語言使用 English。

## 結構

```
manifest.json
src/
├── background.js       MV3 service worker：badge、alarm、閒置偵測
├── lib/
│   ├── db.js           唯一的資料存取層（chrome.storage.local）
│   └── time.js         時間格式化與區間計算
├── styles/tokens.css   DESIGN.md 的 CSS 變數
├── popup/              計時器 + Todo
└── options/            報表 / 專案 / 標籤 / 紀錄 / 設定
```

## 兩個關鍵設計

**MV3 service worker 閒置約 30 秒就被殺掉。** 所以計時器不在記憶體累加秒數，只把 `startedAt` 時間戳存進 `chrome.storage.local`，經過時間一律現算。SW 被殺再醒來也不會掉秒。

```bash
node --test src/lib/*.test.js test/*.test.mjs
```

長筆記捲動位置的瀏覽器回歸測試需安裝 Google Chrome、Playwright 與 `web/` 的開發依賴，從專案根目錄執行：

```bash
node --test extension/test/autogrow-scroll.browser.mjs
```

若 Playwright 安裝在其他目錄，可用 `PLAYWRIGHT_MODULE` 環境變數指定其模組路徑。測試涵蓋擴充功能與網頁版的整頁、視窗內與文字框內捲動，以及刪除內容後的高度調整。

## 日曆規劃與實際工作

管理頁的「日曆」提供月、週、日與清單檢視，預設顯示本週。週／日檢視把「計畫」與「實際」分成兩欄；專案顏色沿用專案設定，計畫使用外框，實際計時使用實色。

- 安排可以獨立存在，也能連結 Todo；同一 Todo 可安排多天、多個時段。
- 點空白時段或框選新增安排，拖曳計畫調整時間、拖上下邊緣調整長度，每次以 15 分鐘為單位。表單可輸入到分鐘，並提供相同的時間調整功能。
- 支援全天及跨日安排。全天的結束日期包含所選當天，不計入預計工時；跨日定時安排以表單修改。月檢視可拖曳整筆安排移動日期。
- 點安排的「開始計時」會使用共用計時器；可在管理頁、popup 或 web 停止。分次計時的紀錄保留安排來源，安排詳情可查看合計實際時間。
- 刪除安排會解除來源連結，保留實際計時紀錄。Todo 截止日獨立標示，不算計畫時數。
- JSON 備份包含 `calendarPlans`，可匯入舊版 version 1 備份；要保留新日曆資料，還原時請使用含日曆功能的版本或更新版本。

現有「排程」繼續負責定期建立 Todo，日曆第一版沒有重複事件、安排通知或外部行事曆同步。

日曆瀏覽器驗證使用固定測試資料與模擬 storage，不會改動使用者紀錄。需有 Playwright 與 Google Chrome，執行：

```bash
node --test extension/test/calendar.browser.mjs
```

## 資料

全部在本機 `chrome.storage.local`，沒有任何網路請求。換機器前到 **設定 → 匯出備份 JSON**。
