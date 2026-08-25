import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blocksFromMarkdown,
  continueListItem,
  exitEmptyListItem,
  formatMarkdownSelection,
  markdownShortcutToBlock,
  normalizeMarkdownEditorMode,
  serializeTaskCheckboxToggle,
  splitTextBlockAtOffset,
  indentListItem,
  listItemPathAfterIndent,
  updateInlinesForTextInput,
} from './markdown-editor.js';
import { parseMarkdown, serializeMarkdown } from './markdown.js';

test('wraps selected text in Markdown bold and keeps it selected', () => {
  assert.deepEqual(
    formatMarkdownSelection('請回覆客戶', 1, 3, 'bold'),
    { value: '請**回覆**客戶', selectionStart: 3, selectionEnd: 5 },
  );
});

test('inserts an italic placeholder when nothing is selected', () => {
  assert.deepEqual(
    formatMarkdownSelection('', 0, 0, 'italic'),
    { value: '*斜體文字*', selectionStart: 1, selectionEnd: 5 },
  );
});

test('prefixes every selected line for a Markdown list', () => {
  assert.deepEqual(
    formatMarkdownSelection('第一項\n第二項', 0, 7, 'unordered-list'),
    { value: '- 第一項\n- 第二項', selectionStart: 2, selectionEnd: 11 },
  );
});

test('normalizes unknown editor settings to the toolbar editor', () => {
  assert.equal(normalizeMarkdownEditorMode('source'), 'source');
  assert.equal(normalizeMarkdownEditorMode('anything-else'), 'toolbar');
});

test('converts block-start Markdown shortcuts to native editor blocks', () => {
  assert.deepEqual(markdownShortcutToBlock('# '), { type: 'heading', level: 1, inlines: [] });
  assert.deepEqual(markdownShortcutToBlock('- [x] '), {
    type: 'taskList',
    items: [{ checked: true, inlines: [], children: [] }],
  });
  assert.equal(markdownShortcutToBlock('text - '), null);
});

test('serializes an editor task checkbox change back to Markdown', () => {
  assert.equal(
    serializeTaskCheckboxToggle('- [ ] Open\n- [x] Done', '0.0'),
    '- [x] Open\n- [x] Done',
  );
});

test('formats a selection as a Todo item without changing legacy commands', () => {
  assert.deepEqual(
    formatMarkdownSelection('Plan', 0, 4, 'todo'),
    { value: '- [ ] Plan', selectionStart: 6, selectionEnd: 10 },
  );
  assert.deepEqual(
    formatMarkdownSelection('Plan', 0, 4, 'bold'),
    { value: '**Plan**', selectionStart: 2, selectionEnd: 6 },
  );
});

test('creates an editable paragraph block for an empty Markdown value', () => {
  assert.deepEqual(blocksFromMarkdown(''), [{ type: 'paragraph', inlines: [] }]);
});

test('preserves inline marks and link URLs while text changes inside them', () => {
  const [block] = parseMarkdown('**Bold** and [docs](https://example.com)');
  assert.equal(
    serializeMarkdown([{ ...block, inlines: updateInlinesForTextInput(block.inlines, 'Bald and docs') }]),
    '**Bald** and [docs](https://example.com)',
  );
});

test('splits a text block at the focused caret offset', () => {
  const split = splitTextBlockAtOffset(parseMarkdown('BeforeAfter'), [0], 6);
  assert.equal(serializeMarkdown(split.blocks), 'Before\n\nAfter');
  assert.deepEqual(split.nextPath, [1]);
});

test('toggles a nested task after a sibling normal list without path collisions', () => {
  const markdown = '- Parent\n  - Plain child\n  - [ ] Nested task\n- [ ] Sibling task';
  assert.equal(
    serializeTaskCheckboxToggle(markdown, '0.0.1.0'),
    '- Parent\n  - Plain child\n  - [x] Nested task\n\n- [ ] Sibling task',
  );
});

test('continues and exits list items with the shared Markdown structure', () => {
  const source = parseMarkdown('- One');
  assert.equal(serializeMarkdown(continueListItem(source, [0, 0])), '- One\n- ');
  assert.equal(serializeMarkdown(exitEmptyListItem(continueListItem(source, [0, 0]), [0, 1])), '- One\n\n');
});

test('indents and outdents a list item without mutating the source', () => {
  const source = parseMarkdown('- One\n- Two');
  const nestedPath = listItemPathAfterIndent(source, [0, 1], 'in');
  const nested = indentListItem(source, [0, 1], 'in');
  assert.equal(serializeMarkdown(nested), '- One\n  - Two');
  assert.deepEqual(nestedPath, [0, 0, 0]);
  assert.equal(serializeMarkdown(indentListItem(nested, nestedPath, 'out')), '- One\n- Two');
  assert.equal(serializeMarkdown(source), '- One\n- Two');
});
