# 工作筆記圖片與公開分享設計

## 目標

讓 Todo、計時紀錄與專案筆記支援圖片附件，並讓每一筆內容都能建立不需登入即可閱讀的公開網址。

## 範圍

- 支援 `tasks.notes`、`time_entries.notes` 與 `projects` 的筆記圖片附件。
- 每一筆 Todo、計時紀錄或專案可建立單獨的公開分享連結。
- 公開頁只讀，顯示文字筆記、圖片附件與該筆內容的基本資訊。
- 分享連結可撤銷，撤銷後立即不可閱讀。
- 不支援期間彙整分享，也不在本次加入公開頁編輯功能。

## 建議架構

使用 Supabase Storage 儲存圖片，使用資料表保存附件 metadata 與分享 token。圖片 bucket 維持私有，公開頁透過安全 RPC 驗證 token 後取得短效 signed URL，避免任意知道 storage path 的人直接讀取。

附件資料表 `note_attachments` 使用三個 nullable foreign key：`project_id`、`task_id`、`time_entry_id`，並以 constraint 保證恰有一個欄位有值。欄位包含 storage path、原始檔名、MIME type、大小與建立時間。

分享資料表 `note_shares` 使用同樣的三種 nullable foreign key，另存隨機 token、建立者、建立時間與 `revoked_at`；constraint 保證恰有一個分享目標。公開 RPC 只回傳 token 對應的單筆資料、附件 metadata 與短效圖片 URL。

## 使用流程

1. 使用者在 Todo、計時紀錄或專案筆記編輯區選取一張或多張圖片。
2. 前端限制 JPEG、PNG、GIF、WebP，單張上限 10 MB，並顯示預覽。
3. 儲存文字成功後上傳圖片，再寫入附件 metadata；單張失敗不回滾既有文字或其他成功附件。
4. 使用者按下建立分享連結，系統產生或返回該筆目前有效的 token。
5. `/share/[token]` 呼叫公開讀取流程，顯示內容與圖片。
6. 撤銷分享會設定 `revoked_at`；公開 RPC 對撤銷或不存在的 token 統一回傳 not found。

## 介面

- Todo 編輯表單、計時紀錄編輯視窗、專案編輯表單加入共用的附件元件。
- 附件元件顯示縮圖、檔名、大小、上傳狀態與刪除操作。
- 三種內容都提供建立、複製與撤銷分享操作。
- 公開頁顯示內容類型、標題或描述、專案／時間等基本資訊、文字筆記與圖片牆。

## 錯誤處理

- 非支援格式或超過 10 MB 時，在選取當下拒絕並顯示原因。
- 上傳或 metadata 寫入失敗時保留文字內容，標示失敗附件並允許重試。
- 公開 token 不存在或已撤銷時顯示無法查看，不洩漏是否曾存在。
- signed URL 失效或圖片讀取失敗時只顯示圖片替代狀態，文字仍可閱讀。

## 安全與權限

- 新增附件與分享只能由原本有權限編輯該 team 資料的使用者執行。
- Storage bucket 私有，公開頁不直接暴露永久圖片 URL。
- token 使用 `gen_random_uuid()` 或等效高熵隨機值。
- 公開 RPC 僅依 token 讀取單筆資料與附件，不提供任意 ID 查詢。

## 測試與驗證

- schema constraint 與 RLS：附件、分享目標不得同時或全部為空；非成員不可寫入。
- 檔案驗證：格式、大小、預覽與失敗重試。
- 分享流程：建立、複製、公開讀取、撤銷與撤銷後拒絕讀取。
- 三種內容類型皆可渲染文字與圖片。
- 執行 web typecheck、build，以及可用的單元／整合測試。
