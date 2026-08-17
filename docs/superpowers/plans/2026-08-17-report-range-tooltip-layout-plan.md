# Report Range and Tooltip Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the extension report trend chart use stable date axes for today and this week, and reserve a fixed three-line height for hover summaries.

**Architecture:** Add a pure `trendDateBounds` helper for the two affected quick ranges. `renderReport` will use those bounds for the trend series while preserving `inRange()` for KPI totals. CSS will reserve three summary lines and ellipsize long detail text so hover content does not change layout height.

**Tech Stack:** Native browser ES modules, Node 24 `node:test`, existing extension options JavaScript/CSS.

## Global Constraints

- The week axis is Monday through Sunday using `S.settings.weekStartsOn`.
- The today axis is today plus the five preceding calendar days.
- Future days in the week axis remain visible with zero values.
- KPI and interval totals keep their existing selected-range semantics.
- Month, all-time, custom ranges, heatmap calculations, and Web reports remain out of scope.
- Production code is written only after the focused test fails.

---

### Task 1: Add the trend date-bounds helper with TDD

**Files:**
- Create: `extension/src/lib/report-range.js`
- Create: `extension/test/report-range.test.mjs`

**Interfaces:**
- Produces `trendDateBounds(range, now, weekStartsOn)` returning `{ from: Date, to: Date }` for `today` and `week`.
- `today` returns local midnight five days before `now` through local midnight of `now`.
- `week` returns local Monday/start-day through six days later, honoring `weekStartsOn`.

- [ ] **Step 1: Write the failing test**

Add tests that call the missing helper with `new Date(2026, 7, 17)`:

```js
assert.deepEqual(formatBounds(trendDateBounds('today', now, 1)), {
  from: '2026-08-12', to: '2026-08-17',
});
assert.deepEqual(formatBounds(trendDateBounds('week', now, 1)), {
  from: '2026-08-17', to: '2026-08-23',
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node extension/test/report-range.test.mjs
```

Expected: FAIL because `extension/src/lib/report-range.js` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Use `startOfDay` and `startOfWeek` from `time.js`. Clone the start date before adding days so the returned `from` is not mutated. Throw a clear `Error` for unsupported ranges rather than silently producing an invalid axis.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node extension/test/report-range.test.mjs
```

Expected: PASS.

### Task 2: Use complete trend bounds in `renderReport`

**Files:**
- Modify: `extension/src/options/options.js`

**Interfaces:**
- Consumes `trendDateBounds` from `extension/src/lib/report-range.js`.
- Keeps `rows = inRange()` unchanged for KPI and interval totals.

- [ ] **Step 1: Import the helper and replace affected axis calculations**

In `renderReport`, use the helper for `today` and `week`. Keep existing month, all, and custom calculations. Build an exclusive end date one day after the inclusive trend end and filter source entries to the trend bounds before calling `dailySeries` and `renderProjectTrend`.

The resulting behavior must be:

```js
// today: lineFrom = today - 5 days, lineTo = today
// week:  lineFrom = week start,   lineTo = week start + 6 days
```

Future week dates must still be passed to `dailySeries`, so its zero-filled buckets render.

- [ ] **Step 2: Add a source contract assertion before final verification**

Extend `extension/test/options-layout.test.mjs` to assert that `options.js` imports `report-range.js`, calls `trendDateBounds`, and filters trend source entries with an exclusive end bound. This guards against reverting to `new Date()` as the week axis end.

- [ ] **Step 3: Run the focused integration contracts**

Run:

```powershell
node extension/test/report-range.test.mjs
node extension/test/options-layout.test.mjs
```

Expected: PASS.

### Task 3: Fix fixed-height hover summary layout with TDD contract coverage

**Files:**
- Modify: `extension/src/options/options.css`
- Modify: `extension/test/options-layout.test.mjs`

**Interfaces:**
- The existing `projectTrendTooltip` markup remains unchanged.
- CSS reserves three lines, hides overflow, and prevents direct child text from wrapping vertically.

- [ ] **Step 1: Add failing CSS contract assertions**

Assert that `.project-trend-tooltip` has `box-sizing: border-box`, a fixed `height`, and `overflow: hidden`; assert that its direct `strong` and `span` children use `white-space: nowrap` and `text-overflow: ellipsis`.

- [ ] **Step 2: Run the layout contract and verify RED**

Run:

```powershell
node extension/test/options-layout.test.mjs
```

Expected: FAIL because the current CSS only defines `min-height` and allows wrapped text.

- [ ] **Step 3: Implement the minimal CSS**

Set a fixed three-line height (including padding via `box-sizing`), keep `overflow: hidden`, and apply single-line ellipsis to direct summary children. Preserve the existing colors, spacing, hover visibility, and border styling.

- [ ] **Step 4: Run the layout contract and verify GREEN**

Run:

```powershell
node extension/test/options-layout.test.mjs
```

Expected: PASS.

### Task 4: Full verification and acceptance

**Files:**
- Verify only; no additional source changes expected.

- [ ] **Step 1: Run all extension tests**

Run:

```powershell
$failed = $false; Get-ChildItem extension/test -Filter '*.test.mjs' | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed = $true } }; Get-ChildItem extension/src/lib -Filter '*.test.js' | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed = $true } }; if ($failed) { exit 1 }
```

Expected: all existing and new tests pass.

- [ ] **Step 2: Run hygiene checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intended commits/changes remain.

- [ ] **Step 3: Manual acceptance check**

On the extension report tab:

1. Select `本週` on Monday and confirm the trend header shows Monday through Sunday, with future columns present and empty.
2. Select `今日` and confirm the trend shows today plus five preceding dates while KPI totals remain today-only.
3. Move the pointer over a trend date and confirm the `區間總計` box stays the same height before and after hover; long detail text is truncated rather than wrapped.

## Out of scope

- Changing KPI totals or the meaning of `inRange()`.
- Extending month/all/custom axes.
- Web report implementation.
- Reworking the SVG chart renderer or heatmap data model.
