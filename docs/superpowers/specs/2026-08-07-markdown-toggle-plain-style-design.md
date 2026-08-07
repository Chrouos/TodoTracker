# Markdown toggle 無框樣式設計

## 目標

讓「展開全文／收闔全文」看起來像內容操作提示，不再使用帶框按鈕外觀。

## 視覺規則

- `.markdown-toggle` 使用透明背景、無 border、無水平 padding。
- 保留現有文字與 toggle 行為。
- hover 時使用較深的文字色並加底線。
- `:focus-visible` 保留清楚的鍵盤 focus outline。
- 不修改 Markdown renderer、資料格式或 preview 收闔邏輯。
