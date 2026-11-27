# TodoTracker 隱私權政策

最後更新日期：2026 年 11 月 20 日

TodoTracker 是一個用來記錄工作時間、管理 Todo 與設定提醒的 Chrome extension。

## 我們儲存哪些資料

TodoTracker 可能會在你的 Chrome 本機儲存以下資料：

- Todo 項目、優先級、截止日期與提醒時間
- 工作計時器狀態與工作紀錄
- 專案、標籤與你的 extension 設定

這些資料是你主動輸入的內容，並儲存在你自己的 Chrome 本機儲存空間。

## 選用的 Google Drive 備份

授權後，擴充使用 Google Drive 的 `drive.file` 權限，在你自己的 Drive 建立、讀取及管理 TodoTracker 的 JSON 備份。擴充會在本機保存連結帳號的識別資料和電子郵件地址，以確認備份帳號並在設定頁顯示。中斷連結會停用自動備份並清除本機連結資料。你可以在 Google Drive 管理或刪除已上傳的備份。

使用跨瀏覽器授權時，TodoTracker 的 Supabase Edge Function 會將授權碼或更新權杖轉交給 Google，以換取存取權杖。更新權杖儲存在擴充套件的本機儲存空間。備份內容由擴充套件直接傳給 Google Drive。

## 我們不會做什麼

TodoTracker：

- 不會讀取你的瀏覽紀錄、網站內容或其他網站資料
- 不會將待辦、計時紀錄或備份內容上傳到我們的伺服器
- 不會出售或出租使用者資料
- 不使用廣告、分析工具或跨網站追蹤

## 權限用途

- `storage`：儲存 Todo、工作紀錄、計時器與設定
- `alarms`：更新計時器並檢查提醒時間
- `idle`：避免把電腦閒置時間計入工作時間
- `notifications`：在提醒時間顯示 Chrome 通知

## 資料刪除

你可以在 TodoTracker 中刪除 Todo、工作紀錄或匯出資料。若要完整移除本機資料，可以在 Chrome 的 extension 管理頁面移除 TodoTracker，或使用 extension 提供的資料清除功能。

## 政策變更

如果未來功能或資料處理方式有重大變更，我們會更新本政策的最後更新日期與內容。

## 聯絡方式

隱私權問題或資料刪除請聯絡：請在此填入你的公開聯絡信箱。

---

# TodoTracker Privacy Policy

Last updated: November 20, 2026

TodoTracker is a Chrome extension for tracking work time, managing Todos, and setting reminders.

## Data we store

TodoTracker may store the following data in Chrome's local storage on your device:

- Todo items, priorities, due dates, and reminder times
- Timer state and work logs
- Projects, tags, and extension settings

This data is entered by you and remains in your local Chrome storage.

## Optional Google Drive backup

If you connect Google Drive, the extension uses the `drive.file` scope to create, read, and manage TodoTracker JSON backups in your Drive. It stores the connected account identifier and email locally to confirm the backup destination and display the account in settings. Disconnecting stops automatic backups and clears the local connection details. You can manage or delete uploaded backups in Google Drive.

For cross-browser authorization, TodoTracker's Supabase Edge Function passes authorization codes or refresh tokens to Google in exchange for access tokens. The extension stores the refresh token locally and sends backup contents directly to Google Drive.

## What we do not do

TodoTracker:

- Does not read browsing history, website content, or data from other websites
- Does not upload your tasks, time entries, or backup contents to our servers
- Does not sell or rent user data
- Does not use ads, analytics, or cross-site tracking

## Permission usage

- `storage`: stores Todos, work logs, timer state, and settings
- `alarms`: updates the timer and checks reminder times
- `idle`: prevents inactive time from being counted as work time
- `notifications`: shows Chrome notifications when reminders are due

## Data deletion

You can delete Todos and work logs or export your data from TodoTracker. To remove all local data, uninstall TodoTracker from Chrome or use the extension's data-clearing feature.

## Changes to this policy

If the extension's features or data practices change significantly, we will update this policy and its last-updated date.

## Contact

For privacy questions or data deletion requests, contact: replace-with-your-public-contact-email@example.com
