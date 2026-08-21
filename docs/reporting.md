# 報表功能說明

## Web `/reports`

Web 報表支援今日、本週、本月、全部與自訂日期區間，並可依專案、Todo、Tag、描述或 notes 篩選。篩選會同步影響 KPI、每日趨勢、專案分配、時間軸、績效摘要、明細、Markdown 摘要與 CSV。

報表也會顯示：

- 對比前一個等長期間的工時差異。
- 未分類工時、沒有 notes 的紀錄、未綁定 Todo 的工時。
- Todo／專案完成率、逾期數、實際工時與平均完成週期。

明細使用分頁，不會在全部範圍時只顯示前 200 筆。

## 日期與工時口徑

跨午夜的 Entry 會依實際重疊秒數分配到所經過的每個本機日期。例如 23:30–01:30 會分成前一天 30 分鐘與隔天 90 分鐘；Entry 的總工時不變。

未結束或已刪除的 Entry 不會進入完成工時報表。未分類 project 與未綁定 task 會保留在統計中，並在資料品質區塊提示。

## Extension

Extension 保留原有的 project trend、Heatmap、Todo Tracker、每日回顧、CSV 與 Markdown 摘要，並新增同口徑的資料品質與 project／Todo 績效摘要。

## 尚未納入

Team／assignee 報表、預估工時、容量目標、billable 欄位、儲存報表檢視與排程寄送報表需要另外的資料模型與同步設計。
