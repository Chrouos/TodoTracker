# 計時當下紀錄 Markdown 預覽設計

## 背景

管理頁的「計時」分頁中，「當下紀錄」目前只有純文字 `textarea`。內容本身會保存到 timer 與完成後的 entry，但使用者無法在計時期間確認 Markdown 的標題、清單、連結或程式碼格式。

## 目標

- 讓使用者在計時期間檢視「當下紀錄」的 Markdown rendering。
- 保留既有的即時自動儲存與停止計時保存流程。
- 沿用 options 頁面既有的 `renderMarkdownPreview()`、`initializeMarkdownPreviews()` 與 Markdown 樣式。
- 預覽不應讓計時面板無限制增高或造成輸入欄位與內容反覆跳動。

## 使用者介面

在「當下紀錄」欄位下方新增一個切換按鈕：

- 編輯模式顯示「預覽 Markdown」。
- 預覽模式隱藏 `textarea`，按鈕改顯示「編輯 Markdown」。
- 預覽內容顯示目前已輸入的文字；沒有內容時仍顯示空的預覽區塊，不顯示錯誤。
- 切回編輯模式後，原文字內容與游標輸入流程不變。
- 預覽切換不影響計時、timer notes 自動保存或停止計時。

## 技術方案

- 在 `options.html` 增加 `mgTimerNotesPreviewToggle` 按鈕與 `mgTimerNotesPreview` 容器。
- 在 `options.js` 以 `timerNotesPreviewOpen` 保存目前模式；`renderTimerNotesPreview()` 將 textarea 內容交給既有的 `renderMarkdownPreview()`，再呼叫 `initializeMarkdownPreviews()`。
- `renderTimer()` 重繪 timer 時同步預覽內容，但不改變使用者目前的編輯／預覽模式。
- 預覽容器使用固定的最小／最大高度與垂直捲動，避免長 Markdown 將整個計時面板無限撐高。
- 為 HTML、JavaScript wiring 與 CSS 增加 regression contract test；Markdown 本身沿用既有 renderer 測試，不另造第二套 parser。

## 不在本次範圍

- 不修改 Markdown parser 或安全清理規則。
- 不新增分割畫面或同步編輯器。
- 不修改報表、Todo、工作日誌既有預覽行為。
