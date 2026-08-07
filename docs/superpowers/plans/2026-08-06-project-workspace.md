# 專案工作區 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立以單一專案為中心的工作區，集中顯示專案狀況、工作週期、Todo、工作日誌、報表與專案筆記。

**Architecture:** 從專案清單進入 `/projects/[projectId]`，頁面使用既有 `StoreProvider` snapshot。新增純函式聚合層，將目前專案與子專案的 tasks、entries、工時與狀態整理成工作區資料；所有編輯仍走既有 `act()`，不新增第二份狀態。

**Tech Stack:** Next.js App Router、React、TypeScript、既有 TodoTracker store、既有 time/tree/task helpers。

## Global Constraints

- 目前專案與所有子專案視為同一個工作範圍。
- 相關工作日誌必須以 `entry.projectId` 或 `entry.taskId` 對應到範圍內 Todo，且同一筆紀錄只顯示一次。
- 已刪除紀錄排除；工時只計算已結束的計時紀錄。
- 不改變既有 Todo、Entry、Project 的儲存格式與編輯流程。
- 圖片與公開分享功能維持 feature flag 關閉。
- 專案不存在、空專案、無工作日誌等狀態都要有獨立空狀態。

## File Map

- Create: `web/lib/projectWorkspace.ts` — 專案範圍、統計、週期與分組的純函式。
- Create: `web/lib/projectWorkspace.test.ts` — 聚合邏輯測試。
- Create: `web/app/projects/[projectId]/page.tsx` — 專案工作區頁面。
- Create: `web/components/ProjectWorkspace.tsx` — 概況、Todo、日誌、報表、筆記區塊。
- Modify: `web/app/projects/page.tsx` — 專案名稱連結至詳細頁。
- Modify: `web/app/globals.css` — 工作區排版與狀態樣式。

### Task 1: 建立專案工作區資料聚合

**Files:**
- Create: `web/lib/projectWorkspace.ts`
- Create: `web/lib/projectWorkspace.test.ts`

**Interfaces:**
- `buildProjectWorkspace(projectId: string, projects: Project[], tasks: Task[], entries: Entry[]): ProjectWorkspaceData`
- `ProjectWorkspaceData = { project: Project; projectIds: Set<string>; tasks: Task[]; entries: Entry[]; stats: { totalSeconds: number; taskCount: number; doneCount: number; overdueCount: number }; daily: { date: string; seconds: number }[]; byTask: Map<string, number> }`

- [ ] **Step 1: Write failing tests**

Cover child project inclusion, task-linked entry inclusion when `entry.projectId` is null, direct project entry inclusion, deleted/running entry exclusion, deduplication, completed count, overdue count, daily totals and missing project.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node node_modules/typescript/bin/tsc --noEmit`.
Expected: FAIL because `projectWorkspace.ts` and `buildProjectWorkspace` do not exist.

- [ ] **Step 3: Implement the pure aggregation functions**

Use `descendantIds`, `durationSec`, and the existing date helpers. Build one `Set` of task IDs before filtering entries so a task-linked entry is not duplicated when it also has a project ID.

- [ ] **Step 4: Re-run typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/projectWorkspace.ts web/lib/projectWorkspace.test.ts
git commit -m "feat: aggregate project workspace data"
```

### Task 2: 建立專案工作區頁面與區塊

**Files:**
- Create: `web/app/projects/[projectId]/page.tsx`
- Create: `web/components/ProjectWorkspace.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- `ProjectWorkspace({ data, onBack, onEditProject }: { data: ProjectWorkspaceData; onBack: () => void; onEditProject: () => void })`

- [ ] **Step 1: Add component-level test cases**

Assert the page renders project name, total hours, Todo counts, Todo notes, work-log notes, daily report values, project notes, and independent empty states.

- [ ] **Step 2: Implement the route loader**

Read `params.projectId`, call `useStore()` in the client page, build workspace data from the snapshot, and render a not-found state when the project ID is absent.

- [ ] **Step 3: Implement the workspace blocks**

Render overview cards, work-cycle dates from task timestamps, Todo groups by status, dated work logs with source Todo/project labels, daily hours, and project notes. Keep images/share controls behind `FEATURES.workNoteImagesAndSharing`.

- [ ] **Step 4: Add empty states and responsive layout**

Each block must render its own empty message; use the existing card/grid/row classes and add only focused workspace styles.

- [ ] **Step 5: Run typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/app/projects/[projectId]/page.tsx web/components/ProjectWorkspace.tsx web/app/globals.css
git commit -m "feat: add project workspace view"
```

### Task 3: 從專案清單進入工作區

**Files:**
- Modify: `web/app/projects/page.tsx`

- [ ] **Step 1: Add a navigation assertion**

Verify that each project name produces `/projects/<projectId>` and that the existing edit button still opens the inline editor without navigation.

- [ ] **Step 2: Add the project link**

Use `next/link` around the project name only; preserve color swatch, time totals, edit, archive and delete actions.

- [ ] **Step 3: Run typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/app/projects/page.tsx
git commit -m "feat: open project workspace from project list"
```

### Task 4: 驗證整體流程與文件

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `web/README.md`

- [ ] **Step 1: Document the route and aggregation rules**

Document `/projects/[projectId]`, child project inclusion, task-linked entry inclusion, and the fact that image/share features remain disabled.

- [ ] **Step 2: Run automated validation**

Run: `node node_modules/typescript/bin/tsc --noEmit`; `git diff --check`.
Expected: both pass. Run `npm run build` when dependencies are intact; if `node_modules` is incomplete, record the exact module error.

- [ ] **Step 3: Perform manual acceptance checks**

Open the project list, click a project, confirm child-project Todo and logs appear, confirm a Todo note and its time-entry note appear together, confirm totals match the existing project total, edit a Todo and verify refresh updates the workspace, then test an empty project and an unknown project ID.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/ARCHITECTURE.md web/README.md
git commit -m "docs: document project workspace"
```
