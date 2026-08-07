# 單一 Markdown 展開控制設計

## 目標

移除 Markdown preview 內容下方重複的「展開全文」按鈕，讓每筆長內容只保留一個位於內容上方的控制。

## 行為

- 收闔狀態：上方顯示 `[+] 展開全文`。
- 展開狀態：同一顆按鈕改為 `[-] 收闔全文`。
- 短內容不顯示按鈕。
- 保留既有長度判定、hidden tab 初始化、resize 重新量測與 transient state。

## 範圍

只修改 extension options page 的 shared Markdown preview markup 與相關樣式；不修改 Markdown renderer、資料格式或其他工作區功能。
