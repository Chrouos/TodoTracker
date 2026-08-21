# 報表一致性與可行動洞察實作計畫

## Objective and scope

將報表從「多張圖表」提升為可比較、可篩選、可採取行動的工作分析，同時讓 Chrome Extension 與 Web `/reports` 使用一致的日期與工時口徑。

本次包含：

- 修正 Web 目前阻擋 `npm run typecheck` 的資料型別問題。
- 統一跨午夜紀錄的每日分配方式。
- Web 報表補上自訂日期區間、專案／Todo／Tag 篩選、前期比較。
- Web 與 Extension 都顯示資料品質指標：未分類工時、無 notes 紀錄、未綁定 Todo 的工時、逾期 Todo。
- 增加 Todo／專案績效摘要：完成率、平均完成週期、實際工時、逾期狀態。
- 保留目前報表、CSV、Markdown 摘要與既有資料格式相容。

本次不包含：

- Team／assignee 報表與登入同步；Supabase schema 已有基礎，但目前 Extension 仍是 local-only，需另開整合階段。
- 預估工時、容量規劃與付費／billable 欄位；這些需要先確認產品資料模型。
- 儲存報表檢視、排程寄送報表與公開報表連結。

## Technical baseline

- Extension 報表已具備 Todo health、project trend、Heatmap、Todo Tracker、每日回顧與 CSV 匯出。
- Web `/reports` 目前只有 KPI、專案甜甜圈、時間軸、每日趨勢與明細。
- Extension 與 Web 的 `dailySeries` 目前依 `startedAt` 歸類；時間軸則會切分跨午夜紀錄，造成同一筆紀錄在不同圖表的日分配不一致。
- 目前 Extension Node tests 為 49/49 通過；Web `npm run typecheck` 會被 `Project.notes` 重複宣告、ProjectNotes 使用方式與測試 fixture 型別錯誤阻擋。

## Ordered implementation stages

### Stage 1 — 修復型別基線與建立報表 domain contract

先以測試描述報表輸入／輸出，再修正型別與新增純函式，避免 UI 直接各自計算口徑。

Files:

- Modify `web/lib/types.ts`：移除 `Project.notes` 的重複字串宣告，保留 `ProjectNote[]`；讓舊資料可能缺少的 `Task.dueTime`／`Task.scheduleId` 可相容。
- Add `web/lib/report.ts`：提供日期區間、Entry filter、跨午夜 daily allocation、period comparison、data quality 與 project/task metrics。
- Add `web/lib/report.test.ts`：涵蓋跨午夜、空資料、自訂區間、前期比較、未分類工時與逾期 Todo。
- Add `extension/src/lib/report-metrics.js`：以 Extension 可直接載入的 ES module mirror Web domain contract，保持輸出欄位與語意一致。
- Add `extension/test/report-metrics.test.mjs`：先驗證 Extension mirror 的核心 contract。

Verification:

- 先執行新測試，確認新行為在實作前失敗。
- `node --test extension/test/report-metrics.test.mjs`
- `npm run typecheck`（Stage 1 完成後應至少不再出現既有型別錯誤）。

### Stage 2 — 統一每日工時分配

以「一筆 Entry 跨過幾天，就依實際重疊秒數分到各天」為唯一口徑；同一筆 Entry 的總秒數仍不變。

Files:

- Modify `extension/src/lib/time.js` 的 `dailySeries`。
- Modify `web/lib/time.ts` 的 `dailySeries`。
- Extend `extension/src/lib/time.test.js` 與／或 `extension/test/report-range.test.mjs` 的跨午夜測試。
- Extend `web/lib/report.test.ts` 的相同 contract。

Important constraints:

- 使用本機日期邊界，與既有 `fmtDate`、`startOfDay` 相容。
- `timelineData`、Todo Tracker 的 clipping 行為不改變。
- 空白日仍要輸出 0，避免折線圖斷裂。

### Stage 3 — Web 報表補齊核心能力

先測試 `web/lib/report.ts`，再把 UI 接到同一份 selector 結果。

Files:

- Modify `web/app/reports/page.tsx`：
  - 增加 custom from/to controls。
  - 增加專案、Todo、Tag 篩選與清除篩選。
  - 顯示前期總時數、差異百分比與空資料狀態。
  - 將 daily trend、project distribution、detail list 改用統一 filtered rows。
  - 將明細由固定 `slice(0, 200)` 改為可分頁或明確的載入更多。
  - 增加資料品質與 Todo／專案績效摘要區塊。
- Modify `web/components/Charts.tsx`：補上必要的圖表 tooltip／accessibility 文案，維持既有 SVG 風格。
- Modify `web/app/globals.css`：新增報表 filter bar、comparison KPI、quality cards、metrics table 與 responsive layout。
- Modify `web/lib/summary.ts`：若需要，讓 Markdown summary 使用相同 filtered rows；維持原有呼叫介面。

Manual acceptance:

- Web 選自訂區間後，所有 KPI、圖表、明細、CSV／Markdown 摘要都只反映該區間。
- 選專案／Todo／Tag 後，前期比較與資料品質指標不再混入未篩選資料。
- All range 的明細可看到第 201 筆之後的資料。

### Stage 4 — Extension 報表接上同一套洞察

不重做現有 Extension 圖表，只將 selector／metrics contract 接入，減少 Web 與 Extension 漂移。

Files:

- Modify `extension/src/options/options.js`：
  - 使用 `report-metrics.js` 產生資料品質摘要與 project/task metrics。
  - 將 Todo health 明確標示為「全域」或依目前報表範圍計算，避免語意模糊；本次採用依目前篩選範圍的 active work，逾期 Todo 仍另外標示全域數字。
  - 保留既有 project trend、Heatmap、Todo Tracker、每日回顧與 CSV。
- Modify `extension/src/options/options.html`：加入品質與績效摘要的語意標籤，必要時補 filter control。
- Modify `extension/src/options/options.css`：沿用現有 tokens，補 cards／table 的 responsive 樣式。
- Add or extend `extension/test/options-layout.test.mjs`：檢查新增報表區塊存在且不破壞既有面板。

### Stage 5 — 回歸驗證與文件更新

Files:

- Modify `README.md` 或 `web/README.md`：更新 Web／Extension 報表能力與資料口徑說明。
- Add `docs/reporting.md`：記錄篩選、比較、資料品質與跨午夜分配口徑。
- Resolve pre-existing Next.js ambiguous dynamic routes by moving the standalone ProjectWorkspace route to `/project-workspace/[projectId]` and merging share GET／DELETE into `/api/share/[shareId]`.
- Review `docs/superpowers/plans/2026-08-21-report-parity-and-insights-plan.md` against the final diff.

Verification commands:

- `node --test extension/src/lib/*.test.js extension/test/*.test.mjs`
- `npm run typecheck` from `web/`
- `npm run build` from `web/`
- `git diff --check`
- Manual Chrome extension check: report range, custom range, filters, project trend, Todo Tracker, CSV, Markdown summary, overnight entry.
- Manual Web check: same data and same overnight entry produce the same daily totals.

## Error states and compatibility

- 自訂日期不完整或起訖反轉時，不套用範圍並顯示可理解的錯誤訊息。
- 無資料時所有 chart、table、comparison 都顯示空狀態，不產生 NaN 或負百分比。
- 舊 Entry、Task、Project 缺少新欄位時使用既有 fallback，不修改匯出 JSON version。
- deleted／未結束 Entry 不進入完成工時報表。
- 未分類 project 與未綁定 task 必須保留在統計中，不能靜默丟失。

## Follow-up platform checks

完成本次後，再決定是否開第二階段：Supabase team report、assignee filter、estimated seconds、capacity target、scheduled report export。這些不應與本次 local-only report parity 混在同一個資料遷移中。
