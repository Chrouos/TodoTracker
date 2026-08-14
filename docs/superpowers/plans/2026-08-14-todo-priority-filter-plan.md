# Todo 優先級篩選實作計畫

## Objective and scope

在 extension 的 options Todo 管理頁與 popup Todo 頁加入四級優先級、優先級篩選、優先級呈現，以及更有意義的任務數量摘要。舊資料缺少優先級時視為 `normal`。不改動 web UI、既有排序、任務關係或其他資料欄位。

## Technical baseline

- Extension 是零 build step 的 native ES module 專案，資料由 `extension/src/lib/db.js` 寫入 `chrome.storage.local`。
- options 頁在 `extension/src/options/options.js` 以字串 render Todo 表單與清單。
- popup 頁在 `extension/src/popup/popup.js` 以字串 render Todo 清單。
- 現有測試是可直接用 Node 執行的 `.mjs` contract tests，沒有測試 runner 設定。

## Ordered implementation stages

### 1. 建立優先級與篩選純函式的 failing tests

Files:

- Add `extension/test/todo-priority.test.mjs`

Test first:

- `normalizePriority(undefined)` 回傳 `normal`。
- 四個有效值保留，未知值回傳 `normal`。
- `filterTasks` 可同時套用 project scope、priority 與 showDone，且未指定優先級的舊任務視為一般。
- `taskCountLabel` 在隱藏完成項目時只回傳 `共 N 個未完成`，顯示完成項目時回傳 `N 個未完成／共 M 個`。

Verification:

- `node extension/test/todo-priority.test.mjs`；預期在純函式尚未存在時失敗。

### 2. 實作優先級純函式與資料正規化

Files:

- Add `extension/src/lib/todo-filter.js`
- Modify `extension/src/lib/db.js`

Implementation:

- Export `TODO_PRIORITIES`、`priorityLabel`、`normalizePriority`、`filterTasks`、`taskCountLabel`。
- `filterTasks` 只負責過濾，不改變輸入陣列，也不改變排序。
- `upsertTask` 將 `priority` 正規化後寫入 row；舊資料只在讀／更新時以 `normal` 解讀。

Verification:

- 先執行 `node extension/test/todo-priority.test.mjs`，確認由 RED 轉 GREEN。
- 再執行 `node extension/test/task-hierarchy.test.mjs`。

### 3. 更新 options Todo 頁

Files:

- Modify `extension/src/options/options.html`
- Modify `extension/src/options/options.js`
- Modify `extension/src/options/options.css` only if the added toolbar/form controls require responsive layout adjustment.
- Modify `extension/test/options-layout.test.mjs` or add a focused contract assertion in `extension/test/todo-priority.test.mjs`.

Implementation:

- 表單新增 `tdPriority`，預設一般，編輯既有任務時讀取正規化優先級。
- 工具列新增 `tdPriorityFilter`，選項為全部、緊急、高、一般、低。
- 使用共用 `filterTasks` 套用專案範圍、優先級與完成狀態。
- 每筆清單顯示優先級 badge；既有任務沒有欄位時顯示一般。
- 使用 `taskCountLabel` 取代低資訊量的固定摘要。
- submit 時保存 `priority`。

Verification:

- `node extension/test/options-layout.test.mjs`
- `node extension/test/todo-priority.test.mjs`

### 4. 更新 popup Todo 頁

Files:

- Modify `extension/src/popup/popup.html`
- Modify `extension/src/popup/popup.js`
- Modify `extension/src/popup/popup.css` only if needed for the new compact control.

Implementation:

- 在 Todo 專案選單旁新增優先級篩選選單。
- renderTodo 使用共用優先級正規化與篩選邏輯。
- Todo 列顯示優先級 badge。
- 儲存新 Todo 時明確寫入一般優先級。

Verification:

- `node extension/test/todo-priority.test.mjs`
- 手動檢查 popup Todo tab：篩選、建立、重新載入後顯示正確。

### 5. 全量驗證與手動驗收

Verification commands:

- `node extension/test/task-hierarchy.test.mjs`
- `node extension/test/options-layout.test.mjs`
- `node extension/test/todo-priority.test.mjs`
- `git diff --check`

Manual acceptance:

- 建立緊急、高、一般、低四種任務。
- options 頁可單獨篩選每一級，也可與子專案篩選及顯示完成項目組合。
- popup 頁可單獨篩選每一級。
- 舊任務沒有 priority 時顯示一般且可被一般篩選找到。
- 未顯示完成項目時摘要不再顯示無意義的 `N 個未完成／共 N`。

## Integration and compatibility constraints

- 不使用 migration 或清空既有 storage。
- 不將優先級值直接信任為任意字串；render 與 storage 都透過 `normalizePriority`。
- 不改變 `flattenTasks`、due date、status 或 project hierarchy 的既有行為。

## Out of scope

- web Todo 頁的優先級表單與篩選。
- 依優先級排序。
- 自訂優先級、顏色設定或批次更新。
