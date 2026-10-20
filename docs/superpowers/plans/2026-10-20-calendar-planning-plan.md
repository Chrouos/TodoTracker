# Extension 日曆規劃與實際計時 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 extension 管理面板新增日曆，讓使用者安排每天的活動，並與實際計時對照。

**Architecture:** 使用獨立 `calendarPlans` 集合，選填關聯 Todo，以 `planId` 連到既有 timer／entries。純日期、驗證與排版資料由 calendar domain module 處理；日曆 controller、view、pointer 互動分檔，透過 options adapters 使用既有資料存取、Markdown、計時及紀錄編輯流程。web 僅更新資料契約與計時來源顯示。

**Tech Stack:** Chrome Manifest V3、原生 ES modules、HTML/CSS、Node test runner；既有 Next.js 16／React 19／TypeScript；瀏覽器驗證沿用可用的 Playwright，不增加產品依賴或 build step。

**Spec:** `docs/superpowers/specs/2026-10-20-calendar-planning-design.md`，已於 2026-10-20 核准。

## Global Constraints

- 「預設顯示本週，以設定中的 `weekStartsOn` 決定週起始日。」
- 「所有時間範圍採半開區間 `[start, end)`，午夜結束不會在隔天產生空白片段。」
- 「全天不換算成 24 小時計入工時。」
- 「背景重新整理不得清空未儲存表單或中斷拖曳。」
- 「本次不新增雲端同步與 Supabase schema；資料仍保存在瀏覽器，沿用既有 web bridge。」
- 「第一版不新增 web 日曆頁面，也不在 web 複製未使用的日曆演算法。」
- 計畫支援獨立存在或關聯 Todo；月／週／日／清單四種檢視、全天／跨日、15 分鐘拖曳、分鐘精度表單均屬本次交付。
- 使用兩格縮排、分號與單引號；UI 文案支援繁中、英文、日文，日期依當地時區。
- 工作區已有未提交變更，禁止 reset、覆寫或順手提交使用者其他修改。執行時使用 using-git-worktrees 檢查隔離方式，確保現有修改可用且完整保留，不能只從 HEAD 建分支後漏掉現有修正。
- 外部行事曆、週期事件、提醒通知、雲端、歷史紀錄手動配對均不在範圍；既有 schedules 不轉成未來安排。

## Review Focus

1. 舊 timer 的 500ms 延遲筆記在新安排開始後才觸發，不能覆寫新 timer；Task 3 加入舊 entryId 寫入測試，Task 8 做瀏覽器切換驗證。
2. 使用者編輯表單或拖曳時，popup 寫入觸發 refresh，輸入、焦點與捲動必須保留；Task 6、7、8 覆蓋。
3. 相同當地鐘點在夏令時間切換時可能不存在或重複；Task 1 驗證日邊界與實際秒數，Task 6 驗證不存在鐘點不能默默改成另一時間。
4. 匯入中一筆無效安排不能覆蓋其他集合；Task 2 斷言 storage 完全未變，再測不存在關聯會清空而保留文字與時間。
5. 安排建立後 Todo 改專案、被完成或刪除，不能讓舊安排失蹤或啟動錯誤連結；Task 2、3、6 分別驗證快照、清理與表單選項。

## 技術基線與檔案責任

- `extension/src/lib/calendar.js`：純函式，日期、驗證、切段、可見模型、分道、拖曳結果；可依責任增設 `calendar-relations.js` 處理純關聯規則，禁止依賴 DOM／chrome。
- `extension/src/lib/db.js`：安排 CRUD、timer／entry 關聯、備份與刪除清理；沿用唯一 I/O 邊界。
- `extension/src/options/calendar.js`：controller、安排表單、更新協調與生命週期。
- `extension/src/options/calendar-view.js`：從模型產生四種檢視 DOM，安全插入使用者內容。
- `extension/src/options/calendar-interactions.js`：pointer selection／move／resize，preview、取消、提交，不直接寫 storage。
- `extension/src/options/calendar.css`：只負責日曆樣式，避免擴張既有 `options.css` 的未提交修改。
- `extension/src/options/options.html`／`options.js`：分頁接線、snapshot、既有 Markdown／計時／entry dialog adapters。
- `extension/src/background.js`、`web/lib/types.ts`：RPC 與型別相容；popup 與 web TimerPanel 顯示計時來源及解除連結。
- 新增測試：`extension/src/lib/calendar.test.js`、`extension/test/calendar-db.test.mjs`、`calendar-timer.test.mjs`、`calendar-rpc.test.mjs`、`calendar-view.test.mjs`、`calendar-interactions.test.mjs`、`calendar.browser.mjs`；browser 檔不納入一般 `*.test.mjs` glob。表單與 DOM 狀態以真實瀏覽器測試，Node 測試不依賴 Playwright。

## Task 1：日期、安排驗證與可見模型

**Files:** Create `extension/src/lib/calendar.js`, `extension/src/lib/calendar.test.js`。Reuse `extension/src/lib/time.js` 的 `fmtDate`、`startOfWeek`、`splitEntryByDay`，先確認傳回值；不修改既有報表演算法。

**Interfaces:**
- `normalizeCalendarPlan(input, { previous = null, id, now }) -> CalendarPlan`：`id`／`now` 由 db 提供，保留 previous.createdAt，trim 必填標題，驗證 kind 與日期，移除另一種時間欄位。失敗拋 `CalendarValidationError`，含 `code`、`field`，供三語 UI 顯示。
- `calendarRange(view, date, weekStartsOn = 1) -> { from: Date, to: Date, dates: string[] }`：date 為當地 `YYYY-MM-DD`；view 為 `month | week | day | agenda`。month 擴展至完整週，agenda 為 date 起七天。
- `navigateCalendarDate(view, date, direction) -> string`：direction 為 -1 或 1；月切換夾限至目標月末，週／清單移七天，日移一天。
- `buildCalendarModel(snapshot, { view, date, weekStartsOn = 1, projectId = 'all', showPlans = true, showActual = true, showDue = true, now = new Date() }) -> { range, days, monthWeeks }`。
- `days[]` 含 `date`、`plans`、`actual`、`due`、`plannedSeconds`、`actualSeconds`、`allDayCount`。定時片段含 `id`、`kind`、`date`、`from`／`to` epoch 毫秒、`startMinute`／`endMinute`、`lane`／`lanes`、`conflict`、`continuesBefore`／`continuesAfter`、原始 `item`；全天片段使用日期與延續旗標。projectId `'all'` 不篩選、`'none'` 篩未分類，其餘精確比對。
- `monthWeeks[]` 含週起始 date 及 `bars`；bar 含來源 id／kind、0-based `startColumn`、`span`、`row`、延續旗標。長條跨週拆段，days 保留完整項目供超額計數。

- [ ] **Step 1:** 寫 failing tests：`calendarRange('month', '2021-02-14', 1).dates.length === 28`；2026-10 月為 35 格；`navigateCalendarDate('month', '2026-01-31', 1) === '2026-02-28'`。用當地 Date 建立 10/20 23:00 到 10/21 00:00 的安排，斷言只有 10/20 片段、3600 秒；全天兩天為兩筆片段、plannedSeconds 為 0。加入閏日、跨年、週日起始、相鄰時段不衝突、重疊分道、跨週 bar span、timer／entry 同 id 去重與 done／archived 截止日排除。
- [ ] **Step 2:** Run `node --test extension/src/lib/calendar.test.js`，確認缺少 exports 等對應失敗；不要把環境錯誤當 red。
- [ ] **Step 3:** 實作上述接口。日期用當地日曆加減，秒數用 epoch 差；timer 合成暫時計時片段，不修改 snapshot。同起訖排序以 id 穩定排序。對無效舊 entry 忽略顯示，對新安排明確拒絕。DST tests 用 child Node 的 `env.TZ='America/New_York'` 檢查 2026-03-08／11-01 的日長 23／25 小時；24 小時鐘面位置與實際 elapsed seconds 分開計算，倒退鐘點片段保留可見最小高度及精確文字，不產生負時數。
- [ ] **Step 4:** 重跑 Task 1 測試，預期全數通過；`normalizeCalendarPlan` 需拒絕 2026-02-30、空標題、錯誤 ISO、反向或零長度區間。
- [ ] **Step 5:** 僅暫存本 task 檔案，commit `feat: add calendar date and layout model`。

## Task 2：安排儲存、刪除清理與備份

**Files:** Modify `extension/src/lib/db.js`、必要時 `relations.js`；Create `extension/test/calendar-db.test.mjs`。若擴充 removeProjectData，對新增 calendarPlans 使用預設空陣列，保留既有呼叫相容性。

**Interfaces:** Consumes Task 1 normalizeCalendarPlan。Produces `listCalendarPlans() -> Promise<CalendarPlan[]>`、`upsertCalendarPlan(input) -> Promise<CalendarPlan>`、`deleteCalendarPlan(id) -> Promise<void>`；列表按起始時間／日期及 id 穩定排序，UI 再按可見範圍相交篩選。

- [ ] **Step 1:** 用既有記憶體 chrome.storage mock 寫 tests：`assert.deepEqual(await listCalendarPlans(), [])`；新增獨立安排重新讀取相同；同 Todo 兩時段保留兩筆；更新保留 createdAt。刪除 Todo／專案後安排標題、起訖不變，taskId／projectId 清理正確。封存專案與完成 Todo 不刪安排。備份 round-trip 包含安排；舊 version 1 缺少 calendarPlans 還原為 []。
- [ ] **Step 2:** Run `node --test extension/test/calendar-db.test.mjs`，確認指定 CRUD／備份 assertions 失敗。
- [ ] **Step 3:** 新增 storage key、CRUD，資料寫入前做 Task 1 驗證。關聯不存在時清為 null；已有 task 與不同 project 的新提交回報驗證錯誤；更新時未改關聯的既有安排保留快照，即使 Todo 已換專案。deleteCalendarPlan 清除 entries／timer 對應 planId；deleteTask／deleteProject 清理安排關聯，保留時間與文字。exportAll version 1 新增 calendarPlans；importAll 先驗證全部安排與唯一 id、再正規化所有集合的失效關聯，最後一次 storage.set，避免部分覆蓋。
- [ ] **Step 4:** 增加 `assert.rejects(() => importAll(invalidBackup))` 並斷言呼叫前後所有 storage 深度相等；驗證 missing planId 清空、文字保留、刪除安排不刪 entry／timer。Run `node --test extension/test/calendar-db.test.mjs extension/src/lib/relations.test.js extension/test/task-hierarchy.test.mjs`，預期全數通過。
- [ ] **Step 5:** commit `feat: persist calendar plans and include them in backups`，只提交本 task 變更。

## Task 3：計時計畫關聯與延遲筆記保護

**Files:** Modify `extension/src/lib/db.js`、`extension/src/options/options.js`、`extension/src/popup/popup.js`、`web/components/TimerPanel.tsx`；Create `extension/test/calendar-timer.test.mjs`。相關 timer view 的來源顯示留給 Task 8。

**Interfaces:** `startTimer({ ...existing, planId = null })`、`upsertEntry({ ...existing, planId? })`；`patchTimer(patch, { expectedEntryId } = {})` 在 entryId 不符時不寫入並回傳目前 timer，保持既有單參數呼叫相容。web 經 RPC 傳 `{ ...patch, expectedEntryId }`，Task 4 的 handler 拆出 guard，再呼叫 db 第二參數，guard 不存進 timer。新增安排操作從 UI 既有 startTimer 接口呼叫，不新增並行 timer。

- [ ] **Step 1:** tests：計時開始帶 planId、停止 entry.planId 相同；`upsertEntry({...entry, description:'new'})` 與省略 planId 的 patch 都保留關聯；明確 null 解除；只改筆記／描述／標籤保留、改成不同 project／task 清空。同一安排兩次 start／stop 產生兩筆 entry，不改安排原時段；一般 start 與 recent resume 不繼承 planId。
- [ ] **Step 2:** Run `node --test extension/test/calendar-timer.test.mjs`，確認與關聯行為對應的失敗。
- [ ] **Step 3:** db 統一處理關聯與允許欄位；patch 比對套用後的 projectId／taskId 與安排快照；未提供 planId 保留 previous，明確 null 清除。若連結 Todo 已換專案而安排仍為舊快照，從安排計時保留安排 projectId 並讓新 timer.taskId=null，避免產生互相矛盾的 task／project；此時仍保留 planId，後續僅在使用者實際改動 project／task 時檢查解除規則。各介面的 500ms notes callback 捕捉其來源 entryId，寫入帶 guard；flush 先取消 pending timeout，且等待已開始的同筆寫入完成。新 timer 不接受外部帶入 entryId。
- [ ] **Step 4:** 加入延遲測試：開始 A、開始 B、`patchTimer({notes:'A late'}, {expectedEntryId:A.entryId})`，斷言 B 的 entryId／notes 未改；resolveIdleTimer、四捨五入停止、完成 Todo 與 planId 並存。Run `node --test extension/test/calendar-timer.test.mjs extension/test/timer.test.mjs extension/test/idle-timer.test.mjs`，預期通過。
- [ ] **Step 5:** commit `feat: link calendar plans to tracked work`。含原有未提交修改的檔案使用精確 hunk 暫存，commit 後檢查那些原有修改仍在 working tree。

## Task 4：RPC 與 web 型別相容

**Files:** Modify `extension/src/background.js`、`web/lib/types.ts`；Create `extension/test/calendar-rpc.test.mjs`。檢查 `web/lib/store.tsx` 的 EMPTY_SNAPSHOT merge 可相容缺少 calendarPlans 的舊 extension；若現有 merge 已滿足則不修改。

**Interfaces:** `getAll` 新增 `calendarPlans: CalendarPlan[]`；RPC `upsertCalendarPlan(payload)`、`deleteCalendarPlan({id})`；`patchTimer({expectedEntryId?, ...patch})` 依 Task 3 轉送 guard。TypeScript 的 CalendarPlan 與核准 spec 的判別聯集相同，Entry／Timer 加入可選 planId，Snapshot／EMPTY_SNAPSHOT 增加 calendarPlans。

- [ ] **Step 1:** 用 mocked chrome.runtime listener 實際執行 background module，測 getAll 包含 arrangements、CRUD 往返及 timer guard；由 `sender.origin='http://localhost:3000'` 呼叫成功、非允許 origin 拒絕。測錯誤 arrangement 回傳 `{ok:false,error}`、guard 不洩漏到 storage。不要只比對原始碼字串。
- [ ] **Step 2:** Run `node --test extension/test/calendar-rpc.test.mjs`，確認缺少 calendarPlans／handler 失敗。
- [ ] **Step 3:** 接上 Task 2 CRUD，完成 types；原有允許來源與訊息回覆協定保持相容。stub background 初始化所需 alarms／idle／notifications，測試只用記憶體資料。
- [ ] **Step 4:** Run `node --test extension/test/calendar-rpc.test.mjs extension/test/background-layout.test.mjs`；在 web 執行 `npm run typecheck`。預期通過，EntryDialog 編輯與 TimerPanel 的舊 payload 仍可使用，不要求 web 有日曆 UI。
- [ ] **Step 5:** commit `feat: expose calendar data through the extension bridge`。

## Task 5：四種日曆檢視與管理頁接線

**Files:** Create `extension/src/options/calendar.js`、`calendar-view.js`、`calendar.css`、`extension/test/calendar-view.test.mjs`、`extension/test/calendar.browser.mjs`；Modify `extension/src/options/options.html`、`options.js`、`extension/src/lib/i18n.js`、必要時現有 `extension/test/options-layout.test.mjs` 與 `extension/src/lib/i18n.test.js`。

**Interfaces:** `createCalendarController({ root, getSnapshot, getLocale, actions, editors, now = () => new Date() }) -> { update(snapshot), setActive(active), destroy() }`。actions 提供 `savePlan(input)`、`deletePlan(id)`、`startPlan(id)`、`openEntry(id)`、`openTask(id)`、`refresh()`，皆由 options adapters 實作。editors 提供 `mount(textarea)`、`sync(textarea)`、`destroy(textarea)` 沿用現有 Markdown 實例。

`calendarViewMarkup(model, { view, selectedDate, locale }) -> string` 為無 DOM 的 markup 產生器，供 Node 測試 escaping／可操作標記；`renderCalendarView(root, model, options) -> void` 使用該 markup 只替換 calendar body，不替換 toolbar、form 或外部管理介面。controller 擁有 view／date／filters，預設 week／今天；options 初始化 controller 的時機須在 S 及事件依賴完成後，不能在 top-level 初始化前存取尚未宣告的變數。

- [ ] **Step 1:** 建立固定 snapshot fixture 與 browser entry，Node 測 `calendarViewMarkup` 的 escaping、類別文字、日期／紀錄操作標記及最多三筆入口；實際 DOM assertions 加入 `calendar.browser.mjs`：四種 view、today／prev／next、日期點擊、每格三筆與「另 N 筆」、跨週連續 bar、七天 agenda、未分類篩選與顯示開關。以 `<img src=x onerror=...>` 作標題，斷言是文字且不執行。此時即建立 Task 8 Step 3 指定的 loopback／Playwright mock harness，Task 8 再擴充整合案例，不能延後到所有 UI 完成才驗證。
- [ ] **Step 2:** Run `node --test extension/test/calendar-view.test.mjs`；瀏覽器測試依 Task 8 指定 runner 執行，確認缺少日曆容器／controller 導致對應失敗。
- [ ] **Step 3:** 加入 nav calendar 與 `p-calendar`、stylesheet link；selectTab 的名稱列表納入 calendar，呼叫 setActive。S／load／renderAll 加入 calendarPlans，update 保留 controller state。渲染月格、跨週 bar、全天列、雙欄 24 小時軸、清單、統計、衝突與 deadline marker；now line 與 timer 每分鐘更新，離開分頁停止 ticker。初次捲動遵循 spec；窄畫面橫向捲動、固定時間刻度。使用 textContent 或既有 escaping，專案色僅允許 hex，防止 HTML／style 注入。
- [ ] **Step 4:** 加入 `nav.calendar`、`calendar.*` 三語字串與 locale 日期格式。Run `node --test extension/test/calendar-view.test.mjs extension/src/lib/i18n.test.js extension/test/options-layout.test.mjs extension/test/options-syntax.test.mjs`。實際 DOM 檢查 labels、focus、view toggles 的 aria-pressed、日期按鈕及 empty state。
- [ ] **Step 5:** commit `feat: add calendar month week day and agenda views`，不納入原有 options layout 的不相關修改。

## Task 6：安排表單、詳情與安全重新整理

**Files:** Modify `extension/src/options/calendar.js`、`calendar-view.js`、`calendar.css`、`options.js`、`i18n.js`；Extend `extension/test/calendar.browser.mjs`。

**Interfaces:** controller 內部 `openPlanEditor({ id?, date?, startedAt?, endedAt?, allDay? })`、`saveEditor()`、`requestRefresh(snapshot)`；表單 draft 與 snapshot 分離。requestRefresh 在 form 開啟或 pointer 活躍時只更新 snapshot／非互動區，待提交／取消後套用完整刷新。actions.openEntry 使用既有 `openEntryDialog`，Task 8 處理 running timer 例外。

- [ ] **Step 1:** tests：空白標題與反向時間錯誤保留 draft；date 10/20 全天一天儲存 endDate 10/21；全天開關來回切換暫存原定時輸入；選 Todo 帶標題與專案，改專案清 taskId 並顯示提示；已完成 Todo 可選且標狀態；封存 project 既有安排可保留、新安排不列入；Todo 已移專案的既有安排不自動改寫。
- [ ] **Step 2:** Run `node --test extension/test/calendar.browser.mjs` 的表單 cases，確認未實作的行為失敗；測試以既有 storage mock 模擬讀寫失敗，不能改成真實使用者資料。
- [ ] **Step 3:** 實作 dialog、現有 Markdown editor adapter、保存／取消／刪除確認、關聯紀錄與合計時間。全天 UI 結束日期以「至哪一天」含當日呈現，存取時換成 exclusive endDate。datetime-local 轉成當地 Date 後逐欄回比，拒絕被 DST 自動推進的不存在鐘點；重複鐘點依 JavaScript 的較早實例，編輯既有紀錄未變動起訖時保留原 ISO，不破壞原 offset。儲存錯誤以 i18n 欄位訊息呈現，不關閉 dialog。
- [ ] **Step 4:** 模擬 storage refresh：修改標題與長筆記、記錄游標與捲動、popup 寫入 entry、assert draft／focus／scroll 不變。安排被另一視窗刪除時顯示已刪除並停用保存／開始，不用 upsert 重新建立原 id。Run `node --test extension/test/calendar.browser.mjs`，預期截至本 task 的 cases 通過。
- [ ] **Step 5:** commit `feat: edit calendar plans and preserve unsaved drafts`。

## Task 7：框選、拖曳與縮放

**Files:** Create `extension/src/options/calendar-interactions.js`、`extension/test/calendar-interactions.test.mjs`；Modify `calendar.js`、`calendar-view.js`、`calendar.css`、`extension/src/lib/calendar.js`；Extend browser tests。

**Interfaces:** domain `calendarPointerChange(plan, { mode, targetDate, minuteDelta = 0 }) -> CalendarPlanInput`，mode 為 `move | resize-start | resize-end`；月 move 改日期保留當地鐘點及日曆跨度，全天保留天數。`attachCalendarInteractions(root, { onCreate, onChange, onBusy, onError }) -> () => void`，onChange 回傳 Promise，呼叫 actions.savePlan；onBusy 供 Task 6 延後刷新。像素轉分鐘依實際格線 rect，禁用跨日片段的 move／resize。

- [ ] **Step 1:** tests：15 分鐘 snapping、click 預設 30 分鐘、drag selection 前後反向仍為正區間、resize 最短 15 分鐘、move 保留原長度、month move 跨月與 DST 保留當地鐘點、全天跨度保留。臨近 24:00 的 30 分鐘 click 可在表單中跨午夜，不截掉剩餘分鐘。已建立的跨日計畫僅允許月曆整筆移動或表單修改。
- [ ] **Step 2:** Run `node --test extension/test/calendar-interactions.test.mjs`，確認未實作 domain／interaction exports 失敗。
- [ ] **Step 3:** pointer capture、明確拖曳門檻、預覽區塊、pointerup commit；Escape／pointercancel 清除 preview 不寫入。拖曳失敗還原並提示；pending 禁止重複提交。不可拖 actual／deadline／跨日片段；min-height 只影響可視區，不改精確秒數。滑鼠 click 與 drag 不重複開 editor。
- [ ] **Step 4:** browser 實測 move／resize／selection、scroll 後座標、Escape、pointercancel、模擬失敗 rollback、背景 refresh 不中斷。測全天 move 與月長條維持 id；keyboard 經 editor 可完成同樣變更。Run pointer Node tests 及 browser cases，預期通過。
- [ ] **Step 5:** commit `feat: drag select and resize calendar plans`。

## Task 8：計時操作、跨介面驗收與交付

**Files:** Modify `extension/src/options/options.js`、`options.html`、`calendar.js`、`extension/src/popup/popup.js`、`popup.html`／`popup.css`、`extension/src/lib/i18n.js`、`web/components/TimerPanel.tsx`、必要的 web 既有樣式檔、`extension/README.md`、`web/README.md`；Create/complete `extension/test/calendar.browser.mjs`。只有樣式確實需要時才修改共享 options.css，否則使用 calendar.css 及既有 timer classes。

**Interfaces:** `actions.startPlan(id)` 先確認最新安排仍存在。若同 plan 已在計時，直接 selectTab('timer')；否則等待本地 pending notes flush、以 Task 3 startTimer 契約建立新計時、reload。`actions.openEntry(id)` 對保存紀錄呼叫既有編輯 dialog，running synthetic entry 則轉計時頁。來源解除統一 `patchTimer({planId:null})`，不停止計時。

- [ ] **Step 1:** 補 browser failing cases：A 的未送出筆記在開始 B 前保存；同 plan 再按不重開；分次 work 顯示兩筆；popup stop／idle 處理後 calendar 更新；timer 與 entry 過渡不雙算。管理／popup／web 的來源標題與解除按鈕可用；Task 4 guard 攔截遲到 notes payload。
- [ ] **Step 2:** 實作 adapters、來源提示、解除連結與相關狀態。storage.onChanged 只處理 calendarPlans／projects／tasks／entries／timer／settings，合併短時間多次變更，不以整頁 load 覆寫 dirty timer notes；focus refresh 共用同一路徑，避免自己寫入導致 refresh loop。Task 6 draft 與 Task 7 interaction busy 共同控制刷新；destroy 移除 listeners／ticker／editor。
- [ ] **Step 3:** Browser runner 使用現有 Playwright 或 `PLAYWRIGHT_MODULE` 指定的安裝，`chromium.launch({channel:'chrome',headless:true})` 配合本機僅綁 loopback 的靜態伺服器及 chrome API mock，實際載入 options.html／popup.html 的原始 modules，不改真實 chrome.storage。mock 需廣播 onChanged；控制時間固定 2026-10-20，可指定 failure。執行 `node --test extension/test/calendar.browser.mjs`；沒有 Playwright 時先定位可用副本，必要時裝在暫存驗證資料夾，不新增產品依賴。至少 1440px／390px，繁中／英文／日文；瀏覽器案例失敗須修正，不能 skip 代替通過。
- [ ] **Step 4:** 更新 README 的管理頁日曆、計畫／實際差異、全天／跨日、備份需新版還原，以及 web 只保持資料相容的範圍。執行 root `node --test extension/src/lib/*.test.js extension/test/*.test.mjs`；在 web 執行 `npm run typecheck`、`npm run build`；root `git diff --check`。檢查真實 MV3 掛載時的 CSP／runtime 行為，先用隔離瀏覽器 profile 與測試副本，避免動到使用者資料。截圖存到 `docs/images/calendar/`，至少週檢視計畫／實際與月檢視；附 fixture 內容以便重現。
- [ ] **Step 5:** 使用 verification-before-completion 檢查新鮮輸出，依 chosen execution workflow 完成獨立 review 並修正實際缺陷；必要時重跑受影響檢查。commit `feat: integrate calendar planning with timer workflows`，git status 確認其他既有修改仍保留。最終回報功能、驗證結果、截圖位置與任何未完成的真實 Chrome 驗證，不將設計或 mock 測試當成功能實測。

## 執行方式與目前進度

本計畫已撰寫，尚未開始產品程式碼或新增測試。建議由目前 agent 依序執行，再做整體獨立審查：資料、計時與 UI 任務共用接口，依序整合能減少重複理解及多人同改 options.js 的衝突。使用者審閱本計畫並選擇執行方式後，依上方八個 task 執行；若選擇逐 task 子代理流程則套用 subagent-driven-development。
