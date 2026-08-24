# Markdown Block Editor 設計規格

日期：2026-08-24  
狀態：設計已確認，待建立實作計畫

## 目標

將目前的 Markdown 工具列與預覽能力整合成接近 Notion 的 block editor：使用者可以直接輸入 Markdown shortcuts，畫面即時呈現格式，並直接點擊筆記中的 Todo checkbox。

編輯器涵蓋目前可呈現的 Markdown 功能：粗體、斜體、行內程式碼、連結、標題、無序／有序與巢狀清單、Todo 清單、引用、程式碼區塊、表格及分隔線。

## 不在本次範圍

- 不將附件、分享、專案、截止日或計時欄位塞入 Markdown 文件。
- 筆記內的 Todo checkbox 不會改變外層 Todo entity 的 `status`。
- 不改變資料庫欄位，不新增 migration。
- 不引入需要重型 build pipeline 的第三方編輯器。

## 核心決策

### Markdown 是唯一儲存格式

資料庫與匯出資料仍保存 Markdown 字串。Block AST 只存在於編輯器執行期間，因此既有資料、備份與跨介面資料契約維持相容。

### 共用 Markdown 核心

新增可被 Web 與 Extension 共用的 `shared/markdown/`，提供：

- `parseMarkdown(markdown)`：Markdown 字串轉成 Block AST。
- `serializeMarkdown(blocks)`：Block AST 轉回 Markdown。
- `renderMarkdown(markdown)`：輸出經 escape 的安全預覽 HTML。

Web 與 Extension 的 UI adapter 各自處理畫面、游標與事件，但不得各自實作 Markdown parsing 規則。

Block 類型至少包含：

- `paragraph`
- `heading`（level 1–6）
- `list`（ordered／unordered，支援巢狀 items）
- `taskList`（checked 狀態與巢狀 items）
- `blockquote`
- `codeBlock`
- `table`
- `horizontalRule`

Inline 內容以文字與 mark 表示，支援 `bold`、`italic`、`code`、`link`。

## 編輯互動

在空白段落輸入下列前綴並按空白鍵時，轉換成對應 block：

- `# ` 至 `###### `：標題
- `- `、`* `、`+ `：無序清單
- `1. `：有序清單
- `- [ ] ` 或 `- [x] `：Todo 清單
- `> `：引用
- ````` ``：程式碼區塊

清單項目按 Enter 會建立同類型的下一項；空白項目再次按 Enter 會離開清單。`Tab`／`Shift+Tab` 調整清單階層。`Ctrl/Cmd+B`、`Ctrl/Cmd+I`、`Ctrl/Cmd+K` 與工具列提供相同的 inline formatting 能力。

checkbox 使用真正的 checkbox 元素。點擊時只更新目前 item 的 `checked` 狀態，並重新序列化為 `[ ]` 或 `[x]`。中文 IME composition 期間不執行 shortcut conversion，於 composition 結束後再處理。

貼上多行 Markdown 時解析成 blocks；普通純文字則建立段落。無法辨識的內容以純文字保留。

## 現有介面整合

編輯器套用到目前所有 Markdown 欄位：

- Todo 備註
- 專案筆記
- 排程備註
- 計時中的工作紀錄
- 時間紀錄備註
- Web 對應的 `notes` 欄位

現有保存時機不變：表單仍在原本的儲存動作保存，計時筆記沿用目前的自動保存。`source` Markdown 模式保留，作為進階編輯與資料修復入口。

預計元件邊界：

```text
shared/markdown/
  parser.js
  serializer.js
  renderer.js
  *.test.js

web/components/MarkdownBlockEditor.tsx
extension/src/lib/markdown-editor.js
```

現有 `MarkdownPreview` 與 Extension preview 改用共用 renderer，移除兩邊目前對 tables、巢狀清單與 task list 的行為差異。

## 安全性與可及性

- 所有文字與 table cell 先 escape HTML。
- 連結只允許 `https://`，並保留安全的 `target`／`rel` 屬性。
- checkbox 必須具備可見或可推導的 label、鍵盤操作與 `aria` 狀態。
- 不直接渲染未經共用 renderer 處理的 HTML；若 UI 使用 `dangerouslySetInnerHTML`，輸入只能是共用 renderer 產生的已 escape 結果。

## 測試策略

共用核心測試：

- 所有 block 類型的 parse／serialize round-trip。
- inline marks、連結、code fence 與 table。
- 巢狀清單與 task list checked 狀態。
- 不支援語法與惡意 HTML 的保留／escape 行為。

編輯器測試：

- Markdown shortcut conversion。
- Enter、空白項目、Tab 階層與 checkbox toggle。
- 中文 IME composition 不被中斷。
- Web 與 Extension 使用相同 fixture 時產生相同 Markdown 與預覽結構。

驗證命令沿用 repository guidelines：

```bash
node --test extension/src/lib/*.test.js extension/test/*.test.mjs
cd web && npm run typecheck
```

## 實作順序

1. 建立 shared Markdown AST、parser、serializer、renderer 與 fixtures。
2. 將現有 Web／Extension preview 遷移到共用 renderer。
3. 建立 block editor adapters，先覆蓋 paragraph、heading、list、task list。
4. 加入 quote、code、table、link 與 toolbar 整合。
5. 套用到所有現有 Markdown 欄位，保留原保存流程。
6. 執行 Extension tests、Web typecheck 與手動檢查中文輸入、貼上、undo、checkbox 操作。
