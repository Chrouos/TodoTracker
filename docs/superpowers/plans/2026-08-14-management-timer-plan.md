# 管理頁計時與停止完成 Todo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理頁提供與 popup 共用的計時器，讓停止操作一次保存時間與紀錄，並可用預設未勾選的選項完成掛上的 Todo。

**Architecture:** 管理頁新增固定的 timer panel，使用 `db.getTimer`／`startTimer`／`patchTimer`／`stopTimer` 讀寫共用計時狀態；停止時由資料層以可選參數更新掛上的 Todo。管理頁只負責表單狀態、即時顯示與停止選項，不複製時間紀錄建立邏輯。

**Tech Stack:** Chrome Extension Manifest V3、原生 HTML/CSS/ES modules、`chrome.storage.local`、Node.js `node:assert/strict` contract tests。

## Global Constraints

- 停止時紀錄與時間必須一次保存，不顯示第二次紀錄確認視窗。
- 「停止時標記 Todo 為完成」預設為未勾選。
- 沒有掛 Todo 時隱藏完成選項；沒有有效 `taskId` 時不得修改 Todo。
- popup 與管理頁必須使用同一筆共用 `timer` 資料。
- 既有 `stopTimer(endedAt, discardSeconds)` 呼叫保持相容；新增行為使用第三個 options 參數。
- 不將 `.superpowers/`、zip 檔或其他未追蹤使用者檔案加入 commit。

---

### Task 1: 為停止完成 Todo 建立資料層失敗測試

**Files:**
- Create: `extension/test/timer.test.mjs`
- Read: `extension/src/lib/db.js`

**Interfaces:**
- Test the existing `startTimer`, `stopTimer`, `upsertTask`, and `listTasks` exports.
- Define the desired new call shape: `stopTimer(null, 0, { completeTask: true })`.

- [ ] **Step 1: 建立測試 storage harness**

在 `extension/test/timer.test.mjs` 建立 `chrome.storage.local` 的 `get`、`set`、`remove` mock，並在 import `db.js` 前設定 `globalThis.chrome`。測試初始 tasks 包含一個 `todo` 與一個 `doing` 狀態的 Todo。

- [ ] **Step 2: 寫出停止保存紀錄與完成 Todo 的測試**

測試流程：

```js
await upsertTask({ id: 'task-complete', title: '完成測試', status: 'doing' });
await startTimer({ taskId: 'task-complete', description: '工作描述', notes: '當下紀錄' });
const entry = await stopTimer(null, 0, { completeTask: true });

assert.equal(entry.taskId, 'task-complete');
assert.equal(entry.notes, '當下紀錄');
assert.equal((await listTasks()).find((t) => t.id === 'task-complete').status, 'done');
```

另測試 `completeTask: false` 時，掛上的 Todo 仍維持原本狀態。

- [ ] **Step 3: 執行測試確認正確失敗**

Run: `node extension/test/timer.test.mjs`

Expected: FAIL，原因是 `stopTimer` 尚未接受 `completeTask` 並更新 Todo。

### Task 2: 實作停止時的完成 Todo 行為

**Files:**
- Modify: `extension/src/lib/db.js:393-418`
- Test: `extension/test/timer.test.mjs`

**Interfaces:**
- Extend `stopTimer(endedAt = null, discardSeconds = 0, { completeTask = false } = {})`.
- Preserve existing callers that pass zero、one or two arguments.

- [ ] **Step 1: 加入可選完成參數**

在 `stopTimer` 讀取第三個 options，先照現有流程建立 entry 並移除 `timer`。

- [ ] **Step 2: 在勾選且有 taskId 時更新 Todo**

在建立 entry 後，以目前 task 資料呼叫 `upsertTask({ ...task, status: 'done' })`；只有 `completeTask === true` 且 `t.taskId` 存在時執行。找不到 task 時不建立替代資料、不拋出錯誤。

- [ ] **Step 3: 執行資料層測試確認通過**

Run: `node extension/test/timer.test.mjs`

Expected: PASS，包含紀錄內容、taskId、勾選完成與未勾選保留狀態。

### Task 3: 為管理頁 timer panel 建立版面契約測試

**Files:**
- Modify: `extension/test/options-layout.test.mjs`
- Read: `extension/src/options/options.html`

**Interfaces:**
- The options page must expose stable IDs for timer UI wiring: `managementTimer`, `mgTimerClock`, `mgTimerDescription`, `mgTimerProject`, `mgTimerTask`, `mgTimerTags`, `mgTimerNotes`, `mgTimerComplete`, and `mgTimerToggle`.

- [ ] **Step 1: 加入必要欄位的 failing assertions**

在 `options-layout.test.mjs` 加入上述 IDs 的 regex assertions，並檢查 `options.js` 包含 `getTimer`、`stopTimer` 與 `completeTask`。

- [ ] **Step 2: 執行版面測試確認失敗**

Run: `node extension/test/options-layout.test.mjs`

Expected: FAIL，原因是管理頁尚未有 timer panel。

### Task 4: 加入管理頁 timer panel HTML/CSS

**Files:**
- Modify: `extension/src/options/options.html`
- Modify: `extension/src/options/options.css`

**Interfaces:**
- Add a fixed section between the page header and tabs so it remains visible across all management tabs.
- Use the IDs defined in Task 3.
- The toggle button changes between `開始計時` and `停止並儲存`; the complete checkbox is hidden when no task is attached.

- [ ] **Step 1: 建立 idle/running 共用區塊**

加入計時數字、描述 input、專案 select、Todo select、標籤容器、紀錄 textarea、完成 checkbox、儲存狀態文字與主按鈕。Todo 選項只列未完成項目，並依目前專案篩選。

- [ ] **Step 2: 加入不影響既有表單的樣式**

使用現有 token、`card`、`grid4`、`actions` 樣式，補上 timer panel 的 clock、running 狀態與小螢幕單欄排列；不改動 popup CSS。

- [ ] **Step 3: 執行版面測試確認通過**

Run: `node extension/test/options-layout.test.mjs`

Expected: PASS。

### Task 5: 實作管理頁 timer 狀態與事件

**Files:**
- Modify: `extension/src/options/options.js:20-185, 1570-1577`
- Test: `extension/test/options-layout.test.mjs`

**Interfaces:**
- Extend `S` with `timer: null` and load it using `db.getTimer()`.
- Add `renderTimer()` and call it from `renderAll()`.
- Use `db.startTimer({ projectId, taskId, description, tagIds })`, `db.patchTimer(patch)`, and `db.stopTimer(null, 0, { completeTask })`.

- [ ] **Step 1: 載入共用 timer 並建立 render 入口**

在 `load()` 的 `Promise.all` 讀取 `db.getTimer()`，在 `S` 保存結果，並讓 `renderAll()` 呼叫 `renderTimer()`。idle 時顯示表單值；running 時以 timer 值覆蓋表單值並顯示完成選項。

- [ ] **Step 2: 實作 elapsed ticker**

建立單一 interval，每秒依 `timer.startedAt` 更新 `mgTimerClock`；沒有 timer 時清除 interval 並顯示 `00:00:00`。頁面重新載入時依 storage 狀態恢復。

- [ ] **Step 3: 實作開始、欄位同步與紀錄自動保存**

開始時讀取管理頁欄位呼叫 `startTimer`。計時中修改描述、專案、Todo、標籤時呼叫 `patchTimer`；紀錄 textarea 以 500ms debounce 保存，並在停止前先以目前 textarea 值 flush 一次，避免最後輸入遺失。

- [ ] **Step 4: 實作停止並儲存**

停止時讀取 `mgTimerComplete.checked`，先 flush 當下紀錄，再呼叫 `stopTimer(null, 0, { completeTask })`，重新載入頁面；不建立額外確認視窗、不顯示第二個紀錄編輯流程。

- [ ] **Step 5: 執行完整測試與語法檢查**

Run:

```text
node extension/test/timer.test.mjs
node extension/test/options-layout.test.mjs
node extension/test/todo-priority.test.mjs
node extension/test/report-trend.test.mjs
node extension/test/task-hierarchy.test.mjs
node --check extension/src/lib/db.js
node --check extension/src/options/options.js
git diff --check
```

Expected: all contract tests pass and both JS files pass syntax checks.

### Task 6: 手動驗收與提交

**Files:**
- Verify: `extension/src/options/options.html`
- Verify: `extension/src/options/options.js`
- Verify: `extension/src/lib/db.js`

- [ ] **Step 1: 驗收 idle 狀態**

開啟管理頁，確認 timer panel 在報表、Todo、排程分頁都存在；未開始時沒有完成勾選，按開始後 clock 走動。

- [ ] **Step 2: 驗收紀錄保存**

計時中輸入紀錄，切換分頁或重新整理，確認紀錄仍在；按停止並儲存後，在紀錄頁看到相同描述、專案、Todo、標籤與文字。

- [ ] **Step 3: 驗收 Todo 完成分支**

掛上一個未完成 Todo，停止時保持未勾選，確認 Todo 仍未完成；再次計時並勾選後停止，確認 Todo 才變成完成。

- [ ] **Step 4: 檢查差異並提交**

```text
git status --short
git diff --check
git add extension/src/lib/db.js extension/src/options/options.html extension/src/options/options.css extension/src/options/options.js extension/test/timer.test.mjs extension/test/options-layout.test.mjs
git commit -m "feat: add management page timer"
```

## Integration and manual acceptance checks

- popup 正在計時時開啟管理頁，管理頁應顯示同一個描述、專案、Todo 與經過時間。
- 管理頁停止計時後，popup 應回到未計時狀態；已建立的 entry 與 Todo 狀態應一致。
- 管理頁沒有掛 Todo 時不應出現完成勾選框，也不應修改任何 Todo。

## Out of scope

- 不重新設計 popup 的停止後紀錄編輯流程。
- 不新增跨瀏覽器同步或遠端資料庫交易。
- 不修改既有排程建立 Todo 的優先度功能。
- 不處理同時在兩個頁面按下開始／停止時的鎖定；沿用現有共用 timer 的最後寫入規則。

## Follow-up platform or deployment checks

- 重新載入 Chrome extension 後手動驗收管理頁 timer panel。
- 若需發布，再由使用者另行要求 commit merge／push 或重新產生 zip。
