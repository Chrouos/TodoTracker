# 自訂日期區間與 Markdown Table 設計

## 目標

讓「紀錄」與「報表」都能使用自訂起訖日期篩選資料，並讓 Markdown preview 將標準 Markdown table 轉成可讀表格。

## 自訂日期區間

- 保留今日／本週／本月／全部快速篩選。
- 新增「自訂」模式，提供開始日、結束日與套用按鈕。
- 起訖日期都以本機時區的整天計算，結束日包含到 23:59:59。
- 自訂區間共用同一組狀態，紀錄頁與報表頁的控制項保持同步。
- 自訂區間會影響紀錄清單、紀錄筆數與工時、報表 KPI、專案分配、每日趨勢、時間軸及 CSV 匯出。
- 缺少任一日期或開始日晚於結束日時，不更新目前篩選，並顯示明確提示。

## Markdown Table

- 辨識含有 separator row（例如 `| --- | ---: |`）的連續 pipe rows。
- 第一列轉成 `<thead>`，其餘列轉成 `<tbody>`。
- 支援左對齊、右對齊與置中對齊：`---`、`---:`、`:---:`。
- 儲存格內容沿用既有 inline Markdown 轉換與 HTML escaping。
- 表格資料不完整時以空字串補齊欄位，不拋出例外。
- 新增適合 preview 的 border、padding、水平滾動與欄位對齊樣式。

## Hook 診斷結論

`post tool use hook failed` 不是 TodoTracker 的程式或 Git hook。repo 的 `.git/hooks` 只有 sample hooks，Git 沒有設定 `core.hooksPath`，且 TodoTracker 沒有 hook 設定。錯誤來自 Orca agent hook：目前 Orca process 監聽 `127.0.0.1:56423`，但現有工作階段環境帶有舊的 `ORCA_AGENT_HOOK_PORT=63305`。修復方式是重啟 Orca 工作階段，讓 hook endpoint 與環境變數重新同步；不修改 extension 來處理外部 runtime 狀態。

## 驗證

- Markdown tests 驗證表頭、資料列、欄位對齊與 HTML escaping。
- 日期篩選純函式測試包含包含頭尾、空值、反向區間與跨日邊界。
- 執行所有 Node tests、JavaScript syntax checks 與 `git diff --check`。
- 重新載入未封裝 extension，確認兩個頁面的自訂區間同步及 table preview。
