# 工作筆記圖片與公開分享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 Todo、計時紀錄與專案筆記支援圖片附件，並提供可撤銷、免登入閱讀的單筆公開分享網址。

**Architecture:** 以 Supabase Storage 私有 bucket 儲存圖片，`note_attachments` 保存附件 metadata，`note_shares` 保存高熵 token。已登入的編輯介面透過 Supabase client/API 上傳與管理資料；公開 `/share/[token]` 頁面只透過安全 RPC 取得單筆內容與短效 signed URL。既有 extension bridge 繼續負責時間與本機資料操作，附件與分享服務以獨立模組接入。

**Tech Stack:** Next.js App Router、React、TypeScript、Supabase Postgres/RLS/Storage、Supabase JS client、Vitest。

## Global Constraints

- 分享範圍只包含單一 Todo、單一計時紀錄或單一專案。
- 公開分享頁不要求登入且只讀；token 不存在或已撤銷時統一回傳 not found。
- 支援 `image/jpeg`、`image/png`、`image/gif`、`image/webp`；單張上限 10 MB。
- 圖片 bucket 必須是 private；公開頁使用短效 signed URL，不暴露永久 storage URL。
- 附件與分享寫入須受原有 team member RLS 保護。
- 文字保存成功不可因單張圖片失敗而回滾；失敗附件可重試。
- 每個 task 結束都要執行該 task 的測試並建立單獨 commit。

## File Map

- Modify: `supabase/schema.sql` — 新增附件／分享表、Storage policy、公開 RPC。
- Create: `supabase/migrations/202608040001_work_note_images_sharing.sql` — 可獨立套用的 migration，內容與 schema 更新一致。
- Modify: `web/package.json` — 加入 Supabase 與測試依賴、test script。
- Create: `web/lib/supabase/client.ts` — browser client 與環境變數檢查。
- Create: `web/lib/supabase/server.ts` — server-side client 與公開 RPC helper。
- Create: `web/lib/attachments.ts` — MIME/size validation、path 生成、附件型別與 API helpers。
- Create: `web/lib/attachments.test.ts` — 附件驗證與路徑測試。
- Create: `web/components/AttachmentPicker.tsx` — 共用預覽、選取、刪除與上傳狀態元件。
- Create: `web/components/ShareControls.tsx` — 建立、複製、撤銷分享控制元件。
- Modify: `web/lib/types.ts` — Attachment、Share、ShareTarget 型別。
- Modify: `web/app/todos/page.tsx` — Todo 附件與分享操作。
- Modify: `web/app/log/page.tsx`、`web/components/EntryDialog.tsx` — 計時紀錄附件與分享操作。
- Modify: `web/app/projects/page.tsx` — 專案筆記附件與分享操作。
- Create: `web/app/api/share/[token]/route.ts` — 公開 token JSON endpoint。
- Create: `web/app/share/[token]/page.tsx` — 公開只讀分享頁。
- Create: `web/components/SharedNoteView.tsx` — 三種內容共用的公開渲染。
- Create: `web/app/share/[token]/page.test.tsx` — 公開頁資料狀態測試。

### Task 1: 建立資料庫與 Storage 安全邊界

**Files:**
- Create: `supabase/migrations/202608040001_work_note_images_sharing.sql`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces `note_attachments`, `note_shares`, `get_shared_note(text)`, `create_note_share(...)`, `revoke_note_share(uuid)`。

- [ ] **Step 1: Write the failing SQL assertions**

新增 migration 後以 Supabase SQL editor 執行下列驗證查詢，先確認新物件不存在或查詢失敗：

```sql
select 1 from note_attachments limit 1;
select 1 from note_shares limit 1;
select * from get_shared_note('00000000-0000-0000-0000-000000000000');
```

- [ ] **Step 2: Implement schema and policies**

建立三個 nullable target foreign keys 並加入「恰有一個 target」check constraint；`note_shares.token` unique，`revoked_at is null` 的 target 建立 partial unique index。建立 private bucket `note-attachments`，member write policies 僅允許對 team member 的 target 寫入；公開 RPC 使用 `security definer`，只依 token 查詢且回傳最小資料集與附件 metadata。

- [ ] **Step 3: Keep canonical schema synchronized**

把同一組 table、index、policy、function 與 bucket policy 加到 `supabase/schema.sql`，確保新環境與 migration 都可建立相同結構。

- [ ] **Step 4: Run database checks**

Run: `git diff --check` and apply the migration in a disposable Supabase database/project.
Expected: constraints reject zero/multiple targets; team member can write; anonymous caller can only read a valid, non-revoked token through `get_shared_note`.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/migrations/202608040001_work_note_images_sharing.sql
git commit -m "feat: add work note attachment and share schema"
```

### Task 2: 建立 TypeScript 服務層與附件驗證

**Files:**
- Modify: `web/package.json`, `web/lib/types.ts`
- Create: `web/lib/supabase/client.ts`, `web/lib/supabase/server.ts`, `web/lib/attachments.ts`, `web/lib/attachments.test.ts`

**Interfaces:**
- `validateImage(file: File): { ok: true } | { ok: false; error: string }`
- `attachmentPath(target: ShareTarget, userId: string, fileName: string): string`
- `type ShareTarget = { kind: 'task' | 'entry' | 'project'; id: string }`
- `type Attachment = { id: string; target: ShareTarget; storagePath: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }`

- [ ] **Step 1: Add failing unit tests**

```ts
it('accepts supported image types at 10 MB and rejects larger files', () => {
  expect(validateImage(new File(['x'], 'a.png', { type: 'image/png' })).ok).toBe(true);
  expect(validateImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })).ok).toBe(false);
  expect(validateImage(new File(['x'], 'a.pdf', { type: 'application/pdf' })).ok).toBe(false);
});
```

- [ ] **Step 2: Add minimal Supabase clients and types**

Install `@supabase/supabase-js`, `@supabase/ssr`, and `vitest`; create clients from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, throwing a readable configuration error when absent. Map database snake_case fields to the TypeScript types.

- [ ] **Step 3: Implement validation and deterministic paths**

Use an explicit MIME allow-list and `10 * 1024 * 1024` byte limit. Generate paths as `<userId>/<kind>/<id>/<uuid>-<safe-basename>`; never use the original filename as the only path component.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run lib/attachments.test.ts` from `web`.
Expected: PASS for supported types, size boundary, rejection messages, and path sanitization.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/lib/types.ts web/lib/supabase web/lib/attachments.ts web/lib/attachments.test.ts
git commit -m "feat: add attachment service and validation"
```

### Task 3: 建立附件選取與分享控制元件

**Files:**
- Create: `web/components/AttachmentPicker.tsx`
- Create: `web/components/ShareControls.tsx`
- Modify: `web/lib/attachments.ts`, `web/lib/types.ts`

**Interfaces:**
- `<AttachmentPicker target={ShareTarget} attachments={Attachment[]} onChange={...} />`
- `<ShareControls target={ShareTarget} share={Share | null} onChanged={...} />`

- [ ] **Step 1: Write failing component tests**

Cover: file input accepts only image MIME types, invalid files show an error, selected images render thumbnails, delete invokes the callback, create share shows a copied URL, and revoke removes the active share.

- [ ] **Step 2: Implement `AttachmentPicker`**

Use a hidden `input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp"`; validate each file before upload; render object URLs for local previews; upload to Storage, insert metadata, and expose per-file error/retry state. Revoke object URLs in an effect cleanup.

- [ ] **Step 3: Implement `ShareControls`**

Call the share RPC/API for create and revoke, use `navigator.clipboard.writeText`, and render the current absolute URL using `window.location.origin` plus `/share/${token}`.

- [ ] **Step 4: Run component tests**

Run: `npm test -- --run components/AttachmentPicker.test.tsx components/ShareControls.test.tsx`.
Expected: PASS with mocked Supabase calls and clipboard.

- [ ] **Step 5: Commit**

```bash
git add web/components web/lib/attachments.ts web/lib/types.ts
git commit -m "feat: add attachment picker and share controls"
```

### Task 4: 接入 Todo、計時紀錄與專案編輯流程

**Files:**
- Modify: `web/app/todos/page.tsx`
- Modify: `web/app/log/page.tsx`, `web/components/EntryDialog.tsx`
- Modify: `web/app/projects/page.tsx`

**Interfaces:**
- Each editor passes `target={{ kind, id }}` to `AttachmentPicker` and `ShareControls` after the record has a persisted ID.

- [ ] **Step 1: Add failing integration tests**

Verify each editor renders the attachment and share controls only when an ID exists, preserves existing notes on image failure, and refreshes attachments after save.

- [ ] **Step 2: Add Todo integration**

Keep the existing `act('upsertTask', ...)` save path; after a new task is created, render attachment/share controls for its returned ID. Existing tasks show current attachments and active share.

- [ ] **Step 3: Add entry integration**

Extend `EntryDraft` and `LogRow` to load the entry attachments; mount the picker and share control in `EntryDialog` and the log row without changing timer duration behavior.

- [ ] **Step 4: Add project integration**

Locate the project edit form in `web/app/projects/page.tsx`; preserve project tree operations and add the same attachment/share controls to the persisted project note editor.

- [ ] **Step 5: Run web typecheck and integration tests**

Run: `npm test -- --run`; `npm run typecheck`.
Expected: all tests pass and no existing bridge/store types regress.

- [ ] **Step 6: Commit**

```bash
git add web/app/todos/page.tsx web/app/log/page.tsx web/components/EntryDialog.tsx web/app/projects/page.tsx
git commit -m "feat: attach images and sharing to work notes"
```

### Task 5: 建立公開分享 API 與只讀頁

**Files:**
- Create: `web/app/api/share/[token]/route.ts`
- Create: `web/app/share/[token]/page.tsx`
- Create: `web/components/SharedNoteView.tsx`
- Create: `web/app/share/[token]/page.test.tsx`

**Interfaces:**
- `GET /api/share/:token` returns `{ kind, title, description, projectName, startedAt, endedAt, notes, attachments: { id, fileName, mimeType, signedUrl }[] }` or `404`.
- `GET /share/:token` renders the same payload as a server-rendered read-only page.

- [ ] **Step 1: Add failing route tests**

Mock the public RPC and assert a valid token returns 200 with only the target record, a missing/revoked token returns 404, and no internal IDs other than the target/attachment IDs leak into unrelated fields.

- [ ] **Step 2: Implement the API route**

Normalize the token, reject malformed values with 404, call `get_shared_note`, create signed URLs with a short expiry, and return `Cache-Control: no-store` so revocation takes effect immediately.

- [ ] **Step 3: Implement the shared view**

Render a semantic heading, type label, basic metadata, plain text notes, and responsive image grid with filename alt text. Add loading/error/not-found states and no edit controls.

- [ ] **Step 4: Run route/page tests**

Run: `npm test -- --run app/share/[token]/page.test.tsx`; `npm run typecheck`.
Expected: public success, not-found, revoked, and image-failure states pass.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/share web/app/share web/components/SharedNoteView.tsx
git commit -m "feat: add public work note sharing page"
```

### Task 6: 完整驗證與文件更新

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/images/README.md` if upload/deployment configuration is documented there
- Modify: `web/README.md`

- [ ] **Step 1: Document required configuration**

Document `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the private `note-attachments` bucket, migration application, and the 10 MB image limit. Do not document or expose a service-role key in browser configuration.

- [ ] **Step 2: Run all automated checks**

Run from `web`: `npm test -- --run`, `npm run typecheck`, `npm run build`.
Expected: all tests pass, typecheck exits 0, and Next production build completes.

- [ ] **Step 3: Run manual acceptance checks**

Create one Todo, one time entry, and one project note; upload one valid image and attempt one invalid/oversized image; create and copy each share URL in a signed-out browser; verify text/images render; revoke each URL and verify the same URLs return not found.

- [ ] **Step 4: Commit documentation and verification changes**

```bash
git add docs/ARCHITECTURE.md docs/images/README.md web/README.md
git commit -m "docs: document work note sharing setup"
```
