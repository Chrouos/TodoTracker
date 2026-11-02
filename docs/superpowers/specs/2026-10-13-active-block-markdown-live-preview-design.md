# Active-Block Markdown Live Preview Design

**Date:** 2026-10-13  
**Status:** Awaiting user review  
**Scope:** Web and Chrome Extension Markdown editors

## Problem

The toolbar editor currently renders Markdown as formatted editable DOM. This makes the stored Markdown hard to inspect at the exact cursor location, and inline toolbar commands only add marks instead of toggling existing marks off. Pressing Bold twice can therefore create nested `strong` marks rather than return the text to plain formatting.

The editor should behave like Obsidian live preview: the active logical block exposes its Markdown source while inactive blocks remain rendered previews. Web and Extension must provide the same behavior and continue storing plain Markdown.

## Goals

1. Show Markdown source for the active block and rendered output for every inactive block.
2. Toggle inline and block formatting on and off from the toolbar and keyboard shortcuts.
3. Keep Web and Extension behavior aligned through shared domain helpers and fixtures.
4. Preserve the current Markdown storage format, save timing, source mode, and textarea compatibility boundary.
5. Preserve Chinese IME input without parsing or rerendering during composition.
6. Keep task checkboxes interactive while their block is in preview mode.

## Non-goals

- Selecting or editing across multiple blocks in live preview mode. Source mode remains available for multi-block editing.
- Introducing CodeMirror, ProseMirror, or another editor framework.
- Changing the Markdown AST, database schema, or backup format.
- Supporting Markdown syntax that the current parser and serializer do not support.
- Making inactive preview blocks directly editable.

## User Experience

The toolbar editor contains rendered Markdown blocks. Clicking a block activates it and replaces that block in place with a source textarea containing only that block's Markdown.

Examples:

- A heading preview becomes `## Heading` while active.
- A task item becomes `- [ ] Task` or `- [x] Task` while active.
- A paragraph containing bold text exposes `Text with **bold** content` while active.
- A table or fenced code block exposes the complete block source rather than individual cells or lines.
- A horizontal rule renders as a real line while inactive and exposes the canonical `---` source while active.

Only one block is active at a time. Clicking another block commits the current source, renders its preview, and activates the new block. Clicking outside the editor commits the current block and leaves every block in preview mode.

Live preview selection stays within the active block. Users switch to source mode when they need to select, replace, or reorganize multiple blocks at once.

## Formatting Commands

### Inline commands

Bold, italic, and inline code are true toggles:

- If the entire selection already has the requested mark, the command removes that mark.
- Otherwise, the command applies the mark to the selection.
- A collapsed selection inserts a marked placeholder and selects its inner text so typing replaces the placeholder.
- `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, and `Ctrl/Cmd+K` use the same command path as toolbar buttons.

Link remains a command rather than a simple boolean mark. Applying Link prompts for a safe HTTPS URL. Applying Link to a selection already fully contained in one link removes the link while preserving its text.

### Block commands

Heading, unordered list, ordered list, task, quote, code block, and horizontal rule commands toggle the active block type:

- Applying the active type converts the block back to a paragraph.
- Applying a different type converts the active block to the requested type.
- Code block follows the same toggle rule.
- Applying the horizontal rule command to an active horizontal rule converts it to an empty paragraph.
- Table remains an insertion command because it does not have a lossless paragraph toggle.

Toolbar buttons expose `aria-pressed` and an active visual state when the active selection or block already has that format.

## Architecture

### Shared domain helpers

Shared pure helpers define behavior used by both adapters:

- serialize one logical block or list item to Markdown source;
- parse edited block source back into the supported AST shape;
- compose the full document Markdown from the valid AST and the active raw block source;
- resolve the active logical block from a block path;
- replace one logical block while preserving surrounding and nested content;
- toggle inline marks over a text range;
- toggle block types without changing unrelated blocks;
- derive toolbar active state from the active block and selection.

The shared contract remains Markdown string to AST to Markdown string. No DOM or React objects enter these helpers.

The Extension keeps package-local mirrored helpers where MV3 packaging cannot import the Web/shared module directly. Parallel helpers must use the same fixtures and produce identical serialized Markdown.

### Active block state

Each editor adapter tracks:

```text
activePath
activeSource
selectionStart
selectionEnd
isComposing
```

`activePath` identifies a paragraph, heading, list item, task item, quote, code block, table, or horizontal rule using the existing canonical block path contract.

The active source textarea replaces the rendered block at the same layout position. Inactive blocks are rendered through the existing safe Markdown renderer. The adapter preserves scroll position and restores the textarea selection after toolbar commands.

### Editing flow

1. The user clicks an inactive preview block.
2. The adapter commits any previous active block.
3. The shared helper serializes the selected block to Markdown.
4. The adapter mounts the source textarea at that block position and restores the logical selection.
5. Input updates `activeSource`, composes the full document Markdown with that raw block source, and emits it through the existing value boundary.
6. While composing with an IME, the adapter updates text but postpones structural parsing and preview replacement.
7. On block switch, blur outside the editor, or explicit mode switch, the adapter parses and commits the active source, then renders the resulting preview.

The active block remains visible as source during ordinary input. It is not rerendered on each keystroke.

Inside an active fenced code block, Enter inserts a literal newline in the textarea. It never invokes paragraph splitting, empty-paragraph submission, or block navigation. The complete fence, optional language, and multiline body remain one active source block until focus moves elsewhere.

### Extension adapter

`extension/src/lib/markdown-editor.js` owns active-block events, textarea selection, delegated preview clicks, checkbox changes, and the hidden public textarea bridge. `extension/src/lib/markdown-dom.js` continues to render safe semantic preview blocks and map canonical block paths.

### Web adapter

`web/components/MarkdownBlockEditor.tsx` owns the same interaction state through React refs and state. Shared behavior belongs in `web/lib/markdown-editor.ts` or the shared Markdown domain module rather than component-local branches.

Extension and Web retain separate UI adapters but use equivalent event semantics, block paths, command names, fixtures, and serialized output.

## Block Boundaries

- Paragraph and heading each form one active block.
- Each list or task item forms one active block. Its indentation and marker are included in active source.
- A quote is edited as one complete quote block, including nested quote markers.
- A fenced code block is edited as one complete block, including fences, optional language, and every literal newline.
- A table is edited as one complete Markdown table.
- A horizontal rule previews as `<hr>`, activates as `---`, and toggles to an empty paragraph when the horizontal rule command is applied again.

Nested list edits must preserve sibling items, parent items, child blocks, indentation, and task checked state outside the active path.

## Saving and External Updates

Every accepted input transaction combines the last valid AST with the active raw block source and emits the resulting full Markdown value, preserving current auto-save and form behavior. Leaving the block is not required for persistence. When the active source parses successfully, the valid AST branch advances to the new value; otherwise the raw source remains authoritative for saving while the previous valid AST branch remains available for preview recovery.

External value updates use the existing emitted-value guard:

- If the external value equals the last emitted local value, the active textarea and selection remain untouched.
- If the value differs, the editor reparses the external value, clears an invalid active path, and activates the nearest surviving block when possible. No uncommitted source exists outside the emitted Markdown value.

Source mode continues to edit the entire Markdown string and bypasses active-block live preview state.

## Error Handling

The current parser accepts unsupported or incomplete syntax as plain text where possible. Active source is never discarded.

If an edit temporarily cannot produce the expected single logical block:

- keep the source textarea active;
- preserve the user's text and selection;
- do not overwrite the last valid AST branch;
- expose no blocking modal;
- retry parsing on the next input or commit attempt.

Pasting multiple blocks into an active block is allowed only when the shared replacement helper can insert them without losing surrounding structure. Otherwise the text remains in the active source until the user switches to full source mode or edits it into a supported shape.

## Accessibility

- The active textarea receives an accessible label that includes the block type.
- Toolbar toggle buttons use `aria-pressed`.
- Preview blocks are keyboard-focusable and activate on Enter or Space where appropriate.
- Task checkboxes keep accessible labels and remain independently operable in preview mode.
- Focus returns to a predictable block or toolbar control after structural commands.

## Testing Strategy

### Shared behavior tests

- Inline marks apply to unmarked text and remove from fully marked text.
- Mixed marked and unmarked selections become fully marked.
- Collapsed selections insert the correct placeholder and selection range.
- Heading, list, task, quote, and code commands toggle back to paragraphs.
- One-block serialization and replacement preserve surrounding blocks.
- Nested list and task replacements preserve parent, sibling, child, and checked state.
- Tables, fenced code, quotes, links, and unsupported text round-trip safely.
- Horizontal rules normalize to `---`, preview as `<hr>`, and toggle back to empty paragraphs.

### Adapter tests

- Clicking a preview activates exactly one source textarea.
- Switching blocks commits the previous source and activates the next block.
- Clicking outside commits and returns every block to preview.
- Toolbar clicks preserve source selection and update active state.
- Keyboard shortcuts share toolbar toggle behavior.
- IME composition does not trigger structural parsing or selection loss.
- Enter inside fenced code inserts literal newlines without creating or submitting paragraphs.
- Interactive task checkboxes update Markdown in preview mode.
- External value synchronization preserves or safely relocates active state.

Equivalent fixtures must run against Extension and Web behavior contracts.

### Verification

```bash
node --test extension/src/lib/*.test.js extension/test/*.test.mjs
cd web && npm run typecheck
cd web && npm run build
```

Manual browser verification covers Chrome selection, toolbar mouse interaction, keyboard navigation, Chinese IME, block switching, nested lists, tables, source mode, and timer-note auto-save.

## Acceptance Criteria

1. Only the active logical block displays Markdown source; every inactive block displays rendered preview.
2. Bold, italic, inline code, links, headings, lists, tasks, quotes, and code blocks support the specified toggle behavior.
3. Horizontal rules preview as lines, activate as `---`, and toggle back to empty paragraphs.
4. Fenced code blocks preserve literal multiline input when Enter is pressed.
5. Toolbar active state reflects the current block and selection.
6. Active-block input emits Markdown through existing save boundaries without waiting for blur.
7. Invalid intermediate source is preserved and never overwrites the last valid block.
8. Source mode supports cross-block editing and remains compatible with existing Markdown.
9. Extension and Web produce matching Markdown for the shared behavior fixtures.
10. Existing Markdown data, backup files, and database schemas require no migration.
