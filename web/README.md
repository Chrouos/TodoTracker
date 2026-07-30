# TodoTracker — 網頁端

Next.js 16（App Router）。**沒有後端、沒有資料庫、沒有登入。**

資料真正的家是 Chrome 擴充的 `chrome.storage.local`。網頁只是第二個介面，
透過 `chrome.runtime.sendMessage` 打進擴充讀寫。所以：

- 網頁建立的專案 → 擴充 popup 的下拉立刻出現
- 擴充按下的計時 → 網頁 5 秒內同步顯示
- 關掉網頁不影響計時（計時狀態在擴充裡）

## 跑起來

```bash
cd web
npm install
npm run dev
```

開 <http://localhost:3000>。右上角要顯示「已連線擴充」才代表橋接成功。

## 前置條件

1. `extension/` 已在 `chrome://extensions` 載入且**啟用**
2. 擴充 ID 是 `lpjffffopipgkkodjjljkhnfdpppbgml`
   （由 manifest 的固定 `key` 決定，重新載入不會變）
3. 網址必須是 `localhost` 或 `127.0.0.1` —— 擴充的 `externally_connectable` 只信任這兩個來源

要換 ID 的話建 `.env.local`：

```
NEXT_PUBLIC_EXTENSION_ID=你的擴充ID
```

## 頁面

| 路徑 | 內容 |
|---|---|
| `/` | 計時面板、今日/本週統計、本週依專案、最近紀錄（可一鍵續計時） |
| `/log` | **工作日誌** —— 按日期分組，每筆直接就地補寫紀錄，移開游標就存 |
| `/projects` | 專案 CRUD（名稱、顏色、封存）+ 標籤管理 |
| `/todos` | Todo CRUD、可直接對某個 todo 計時、累積時數 |
| `/reports` | 區間報表、依專案與每日長條、明細編輯、手動補登、CSV |
| `/settings` | 閒置門檻 / 每筆進位、備份匯出匯入 |

## 結構

```
app/            App Router 頁面（全部 'use client'，資料來自擴充）
components/     TopBar / TimerPanel / EntryDialog / Disconnected
lib/
├── bridge.ts   sendMessage 封裝，唯一的 I/O 邊界
├── store.tsx   React Context：getAll 輪詢 + act() 寫入後自動 refresh
├── time.ts     格式化與統計（跟擴充的 time.js 同一套邏輯）
└── types.ts    對應 extension/src/lib/db.js 的欄位
app/globals.css DESIGN.md 的 CSS 變數
```

## 之後要接雲端

只需要換掉 `lib/bridge.ts`（改打 Supabase）跟擴充的 `src/lib/db.js`。
頁面與元件完全不用動 —— 兩邊的欄位命名早就跟 `supabase/schema.sql` 對齊了。
