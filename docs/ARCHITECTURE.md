# TodoTracker — 架構規劃

Chrome 擴充（計時）+ Next.js 網頁（登入 / team / 報表），資料層 Supabase。

---

## 1. 元件切分

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Chrome Extension (MV3) │        │  Next.js Web (App Router)│
│  ─ popup: React 計時 UI │        │  ─ 登入 / 註冊           │
│  ─ SW: 狀態單一來源     │        │  ─ Team 建立 / 邀請      │
│  ─ storage: 離線佇列    │        │  ─ 專案 / 標籤 / Todo    │
│  ─ idle: 閒置偵測       │        │  ─ 報表 dashboard        │
└───────────┬─────────────┘        └────────────┬─────────────┘
            │  supabase-js (同一把 anon key)     │
            └───────────────┬────────────────────┘
                            ▼
              ┌──────────────────────────────┐
              │  Supabase                    │
              │  Auth (JWT) · Postgres + RLS │
              │  RPC: start/stop/accept      │
              │  Edge Function: 寄邀請信     │
              └──────────────────────────────┘
```

**重點：擴充不需要自己的後端。** 直接用 `supabase-js` 打 Supabase，權限由 RLS 擋住。網頁端只多了 SSR 那層。

---

## 2. Auth Bridge（擴充怎麼拿到登入狀態）

擴充不做自己的登入頁，session 從網頁「遞」過去：

1. `manifest.json` 加 `externally_connectable: { matches: ["https://你的網域/*"] }`
   → 意思是只有你的網站能對擴充發訊息。
2. 使用者在網頁登入 → 網頁拿到 Supabase session（含 `access_token` / `refresh_token`）。
3. 網頁呼叫 `chrome.runtime.sendMessage(EXTENSION_ID, { type: 'AUTH', session })`。
4. 擴充 SW 收到後存進 `chrome.storage.local`，再 `supabase.auth.setSession(session)`。
5. 之後 refresh token 由 supabase-js 自動續期，不用再回網頁。

> 備案：`chrome.identity.launchWebAuthFlow` 走 OAuth。乾淨但要多設一個 redirect URL，MVP 先用上面那條。

登出：網頁發 `{ type: 'SIGN_OUT' }`，擴充清 storage。

---

## 3. 計時器狀態機（MV3 的坑）

MV3 的 service worker **閒置約 30 秒就被殺掉**，所以：

- ❌ 不要用 `setInterval` 在 SW 裡累加秒數
- ✅ 只存 `started_at` 這個時間戳到 `chrome.storage.local`，經過時間都用 `Date.now() - started_at` 現算

```
IDLE ──start()──► RUNNING ──stop()──► IDLE
                    │
                    └─ chrome.idle 偵測到 15 分鐘沒動
                       → popup 開啟時詢問「要扣掉這段嗎？」
```

- Badge 顯示分鐘數：用 `chrome.alarms`（最小週期 1 分鐘）更新，SW 被叫醒才寫 badge。
- Popup 開著時自己跑 `setInterval` 顯示秒數，關掉就停。
- 開機/重載時從 storage 復原狀態。

---

## 4. 離線 & 同步策略（local-first）

擴充的網路不能假設一直通，所以計時**先寫本機、再補送**：

| 步驟 | 做什麼 |
|---|---|
| 1 | 按下 start，前端產一個 `client_entry_id = crypto.randomUUID()` |
| 2 | 立刻寫 `chrome.storage.local` 的 `pendingQueue` |
| 3 | 呼叫 RPC `start_timer(...)`，成功就從佇列移除 |
| 4 | 失敗（離線／401）→ 留在佇列，`chrome.alarms` 每 5 分鐘重送 |
| 5 | 重送用 `on conflict (user_id, client_entry_id) do update` → **重複送不會產生重複資料** |

DB 那邊還加了一條保險：`one_running_per_user` 這個 partial unique index，確保一個人同時只有一筆 `ended_at is null`。

---

## 5. 資料模型（詳見 `supabase/schema.sql`）

```
auth.users ─1:1─ profiles
teams ─1:N─ team_members ─N:1─ auth.users
      ├─1:N─ team_invites      (email + token，14 天過期)
      ├─1:N─ projects
      ├─1:N─ tags
      ├─1:N─ tasks             (todo：title / status / assignee / due_date)
      └─1:N─ time_entries ─N:N─ tags  (透過 time_entry_tags)
```

`time_entries` 的幾個設計決定：

- `duration_seconds` 是 **generated column**，不用前端算、不會不一致。
- `ended_at is null` 就代表「計時中」，不另外開狀態欄位。
- `deleted_at` 軟刪除，報表可以排除但保留稽核。
- `meta jsonb` 留給之後塞來源網址、瀏覽器分頁標題那類東西。
- `source` 記錄是擴充、網頁還是手動補登。

**筆記放哪**：不開獨立 table。臨時筆記 → `time_entries.description`；長期筆記 → `tasks.notes`。等真的需要獨立筆記再開。

---

## 6. 權限模型（RLS）

角色三層：`owner` / `admin` / `member`。

| 資源 | member | admin | owner |
|---|---|---|---|
| 看 team 全部時間紀錄 | ✅ | ✅ | ✅ |
| 改／刪自己的時間紀錄 | ✅ | ✅ | ✅ |
| 改別人的時間紀錄 | ❌ | ❌ | ❌ |
| 專案 / 標籤 / Todo CRUD | ✅ | ✅ | ✅ |
| 邀請、移除成員 | ❌ | ✅ | ✅ |
| 刪除 team | ❌ | ❌ | ✅ |

實作重點：policy 裡查 `team_members` 會**遞迴觸發自己的 RLS**，所以包成 `is_team_member()` / `team_role_of()` 兩個 `SECURITY DEFINER` 函式來繞過。這是 Supabase 多租戶最常踩的雷。

---

## 7. 邀請流程

```
admin 在網頁輸入 email
  → insert team_invites（自動產生 token）
  → Edge Function 寄信，連結 https://app/invite?token=xxx
  → 對方點連結
      ├─ 未註冊 → 先註冊（email 必須一致）
      └─ 已登入 → 呼叫 RPC accept_invite(token)
  → 寫入 team_members，invite 標記 accepted_at
```

`accept_invite` 會驗證 email 相符 + 未過期，所以 token 外洩也不能被別人用。

---

## 8. 目錄結構

```
TodoTracker/
├── docs/ARCHITECTURE.md
├── supabase/
│   ├── schema.sql          ← 目前這份
│   └── migrations/
├── web/                    ← Next.js 15 App Router
│   ├── app/(auth)/login
│   ├── app/(app)/[team]/{dashboard,projects,todos,reports,settings}
│   ├── app/invite/page.tsx
│   └── lib/supabase/{client,server}.ts
└── extension/              ← Vite + CRXJS + React
    ├── manifest.json
    ├── src/background/     ← SW：計時狀態、同步佇列、alarms
    ├── src/popup/          ← React UI
    └── src/lib/supabase.ts
```

兩邊共用 DB 型別：`supabase gen types typescript` 產出後複製到兩個專案（或抽成 `packages/types`）。

---

## 9. 分階段里程碑

| 階段 | 範圍 | 驗收標準 |
|---|---|---|
| **P0** | Supabase 專案 + `schema.sql` + RLS | 用兩個帳號手測：A 看不到 B 的 team 資料 |
| **P1** | 網頁登入 / 建 team / 邀請 | 第二個人能收信、點連結、進到 team |
| **P2** | 擴充計時 MVP + auth bridge | 網頁登入後，popup 能 start/stop，紀錄出現在 DB |
| **P3** | 專案 / 標籤 / Todo CRUD（網頁 + popup 下拉） | 計時能綁專案與 tag |
| **P4** | 報表 dashboard | 日/週視圖、依人與專案彙總、CSV 匯出 |
| **P5** | 進階 | 閒置偵測、離線佇列、自動偵測網站→專案、Pomodoro |

先做 P0→P2 就能自己天天用了，其餘按需求補。

---

## 10. 已知風險

| 風險 | 對策 |
|---|---|
| MV3 SW 被殺導致計時遺失 | 狀態只存 timestamp 在 storage，不放記憶體 |
| 跨裝置同時計時衝突 | `one_running_per_user` unique index 擋住；`start_timer` 會先關掉舊的 |
| 時區 | DB 一律 `timestamptz`（UTC），只有報表 view 才轉 `Asia/Taipei` |
| Supabase anon key 曝露在擴充裡 | 這是設計上就可公開的 key，安全性完全靠 RLS，所以 RLS 必須逐條測 |
| 擴充上架審核 | `externally_connectable` 要在說明頁講清楚用途，權限只申請 `storage`/`alarms`/`idle` |
