# Todo Project Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a Todo in a work-log editor automatically synchronizes the selected project with that Todo's project.

**Architecture:** Add a small pure synchronization helper in each native module boundary: TypeScript for the Web app and JavaScript for the extension. The Web `EntryDialog` and extension manual-entry dialog call the helper when Todo selection changes; project selection keeps its current behavior of clearing the Todo. Unknown Todo IDs preserve the current project to avoid destructive updates during stale-data states.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.7, native browser ES modules, Node 24 test execution, existing `node:assert/strict` contract tests.

## Global Constraints

- Only change work-log editor Todo/project synchronization.
- Preserve the existing Entry data shape and storage behavior.
- Selecting a Todo with `projectId: null` clears the project field.
- An unknown Todo ID preserves the current project field.
- Run tests before claiming completion; no production code is written before its focused test fails.

---

### Task 1: Add and verify the Web synchronization rule

**Files:**
- Create: `web/lib/entryRelations.ts`
- Create: `web/lib/entryRelations.test.mjs`

**Interfaces:**
- Produces `projectIdForTask(taskId: string, tasks: Pick<Task, 'id' | 'projectId'>[], currentProjectId: string): string`.
- Returns the selected task's project ID, `''` for a found unclassified task, and `currentProjectId` when no task matches.

- [ ] **Step 1: Write the failing test**

Create a focused test using plain task objects and assert:

```js
assert.equal(projectIdForTask('task-project', tasks, 'old-project'), 'new-project');
assert.equal(projectIdForTask('task-unclassified', tasks, 'old-project'), '');
assert.equal(projectIdForTask('missing', tasks, 'old-project'), 'old-project');
```

- [ ] **Step 2: Run the Web test to verify it fails**

Run from the repository root:

```powershell
node --experimental-strip-types web/lib/entryRelations.test.mjs
```

Expected: FAIL because `web/lib/entryRelations.ts` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement `projectIdForTask` by finding the task by ID and returning `task.projectId ?? ''`; return `currentProjectId` when no task is found. Use a type-only import for `Task` so the helper has no runtime dependency.

- [ ] **Step 4: Run the focused Web test**

Run:

```powershell
node --experimental-strip-types web/lib/entryRelations.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the Web rule**

```powershell
git add web/lib/entryRelations.ts web/lib/entryRelations.test.mjs
git commit -m "test: define todo project sync rule"
```

### Task 2: Wire the Web work-log editor

**Files:**
- Modify: `web/components/EntryDialog.tsx`

**Interfaces:**
- Consumes `projectIdForTask` from `web/lib/entryRelations.ts`.
- Keeps the existing project selector behavior: changing project sets `projectId` and clears `taskId`.

- [ ] **Step 1: Add the Todo selection behavior**

Import `projectIdForTask` and change the Todo selector handler to update both fields from the selected Todo:

```tsx
onChange={(e) => setForm({
  ...form,
  taskId: e.target.value,
  projectId: projectIdForTask(e.target.value, data.tasks, form.projectId),
})}
```

- [ ] **Step 2: Run Web type checking**

Run:

```powershell
Push-Location web
npm run typecheck
Pop-Location
```

Expected: PASS with no TypeScript errors.

### Task 3: Add and verify the extension synchronization rule

**Files:**
- Create: `extension/src/lib/entry-relations.js`
- Create: `extension/test/entry-project-sync.test.mjs`

**Interfaces:**
- Produces `projectIdForTask(taskId, tasks, currentProjectId)` with the same behavior as the Web helper.
- Uses the extension's native ES module format and plain task records.

- [ ] **Step 1: Write the failing test**

Import the not-yet-existing helper and assert the three cases: project reassignment, unclassified Todo clearing, and unknown-ID preservation.

- [ ] **Step 2: Run the extension test to verify it fails**

Run:

```powershell
node extension/test/entry-project-sync.test.mjs
```

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement the same lookup and null-to-empty-string behavior as the Web helper.

- [ ] **Step 4: Run the focused extension test**

Run:

```powershell
node extension/test/entry-project-sync.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the extension rule**

```powershell
git add extension/src/lib/entry-relations.js extension/test/entry-project-sync.test.mjs
git commit -m "test: define extension todo project sync rule"
```

### Task 4: Wire the extension manual-entry dialog

**Files:**
- Modify: `extension/src/options/options.js`

**Interfaces:**
- Consumes `projectIdForTask` from `extension/src/lib/entry-relations.js`.
- Applies the helper to the `enTask` change event and leaves the existing `enProject` behavior unchanged.

- [ ] **Step 1: Import and wire the helper**

Import `projectIdForTask`, add an `enTask` change listener after the existing element helpers are initialized, and set `enProject.value` from the selected task while preserving the current project for an unknown ID.

- [ ] **Step 2: Run the extension contract tests**

Run:

```powershell
node extension/test/entry-project-sync.test.mjs
node extension/test/options-layout.test.mjs
```

Expected: both PASS.

### Task 5: Full verification and manual acceptance

**Files:**
- Verify only; no additional source changes expected.

- [ ] **Step 1: Run all existing extension tests**

Run:

```powershell
Get-ChildItem extension/test -Filter '*.test.mjs' | ForEach-Object { node $_.FullName }
Get-ChildItem extension/src/lib -Filter '*.test.js' | ForEach-Object { node $_.FullName }
```

Expected: every existing and new extension test passes.

- [ ] **Step 2: Run all Web focused tests and typecheck**

Run:

```powershell
node --experimental-strip-types web/lib/entryRelations.test.mjs
Push-Location web
npm run typecheck
npm run build
Pop-Location
```

Expected: every Web test passes, TypeScript passes, and the production build completes.

- [ ] **Step 3: Run repository hygiene checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intended changes remain.

- [ ] **Step 4: Manual acceptance check**

In the work-log editor, select a Todo belonging to another project and confirm the Project selector immediately changes to that project. Select an unclassified Todo and confirm the Project selector clears. Switch the Project selector and confirm the Todo selector clears as before.

## Out of scope

- Database migrations or Entry schema changes.
- Timer selection behavior.
- Todo CRUD, project CRUD, report calculations, and unrelated UI copy/layout changes.

## Follow-up platform checks

- Reload the extension after rebuilding/reloading its unpacked files so the updated options script is used.
- Test the Web dialog from both the reports page and project page because both render `EntryDialog`.
