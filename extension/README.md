# TodoTracker

TodoTracker 是一個放在 Chrome 工具列的工作追蹤工具，集中處理：

- 工作時間記錄
- Todo 與專案管理
- 工作筆記與 Markdown
- 報表與工作回顧
- 固定週期排程與提醒

目前版本：`0.3.3 beta`

## 功能總覽

### Popup：快速開始工作

從 Chrome 工具列點開 TodoTracker，就能完成日常操作：

- 一鍵開始／停止計時
- 計時中切換專案、Todo、標籤與工作描述，不需要重開計時
- 計時中直接寫工作紀錄，內容會自動儲存
- 插入目前時間，方便記錄工作節點
- 偵測到閒置後選擇保留時間，或扣除閒置時間
- 停止計時後補寫工作紀錄
- 從最近紀錄重新開始相似工作
- 查看今日／本週累積時間與紀錄數
- 複製今日工作總結

Popup 也提供 Todo 分頁，可以快速新增 Todo，或進一步設定專案、父任務、優先級、截止日期、截止時間與篩選條件。

### 管理頁：完整工作台

點擊 Popup 右上角的「管理」即可開啟完整管理頁。管理頁分成以下功能區：

#### 報表

- 查看今日、本週、本月、全部或自訂日期區間
- 顯示總工時、紀錄數、平均每筆時間與實際工作天數
- 以清單或日曆回顧每天的工作紀錄
- 查看需要補筆記、未分類或未連結 Todo 的紀錄
- 查看專案工時趨勢、熱度圖與 Todo 完成進度
- 從報表直接跳到相關專案、Todo 或工作紀錄
- 匯出 CSV

#### 計時

- 管理目前正在進行的計時
- 編輯工作描述、專案、Todo、標籤與工作筆記
- 以整篇純文字編輯，保留原始換行、連續空白與空白行，支援 Markdown 語法
- 編輯區隨內容增高，只保留單一外框；可跨段落選取、貼上與修改
- 常用格式放在工具列，其餘收進「更多」；粗體、標題、清單可再次按下取消
- 關閉「自動換行」可橫向閱讀寬表格；需要時切到預覽，點預覽文字即可回到編輯
- 預覽保留段內換行與空白；勾選 Markdown 待辦時，只修改該項的勾選標記
- 停止計時時選擇是否一併完成掛上的 Todo

#### 專案

- 建立多層專案樹
- 設定專案顏色與父專案
- 編輯、封存或刪除專案
- 為專案建立帶時間軸的目標／筆記
- 查看專案總工時、直接工時、Todo、工作紀錄與每日工作趨勢
- 刪除專案時保留工作紀錄，並將相關資料移為未分類

#### Todo

- 建立與編輯 Todo
- 建立父子任務與巢狀 Todo
- 設定狀態：待辦、進行中、已完成
- 設定優先級：緊急、高、一般、低
- 設定截止日期與截止時間
- 為 Todo 加上 Markdown 備註
- 依專案、狀態與優先級篩選
- 查看開單時間、結案時間與累積工時
- 直接從 Todo 開始計時

#### 紀錄

- 搜尋工作描述與工作筆記
- 依專案與日期區間篩選
- 手動補登工作紀錄
- 編輯開始時間、結束時間、專案、Todo 與筆記
- 展開或收合工作紀錄
- 複製今日或指定區間的 Markdown 工作總結
- 匯出目前篩選結果為 CSV

#### 排程

- 設定每天或指定星期重複的工作
- 到指定時間自動建立 Todo
- 預先設定專案、優先級與備註
- 設定當天截止時間
- 在截止前指定分鐘數發送 Chrome 通知
- 暫停／重新啟用排程
- 手動立即檢查一次排程

例如：每個平日 09:00 自動建立「填寫工作日誌」，設定 17:30 截止，提前 10 分鐘提醒。

#### 標籤

- 建立、編輯與刪除標籤
- 設定標籤顏色
- 在計時與工作紀錄中套用多個標籤

#### 設定

- 語言：依瀏覽器、繁體中文、English、日本語
- 閒置提醒時間
- 每筆紀錄的進位方式
- 筆記編輯方式：工具列編輯器或 Markdown 原始碼
- 匯出／匯入完整 JSON 備份
- 清空本機資料

## 安裝

1. 開啟 Chrome，前往 `chrome://extensions`
2. 開啟右上角的「開發人員模式」
3. 點選「載入未封裝項目」
4. 選擇這個 `extension/` 資料夾
5. 將 TodoTracker 固定到 Chrome 工具列

這個專案沒有 build step。修改檔案後，在 `chrome://extensions` 點擊 TodoTracker 的「重新載入」即可套用變更。

## 語言

目前支援：

- `繁體中文`
- `English`
- `日本語`
- `依瀏覽器語言`：繁體中文與日文會自動使用對應語言，其餘語言使用 English

## 資料與隱私

資料預設儲存在這台瀏覽器的 `chrome.storage.local`，不會自動上傳到雲端服務。換機器、重裝 Chrome 或清除擴充功能前，請先到「設定」匯出 JSON 備份。

TodoTracker 也提供給本機 web app 使用的 bridge，但只接受 `localhost` 與 `127.0.0.1` 的連線。

## 專案結構

```text
manifest.json
src/
├── background.js       MV3 service worker：計時 badge、排程、閒置偵測、通知與 localhost bridge
├── popup/              工具列 Popup：快速計時與 Todo
├── options/            管理頁：報表、計時、專案、Todo、紀錄、排程、標籤、設定
├── lib/db.js           唯一的資料存取層
├── lib/                時間、Todo、專案樹、報表、Markdown 與圖表邏輯
└── styles/tokens.css   共用設計 token
```

`background.js` 不在記憶體中累加秒數；計時器只保存 `startedAt` 時間戳，因此 MV3 service worker 被暫停後仍能正確計算時間。所有 Popup 與管理頁的資料讀寫都集中經過 `src/lib/db.js`。

## 開發與測試

在專案根目錄執行：

```bash
node --test extension/src/lib/*.test.js extension/test/*.test.mjs
```

如果目前工作目錄已經是 `extension/`，請改用：

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

可用 `PLAYWRIGHT_MODULE` 指定 Playwright 模組路徑；設定 `CALENDAR_SCREENSHOTS=1` 會將週／月檢視截圖存入 `docs/images/calendar/`。

`node --test extension/test/calendar-mv3.browser.mjs` 會以 Playwright 的 Chromium 載入真正的 MV3 extension，驗證 service worker、CSP 與安排儲存。需先執行 `playwright install chromium`；測試使用獨立的暫存 profile。
