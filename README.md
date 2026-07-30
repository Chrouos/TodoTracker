# TodoTracker

一鍵計時的專案時間追蹤。Chrome 擴充負責計時，Next.js 網頁負責管理與報表，**沒有後端、沒有登入**。

資料存在擴充的 `chrome.storage.local`，網頁只是第二個介面，透過 `chrome.runtime.sendMessage` 讀寫同一份資料。

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Chrome Extension (MV3) │        │  Next.js 16 (App Router) │
│  ─ popup: 計時 + Todo   │◄──────►│  ─ 總覽 / 工作日誌       │
│  ─ options: 管理與報表  │ bridge │  ─ 專案樹 / Todo / 報表  │
│  ─ storage: 唯一資料源  │        │  ─ 設定與備份            │
└─────────────────────────┘        └──────────────────────────┘
```

## 功能

**計時** — 一鍵開始／停止、空白鍵快捷、計時中可直接換專案與描述不用重開。MV3 service worker 會被系統回收，所以狀態只存 `startedAt` 時間戳、經過時間現算，不會掉秒。

**工作紀錄** — 計時中隨時寫，打字停 0.5 秒自動存；`[時間]` 按鈕插入 `HH:MM` 方便一行一行記事情發生的時間。停止時整份落地到那筆紀錄，之後也能補寫。

**專案樹** — 專案可以無限往下掛子專案，統計向上累加。圓餅圖能一層一層鑽進去看分佈。

**Todo** — 掛在專案下，可以直接對某個 todo 計時並累積時數，有到期日與逾期提示。

**報表** — 甜甜圈（專案分配、可鑽取）、折線（每日趨勢）、時間軸（日曆式，幾點到幾點）。全部是手寫 SVG，沒有圖表相依套件。

**一鍵複製** — 把當日或整個區間的工作紀錄整理成 Markdown 丟進剪貼簿，貼到日報或筆記軟體。

**匯出** — CSV（含 BOM，Excel 直接開）與 JSON 備份還原。

## 目錄

```
DESIGN.md         設計系統（改編自 getdesign.md 的 OpenCode 分析）
docs/             架構規劃
extension/        Chrome 擴充（零 build step）
web/              Next.js 網頁
supabase/         之後要上雲端的 Postgres schema + RLS（尚未接上）
```

## 跑起來

**擴充**：`chrome://extensions` → 開發人員模式 → 載入未封裝項目 → 選 `extension/`

**網頁**：

```bash
cd web
npm install
npm run dev
```

開 <http://localhost:3000>，右上角顯示「已連線擴充」就成功了。

擴充 ID 由 manifest 裡的固定 `key` 決定（`lpjffffopipgkkodjjljkhnfdpppbgml`），重新載入不會變。`extension-key.pem` 是對應的私鑰，**不進版控**，弄丟的話 ID 會變，網頁要重設 `NEXT_PUBLIC_EXTENSION_ID`。

詳細說明看 [`extension/README.md`](extension/README.md) 與 [`web/README.md`](web/README.md)。

## 之後要接雲端

`supabase/schema.sql` 已經寫好多人 team 的 schema 與 RLS（含專案樹的 `parent_id`、離線佇列用的 `client_entry_id`）。要接的話只需要換掉兩個檔案的實作：

- `extension/src/lib/db.js`
- `web/lib/bridge.ts`

頁面與元件完全不用動 —— 兩邊的欄位命名早就跟 schema 對齊了。

## 授權

MIT
