# Markdown preview 與長內容收闔設計

## 目標

讓 TodoTracker extension 中使用者輸入的 Markdown 紀錄，在 Todo、工作紀錄與專案工作區中以可讀的 HTML preview 顯示，並讓過長內容能從內容上方直接收闔。

## 範圍

- 保留原始 Markdown 文字，不修改資料格式。
- 強化現有 `markdownToHTML()`，支援：標題、粗體、斜體、行內 code、連結、無序條列、有序條列、引用與 fenced code block。
- 以安全 escaping 避免 Markdown 內容被當成任意 HTML 執行。
- 對長內容加上收闔狀態：預設顯示有限高度，內容上方提供「展開全文」；展開後同一位置提供「收闔全文」。
- 套用於 Todo notes、entry notes 與 project workspace 中的 notes。

## 設計

### Markdown renderer

沿用 `extension/src/lib/markdown.js` 的純 JavaScript renderer，不引入外部套件。先處理 fenced code block，再處理段落、標題、條列與引用；所有文字先 escape，只有 renderer 產生的標籤會進入 DOM。

條列項目需正確包在單一 `<ul>` 或 `<ol>` 中，連續非條列內容則形成段落。code block 使用 `<pre><code>` 並保留換行與特殊字元。

### 可收闔 preview

新增共用的 preview markup/class 與事件處理。內容未超過限制時不顯示控制按鈕；超過限制時預設收闔，使用者可在內容上方切換展開/收闔。狀態只存在目前 DOM，不寫入資料庫。

### 驗證

- 更新 Markdown unit tests，覆蓋條列、code block 與安全 escaping。
- 執行 extension/web 既有測試與可用的 lint/build 驗證。
- 手動檢查 options page：長 Markdown 展開後，內容上方可立即收闔；條列與 code block 顯示正確。

## 不在範圍

- 不支援完整 CommonMark/GFM 語法，例如表格、任務清單與 HTML passthrough。
- 不改變資料庫 schema、匯出格式或原始紀錄內容。
