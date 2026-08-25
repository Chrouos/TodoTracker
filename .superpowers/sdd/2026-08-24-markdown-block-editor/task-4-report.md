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

## Fix round: review issues 1-5

### Changes

- Added caret-aware Enter handling for paragraph and heading surfaces. It splits the AST block at the current selection; an empty heading exits to a paragraph, while Enter on an empty paragraph inserts the next paragraph. List Enter/empty-list exit behavior is unchanged.
- Centralized editor-only AST operations in `web/lib/markdown-editor.ts`. Nested list children retain their parent item semantic path; only quote traversal appends its quoted-block index. The nested task regression verifies `[0, 0, 0, 0]` is accepted by `pathToItem` for task list → quote → task list.
- Calculated the post-indent/outdent list-item path before running the shared immutable command, then focused that transformed path rather than the stale source path.
- Rendered inline AST marks and links inside contenteditable surfaces. Text input now applies a minimal visible-text range edit to the existing inline tree, preserving strong/emphasis/code/link semantics around the edited content.
- Replaced the non-runnable TypeScript side-effect test with `web/lib/markdown.test.mjs`, which imports `./markdown.ts` explicitly and runs with Node's available TypeScript strip-types mode.

### TDD evidence

Before the helper existed, the focused helper test failed as expected:

```text
node --test --experimental-strip-types web/lib/markdown-editor.test.mjs
ERR_MODULE_NOT_FOUND: web/lib/markdown-editor.ts
tests 1; pass 0; fail 1
```

The empty-paragraph Enter regression then failed against the initial helper implementation:

```text
inserts a new paragraph when Enter is pressed on an empty paragraph
Expected 2 paragraph blocks; received 1
tests 5; pass 4; fail 1
```

### Final verification

```text
node --test shared/markdown/*.test.mjs
```

Output: `tests 24`, `pass 24`, `fail 0`.

```text
node --test --experimental-strip-types web/lib/markdown.test.mjs web/lib/markdown-editor.test.mjs
```

Output: `tests 6`, `pass 6`, `fail 0`.

```text
cd web && npm run typecheck
```

Output: `tsc --noEmit` completed with exit code 0.

Node emitted its existing `MODULE_TYPELESS_PACKAGE_JSON` warning while stripping TypeScript; the focused test process still exited 0 and executed all renderer, path, split, focus-path, and inline-preservation assertions.

### Changed files

- `web/components/MarkdownBlockEditor.tsx`
- `web/lib/markdown-editor.ts`
- `web/lib/markdown-editor.test.mjs`
- `web/lib/markdown.test.mjs`
- `web/lib/markdown.test.ts` (removed; replaced by runnable `.mjs` test)
- `.superpowers/sdd/2026-08-24-markdown-block-editor/task-4-report.md`
