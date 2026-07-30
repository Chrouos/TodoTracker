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

**`db.js` 是唯一的 I/O 邊界。** 之後要接 Supabase 只需要換掉這個檔的實作，popup 和 options 一行都不用改。欄位命名已經跟 `supabase/schema.sql` 對齊（`clientEntryId` 就是給離線佇列做冪等 upsert 用的）。

## 資料

全部在本機 `chrome.storage.local`，沒有任何網路請求。換機器前到 **設定 → 匯出備份 JSON**。
