# Chrome Web Store 權限說明

以下文字可直接貼到 Chrome Web Store 的權限理由欄位。

## 中文

### storage

用來儲存使用者在 TodoTracker 中建立的 Todo、工作紀錄、計時器狀態、提醒設定與偏好設定。資料儲存在使用者自己的 Chrome 本機儲存空間，extension 不會讀取其他網站資料。

### alarms

用來每分鐘更新工作計時器狀態，並檢查 Todo 的排程與提醒時間。提醒需要在 Chrome 背景執行時準時觸發。

### idle

用來偵測使用者是否暫時離開電腦或鎖定螢幕，避免把閒置時間錯誤計入工作時間。

### notifications

用來在 Todo 到達設定的提醒時間時顯示 Chrome 桌面通知，讓使用者知道該處理哪一項工作。

### identity 和 Google Drive API 網域

使用者主動連結 Google Drive 時，向 Chrome 取得 Google 授權，並呼叫 Drive API 儲存和還原使用者自己的 TodoTracker 備份。使用 `drive.file` 權限範圍。

啟用跨瀏覽器授權的版本也會向 TodoTracker 的 Supabase Edge Function 交換及更新 Google OAuth 權杖。備份內容由擴充套件直接傳給 Google Drive。

### Remote code

請選擇：**否，我沒有使用遠端程式碼**。

所有 JavaScript、HTML、CSS 與 extension 功能都直接包在 extension 內，沒有從遠端下載或執行程式碼。

---

## English

### storage

Used to store Todos, work logs, timer state, reminder settings, and user preferences created in TodoTracker. The data stays in the user's local Chrome storage. The extension does not read data from other websites.

### alarms

Used to update the work timer in the background and check scheduled Todo reminders. This allows reminders to trigger at the expected time while Chrome is running.

### idle

Used to detect when the user is away from the computer or the screen is locked, so idle time is not incorrectly counted as work time.

### notifications

Used to show a Chrome desktop notification when a Todo reaches its reminder time, so the user knows which task needs attention.

### identity and Google Drive API host

Used to authorize Google Drive through Chrome after the user connects their account, then call the Drive API to save and restore the user's TodoTracker backups with the `drive.file` scope.

Builds with cross-browser authorization also use TodoTracker's Supabase Edge Function to exchange and refresh Google OAuth tokens. The extension sends backup contents directly to Google Drive.

### Remote code

Select: **No, I am not using remote code**.

All JavaScript, HTML, CSS, and extension functionality are packaged with the extension. The extension does not download or execute code from a remote server.
