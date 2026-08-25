# Single-Surface Markdown Editor Design

**Date:** 2026-08-25  
**Status:** Awaiting user review  
**Scope:** Web and Chrome Extension Markdown editor

## Problem

The current editor renders every paragraph, list item, and table cell as an independent `contentEditable`. This makes ordinary editor behavior unreliable: native selection stops at block boundaries, `Ctrl/Cmd+A` selects only one surface, arrow keys require custom focus hopping, and table editing becomes a special case instead of normal text editing.

The editor must behave like one continuous Notion-style editing surface while preserving Markdown as the stored format.

## Goals

1. Render one editable surface per editor, not one input per block.
2. Make native selection and cursor behavior work across paragraphs, headings, lists, quotes, code blocks, and tables.
3. Keep Markdown as the persistence and interoperability format.
4. Preserve direct task checkbox interaction.
5. Keep Web and Extension behavior aligned.
6. Preserve the existing external `value`/`onChange` and textarea compatibility boundaries.

## Non-goals

- Introducing a third-party editor framework in this iteration.
- Changing the Markdown AST or stored database format.
- Adding collaborative editing, comments, mentions, or database-style table formulas.
- Making Markdown tables support multiline cell values; a Markdown table cell remains a single logical line.

## User Experience

The block editor is one continuous editor:

- `Ctrl/Cmd+A` selects all editor content.
- Native mouse drag selection can cross block boundaries.
- Arrow keys move through the normal browser selection model instead of manually switching between inputs.
- `Enter` creates or splits blocks according to the current block type.
- `Backspace` and `Delete` remove or merge adjacent blocks using normal editor rules.
- Typing Markdown shortcuts at the beginning of a paragraph converts that block in place.
- Pasting multiline Markdown inserts parsed blocks at the current selection.
- Clicking a task checkbox updates its AST value without moving focus unexpectedly.
- A table always has an editable paragraph after it, so the user can continue writing below it.
- Pressing `Enter` in a table cell exits to the paragraph after the table, because multiline Markdown table cells are not representable in the stored format.
- Source mode remains available for users who want to edit raw Markdown directly.

## Architecture

### One editable root

`MarkdownBlockEditor` renders a single root element with `contentEditable="true"`. Block elements inside it (`p`, headings, lists, blockquotes, `pre`, `table`, and `hr`) are not independently editable. Event handling is attached to the root and delegated to the nearest block or inline element.

The root is intentionally treated as an uncontrolled editing surface during ordinary typing. React/DOM rerenders must not replace the root on every character, because replacing DOM nodes would reset the browser selection. React state and the Markdown value are synchronized after input transactions and structural commands.

### AST remains the contract

The existing shared AST, parser, serializer, renderer, and task-path rules remain the domain contract. The editor adds a DOM adapter layer:

```text
Markdown value <-> AST <-> editable DOM
                         ^
                 selection + input transactions
```

The adapter is responsible for:

- rendering AST blocks into semantic editable DOM;
- reading inline text and marks back from DOM;
- locating a block and logical text offset from a DOM `Range`;
- applying structural commands without losing the selection;
- updating only the changed AST branch where possible.

Web and Extension use equivalent adapters with the same block markup, `data-*` path contract, keyboard semantics, and command helpers. The Extension keeps its existing textarea bridge because the MV3 package cannot import modules outside its package root.

### DOM block contract

Every block has a stable `data-block-path`. Inline text is represented by normal text nodes and marks use semantic elements:

- paragraph: `p`
- heading: `h1`–`h6`
- unordered/ordered list: `ul`/`ol` with `li`
- task list: `ul`/`li` plus a non-editable checkbox
- quote: `blockquote`
- code: `pre > code`
- table: `table > thead/tbody > tr > th/td`
- horizontal rule: `hr`

Only the root has `contentEditable="true"`; non-text controls such as task checkboxes are `contentEditable="false"` and handled through delegated click/change events.

### Input and selection flow

1. `beforeinput` classifies the browser operation and captures the current DOM selection.
2. The adapter maps the selection to a block path and logical offsets.
3. Text input is applied to the current inline AST while preserving marks where possible.
4. Enter, Backspace, Delete, paste, indentation, and block commands use shared immutable AST helpers.
5. The changed AST is serialized and emitted through the existing value boundary.
6. For structural changes, the adapter rerenders the root once and restores the logical selection by path and offset.

Plain typing that does not change block structure should update the existing DOM and AST without replacing the root. Structural changes may rerender the root, but must restore the browser selection after the render.

### Table behavior

The table toolbar command inserts a table followed by an empty paragraph and places the caret in that paragraph. Table cells remain normal editable DOM descendants of the same root. Checkbox and table interactions do not create independent editor surfaces.

When the caret is in an empty paragraph immediately after a table, Backspace removes the table and keeps the paragraph. This provides an intuitive keyboard deletion path without adding a separate table-delete toolbar command.

## Compatibility and error handling

- External `value` changes replace the editor content only when the editor is not locally dirty or when the parent value differs from the last emitted value.
- Invalid or unsupported DOM shapes are converted to plain paragraph text rather than discarded.
- Unsupported Markdown remains governed by the existing parser/serializer behavior.
- The Extension textarea remains synchronized for forms, persistence, auto-grow compatibility, and external callers.
- Source mode bypasses the rich DOM adapter and continues using the textarea.

## Testing strategy

### Shared domain tests

- Preserve existing AST/parser/serializer tests.
- Add tests for block insertion/removal and selection transaction helpers.
- Cover table-following paragraph creation, table deletion, nested block paths, and Markdown round trips.

### Editor adapter tests

- Test DOM-to-AST conversion for paragraphs, marks, lists, quotes, code, tables, and task checkboxes.
- Test selection mapping at block boundaries and inline-mark boundaries.
- Test `Ctrl/Cmd+A`, multiline paste, Enter, Backspace, Delete, and table-cell behavior.
- Run the same behavior contract against Web and Extension adapters.

### Verification

- Full Node test suite.
- `npm run typecheck`.
- Production Web build with the repository's installed dependencies.
- Manual browser verification for drag selection, whole-editor selection, cursor movement, table editing, checkbox clicks, and source mode.

## Acceptance criteria

The refactor is complete when:

1. The editor DOM contains one editable root and no independently editable paragraph/list/table-cell surfaces.
2. Selecting from one block into another works with mouse and keyboard.
3. `Ctrl/Cmd+A` selects the whole editor and typing replaces the whole selection.
4. Normal arrow keys require no custom focus-jump behavior.
5. Tables can be edited, exited, continued below, and removed with keyboard interaction.
6. Web and Extension pass the same Markdown and editor contract tests.
7. Existing Markdown fields, timer notes, project notes, and shared notes continue to use the same external value contracts.
