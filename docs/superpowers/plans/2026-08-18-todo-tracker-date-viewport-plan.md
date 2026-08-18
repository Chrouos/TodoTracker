# Todo Tracker 日期視窗與排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓 Todo Tracker 以符合螢幕寬度的日期視窗呈現，並提供 1 天／1 週的前後導覽，Todo 依開單到結單跨度由長到短排序。

**Architecture:** 保留完整歷史資料軸，在 renderer 內先建立完整 tracker data，再從完整日期軸切出目前可見視窗；導航只改變視窗起點，不建立水平 scrollbar。資料層排序改用 Todo lifecycleSeconds，專案顏色與日期格行為維持不變。

**Tech Stack:** Chrome extension、原生 JavaScript、CSS、Node `node:test`。

**Spec:** 使用者已確認的日期型 Todo Tracker 設計。

## Global Constraints

- X 軸最多顯示容器能容納的日期欄位，不出現水平 scrollbar。
- 預設右端為今天；日期區間顯示完整年月日。
- 導覽支援前一天、前一週、回今天、後一週、後一天。
- Y 軸依 Todo 的開單到結單跨度由長到短排序。
- 已完成篩選、專案配色、Hover、選取明細與既有資料日期軸都要保留。

---

### Task 1: 先鎖定 lifecycle 排序與日期視窗契約

**Files:**
- Modify: `extension/src/lib/todo-tracker.test.js`
- Modify: `extension/test/todo-tracker-layout.test.mjs`

- [x] **Step 1: Write the failing tests**

將 tracker 排序測試改為驗證 lifecycle 較長者在前；新增 source/CSS contract，要求存在可見日期計算、1 天／1 週導覽、完整日期區間與不使用水平 overflow。

- [x] **Step 2: Run tests to verify they fail**

Run: `node --test extension/src/lib/todo-tracker.test.js; node --test extension/test/todo-tracker-layout.test.mjs`

Expected: FAIL because目前仍依 trackedSeconds 排序，且 renderer 使用水平滾動。

### Task 2: 實作完整日期視窗與導覽

**Files:**
- Modify: `extension/src/options/options.js`
- Modify: `extension/src/options/options.css`

- [x] **Step 1: Add viewport state and helpers**

新增 tracker view start index 與依容器寬度計算可見天數的 helper；render 時以完整 data dates 建立視窗，預設視窗尾端為今天或資料軸最後一天。

- [x] **Step 2: Replace scrolling with date navigation**

toolbar 顯示 `YYYY/MM/DD ～ YYYY/MM/DD`，加入前一天、前一週、今天、後一週、後一天按鈕；按鈕只移動 view start，並在資料軸範圍內 clamp。

- [x] **Step 3: Render only visible date columns**

以視窗日期建立 date headers 與日期格，維持 Todo 顏色、lifecycle 線、filter 和選取明細。

- [x] **Step 4: Remove horizontal scrollbar layout**

將 tracker grid 改成固定 label 欄加上可分配寬度的日期欄，`.todo-tracker` 使用 `overflow: hidden`，日期欄不再使用 min-width 推出水平滾動。

### Task 3: 改用 lifecycle 長度排序並驗證

**Files:**
- Modify: `extension/src/lib/todo-tracker.js`

- [x] **Step 1: Sort items by lifecycleSeconds descending**

保留同值時 openedAt 與 title 的 deterministic tie-breaker。

- [x] **Step 2: Run full extension verification**

Run: `Get-ChildItem extension/test -Filter '*.test.mjs' | ForEach-Object { node --test $_.FullName }; Get-ChildItem extension/src/lib -Filter '*.test.js' | ForEach-Object { node --test $_.FullName }; node --check extension/src/options/options.js; git diff --check`

- [x] **Step 3: Commit on main**

Run: `git add extension/src/lib/todo-tracker.js extension/src/lib/todo-tracker.test.js extension/src/options/options.js extension/src/options/options.css extension/test/todo-tracker-layout.test.mjs docs/superpowers/plans/2026-08-18-todo-tracker-date-viewport-plan.md; git commit -m "feat: navigate todo tracker by date viewport"`
