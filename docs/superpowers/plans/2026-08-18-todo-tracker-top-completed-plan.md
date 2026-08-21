# Todo Tracker Ordering and Daily Completion Summary

## Objective and scope

Show today’s completed-todo count in the tracker toolbar. Add the tracker status selector shown in the reference UI. Limit the completed Todo Tracker view to the five most recently completed todos by default. Sort completed items by `completedAt` descending and unfinished items by their latest valid work-record end time descending, so inactive unfinished todos appear last. Preserve the existing report controls, date navigation, and lifecycle rendering.

## Technical baseline

- `extension/src/lib/todo-tracker.js` builds tracker data and currently sorts all items by tracked seconds.
- `extension/src/options/options.js` renders the toolbar, status selector, rows, and navigation.
- `extension/src/lib/todo-tracker.test.js` uses Node’s built-in test runner for data behavior.
- `extension/test/todo-tracker-layout.test.mjs` covers static options markup and layout assumptions.

## Ordered implementation stages

1. **RED: define summary, ordering, and limit behavior**
   - Modify `extension/src/lib/todo-tracker.test.js` with fixtures for today/other-day completion, more than five completed tasks, and unfinished tasks with recent, old, and missing activity.
   - Assert today’s count uses local `completedAt` date, completed items are newest-first and limited to five, and unfinished items are ordered by latest valid entry end time with inactive items last.
   - Run `node --test extension/src/lib/todo-tracker.test.js` and confirm the new assertions fail for the current behavior.

2. **GREEN: implement the smallest data-layer change**
   - Add an optional `completedLimit = 5` input to `buildTodoTrackerData` and return `completedTodayCount`.
   - Store each item’s latest valid work-record end time internally, partition completed and non-completed items, sort each group by its required activity key, keep the first five completed items, then combine the groups without exposing implementation-only fields.
   - Keep archived exclusion, work filtering, lifecycle clipping, and public item fields unchanged.

3. **Integrate and verify UI behavior**
   - Render `今日結案 N 個` and the `未完成`／`全部`／`已完成` selector in the tracker toolbar from `completedTodayCount`; use the existing `now` refresh path so the count updates as the day changes.
   - Confirm `options.js` uses the default limit and does not add a second competing limit in rendering.
   - Update the layout test only if the toolbar or visible row contract changes.
   - Run the full extension test suite and `cd web; npm run typecheck` if shared types are untouched only as a regression check.

## Manual acceptance checks

In Chrome, reload `extension/`, open Reports, and verify the toolbar shows today’s completed count. Confirm the newest five completed todos appear top-to-bottom by completion time, followed by unfinished todos ordered by latest work activity. Move the date viewport and confirm the order and limit remain stable.

## Out of scope

Do not remove older todos, change stored data, limit unfinished todos, or redesign the tracker toolbar beyond the compact count label and status selector.
