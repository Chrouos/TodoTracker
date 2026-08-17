# Todo 選取時同步專案設計

## 目標

在 Web 與 extension 的工作紀錄編輯視窗中，使用者選擇 Todo 後，專案欄位要自動同步為該 Todo 的所屬專案。選擇未分類 Todo 時，專案欄位清空。

## 現況與問題

Web 的 `EntryDialog` 在專案變更時會清空 `taskId`，但 Todo 變更只更新 `taskId`，沒有反向更新 `projectId`。extension 的工作紀錄視窗也同樣只儲存兩個獨立欄位，因此可能產生 Todo 與專案不一致的組合。

## 設計

新增一個純函式，接收 Todo ID、目前專案 ID 與 Todo 清單，回傳同步後的專案 ID：

- Todo ID 對應到有專案的 Todo：回傳該 Todo 的 `projectId`。
- Todo ID 對應到未分類 Todo：回傳空字串。
- Todo ID 找不到：保留目前專案 ID，避免資料刷新或過期選項意外清空使用者選擇。

Web `EntryDialog` 的 Todo `onChange` 使用此規則，同時更新 `taskId` 與 `projectId`。專案 `onChange` 維持既有行為：切換專案時清空 Todo，避免保留不屬於新專案的 Todo。

extension 的工作紀錄視窗套用相同規則，讓兩個介面的資料關聯一致。

## 測試

先新增純函式測試並確認測試在尚未實作同步規則前失敗，再完成最小實作。測試涵蓋：

1. Todo 有所屬專案時，專案切換為該專案。
2. Todo 未分類時，專案清空。
3. Todo ID 不存在時，保留目前專案。

完成後執行相關 Web 測試、extension 測試與 Web TypeScript/build 檢查。

## 範圍

本次只調整工作紀錄編輯視窗的欄位同步，不修改資料庫 schema、既有 Entry 儲存格式、計時器行為或其他 Todo 編輯流程。
