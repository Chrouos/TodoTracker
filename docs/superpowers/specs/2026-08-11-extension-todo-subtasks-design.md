# Extension Todo 子任務設計

## 背景

目前 extension 的 project 已支援 `parentId` 階層，但 Todo 仍是指定 project 下的扁平清單。當 project 階層較深時，popup 的專案選單又因為固定寬度與雙欄配置而截斷名稱。

## 目標

- 讓 Todo 支援「主任務 → 子任務」拆解。
- 子任務可獨立完成、計時、排序與出現在現有 Todo/報表流程中。
- popup 的 project 與 Todo 選單改為上下排列，確保階層名稱有足夠顯示空間。
- 保留現有 project、entry 與 timer 的資料關聯方式。

## 資料模型

在每筆 Todo 新增 `parentId: string | null`：

- `null` 表示主任務。
- 指向另一筆 Todo 表示子任務。
- 子任務沿用自己的 `projectId`，建立時預設繼承主任務的 project。
- 儲存與匯入舊資料時，缺少 `parentId` 視為 `null`。
- 禁止 Todo 指向自己或自己的後代，避免形成循環。

第一版 UI 只呈現兩層：主任務與直接子任務；資料模型不限制未來增加更深層級。

## UI 與互動

### Popup

- 追蹤區的 project `<select>` 改為整行寬度。
- Todo `<select>` 改為整行寬度。
- project 選項保留既有階層縮排。
- Todo 清單以縮排顯示子任務，並在主任務旁顯示未完成子任務數量。
- 新增 Todo 時，可選擇建立為目前 project 下的主任務或指定主任務的子任務。

### Options page

- Todo 編輯表單增加「上層 Todo」選擇。
- 上層 Todo 選項排除自己與所有後代。
- Todo 清單依主任務與子任務排序，子任務縮排顯示。
- 刪除主任務時，子任務改成主任務（`parentId = null`），不要一併刪除。

### 完成規則

- 子任務可獨立切換完成狀態。
- 主任務有未完成子任務時仍可完成，但需提示並確認。
- 完成或重新開啟主任務不自動變更子任務狀態。

## 資料流程

`db.listTasks()` 正規化缺少的 `parentId`；`upsertTask()` 驗證 parent 關係後儲存。Popup 與 options page 共用 tree helper，集中處理子任務排序、縮排、後代排除與未完成數量。

既有 timer 與 entry 僅綁定 `taskId`，不需 migration；子任務本身就是普通 Todo，因此既有計時與報表可以直接運作。

## 錯誤處理

- 找不到 parent 時將 Todo 降級為主任務。
- 發現循環關係時拒絕儲存並顯示錯誤。
- 匯入舊備份時缺少 `parentId` 以 `null` 補齊。

## 驗證

- 測試 `parentId` 正規化、循環檢查、主任務/子任務排序與未完成數量。
- 測試 popup project/Todo 選單為上下排列且仍可選取階層 project。
- 測試完成主任務的確認提示，以及刪除主任務後子任務升級為主任務。
- 執行 extension 現有 test/build 檢查，並手動載入 extension 驗證 popup 與 options page。
