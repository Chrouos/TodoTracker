# Task 4 report: Web Markdown renderer and block editor

## Status

Implemented the Task 4 Web renderer wrapper, interactive preview compatibility, and reusable React Markdown block editor. Task 5 page-field migration remains untouched.

## Changes

- Replaced `web/lib/markdown.ts`'s independent renderer with a typed compatibility wrapper over `shared/markdown/index.js`.
- Kept `markdownToHtml()` as the existing Web entry point and exposed shared AST, rendering, parser, serializer, and command types for the editor adapter.
- Kept the renderer contract checks and added the required task-checkbox and table assertions in `web/lib/markdown.test.ts`; updated the horizontal-rule expectation to the shared renderer's `<hr>` output.
- Added `MarkdownPreview` task interactivity only when both `interactiveTasks` and `onChange` are supplied. Default previews remain disabled/read-only and retain existing preview class names and empty-state copy.
- Added `MarkdownBlockEditor` with controlled Markdown strings, block and source modes, an imperative `MarkdownEditorHandle`, selection-aware `insertText()`, dirty external-value reconciliation, IME composition guards, task toggles, list continuation/exit/indent commands, toolbar transforms, and stable block-path attributes.
- Added styles for the editor shell, focus state, toolbar, nested lists, tasks, code, tables, source mode, and the existing min/max height props.

## TDD evidence

The pre-existing uncommitted task/table assertions were reviewed and retained. Before replacing the Web renderer, the focused assertion failed against the old renderer because task Markdown produced `<ul><li>[ ] Open</li><li>[x] Done</li></ul>` without a checkbox. The test was transiently compiled outside the repository because the project has no TypeScript test runner and Node cannot resolve the test file's extensionless TypeScript import directly.

After implementation, the ASCII renderer assertions, including the exact task-checkbox and table assertions, passed through `web/lib/markdown.ts` using Node's TypeScript stripping mode. The React wrapper deliberately uses the already-covered pure shared editor commands because no browser component runner exists.

## Verification

```text
node --test shared/markdown/*.test.mjs
```

Passed: 24 tests, 0 failures.

```text
cd web && npm run typecheck
```

Passed: `tsc --noEmit` with exit code 0.

`git diff --check` also completed with no whitespace errors during self-review.

## Scope

Task 4-owned implementation files only:

- `web/lib/markdown.ts`
- `web/lib/markdown.test.ts`
- `web/components/MarkdownBlockEditor.tsx`
- `web/components/MarkdownPreview.tsx`
- `web/app/globals.css`
- `.superpowers/sdd/2026-08-24-markdown-block-editor/task-4-report.md`

No Task 5 page fields were migrated.

## Concerns

There is no browser component test runner in this repository, so selection mapping, contenteditable behavior, toolbar interactions, and IME handling are type-checked and deliberately built on the already-tested pure command transitions, but still need manual browser validation when Task 5 wires the editor into real fields. Direct Node execution of TypeScript emits the repository's existing module-type warning; no package configuration was changed for this task.
