import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEditorCheckboxChange,
  ensureParagraphAfterBlock,
  indentListItem,
  parseMarkdown,
  pathToItem,
  reconcileEditorSelection,
  replaceEditorSelectionWithFallback,
  replaceEditorSelection,
  serializeMarkdown,
  shouldPreventEditorDefault,
  splitListItemAtSelection,
  syncEditorValue,
  toggleTaskItem,
} from './markdown.ts';
import {
  applyInlineCommand,
  collectTaskItemPaths,
  insertInlineTextAtRange,
  listItemPathAfterIndent,
  pasteMarkdownAtTextBlock,
  splitTextBlockAtOffset,
  timestampInsertionText,
  toolbarSelection,
  updateInlinesForTextInput,
} from './markdown-editor.ts';

const task = (value, checked = false, children = []) => ({
  checked,
  inlines: [{ type: 'text', value }],
  children,
});

test('splits an editable heading at the caret and exits an empty heading as a paragraph', () => {
  const source = parseMarkdown('# One');
  const split = splitTextBlockAtOffset(source, [0], 3);
  assert.equal(serializeMarkdown(split.blocks), '# One\n\n# ');
  const exited = splitTextBlockAtOffset(split.blocks, split.nextPath, 0);
  assert.deepEqual(exited.blocks, [
    { type: 'heading', level: 1, inlines: [{ type: 'text', value: 'One' }] },
    { type: 'paragraph', inlines: [] },
  ]);
});

test('inserts a new paragraph when Enter is pressed on an empty paragraph', () => {
  const entered = splitTextBlockAtOffset([{ type: 'paragraph', inlines: [] }], [0], 0);
  assert.deepEqual(entered.blocks, [
    { type: 'paragraph', inlines: [] },
    { type: 'paragraph', inlines: [] },
  ]);
  assert.deepEqual(entered.nextPath, [1]);
});

test('splits a text block reached through canonical list child indexes', () => {
  const source = [{ type: 'list', ordered: false, items: [{
    inlines: [{ type: 'text', value: 'parent' }],
    children: [
      { type: 'paragraph', inlines: [{ type: 'text', value: 'first' }] },
      { type: 'paragraph', inlines: [{ type: 'text', value: 'target' }] },
    ],
  }] }];

  const split = splitTextBlockAtOffset(source, [0, 0, 1], 3);
  assert.deepEqual(split.blocks[0].items[0].children.slice(1), [
    { type: 'paragraph', inlines: [{ type: 'text', value: 'tar' }] },
    { type: 'paragraph', inlines: [{ type: 'text', value: 'get' }] },
  ]);
  assert.deepEqual(split.nextPath, [0, 0, 2]);
});

test('collects task paths through a task list, quote, and nested task list', () => {
  const blocks = [{
    type: 'taskList',
    items: [task('outer', false, [{
      type: 'quote',
      blocks: [{ type: 'taskList', items: [task('inner')] }],
    }])],
  }];
  const paths = collectTaskItemPaths(blocks);
  assert.deepEqual(paths, [[0, 0], [0, 0, 0, 0, 0]]);
  assert.equal(pathToItem(blocks, paths[1]).inlines[0].value, 'inner');
});

test('collects unique canonical paths through mixed child block types', () => {
  const blocks = [{ type: 'list', ordered: false, items: [{
    inlines: [{ type: 'text', value: 'parent' }],
    children: [
      { type: 'taskList', items: [task('first')] },
      { type: 'paragraph', inlines: [{ type: 'text', value: 'plain child' }] },
      { type: 'taskList', items: [task('target')] },
    ],
  }] }];

  const paths = collectTaskItemPaths(blocks);
  assert.deepEqual(paths, [[0, 0, 0, 0], [0, 0, 2, 0]]);
  const next = toggleTaskItem(blocks, paths[1]);
  assert.equal(next[0].items[0].children[0].items[0].checked, false);
  assert.equal(next[0].items[0].children[2].items[0].checked, true);
});

test('returns the transformed path for indent and outdent before refocusing', () => {
  const source = [{ type: 'taskList', items: [task('one'), task('two')] }];
  const indentedPath = listItemPathAfterIndent(source, [0, 1], 'in');
  const indented = indentListItem(source, [0, 1], 'in');
  assert.deepEqual(indentedPath, [0, 0, 0, 0]);
  assert.equal(pathToItem(indented, indentedPath).inlines[0].value, 'two');
  const outdentedPath = listItemPathAfterIndent(indented, indentedPath, 'out');
  const outdented = indentListItem(indented, indentedPath, 'out');
  assert.deepEqual(outdentedPath, [0, 1]);
  assert.equal(pathToItem(outdented, outdentedPath).inlines[0].value, 'two');
});

test('preserves inline formatting and links while updating visible text', () => {
  const [block] = parseMarkdown('**Bold** and [docs](https://example.com)');
  assert.equal(
    serializeMarkdown([{ ...block, inlines: updateInlinesForTextInput(block.inlines, 'Bald and docs') }]),
    '**Bald** and [docs](https://example.com)',
  );
});

test('applies inline AST commands without flattening existing marks', () => {
  const [block] = parseMarkdown('**Bold** docs');
  const italic = applyInlineCommand(block.inlines, 0, 4, 'emphasis');
  assert.equal(serializeMarkdown([{ ...block, inlines: italic.inlines }]), '***Bold*** docs');

  const code = applyInlineCommand(block.inlines, 5, 5, 'code');
  assert.equal(serializeMarkdown([{ ...block, inlines: code.inlines }]), '**Bold** `程式碼`docs');

  const link = applyInlineCommand(block.inlines, 5, 9, 'link', 'http://unsafe.example');
  assert.equal(serializeMarkdown([{ ...block, inlines: link.inlines }]), '**Bold** [docs](https://example.com)');
});

test('inserts outside an inline mark at its DOM boundary and inside it otherwise', () => {
  const [block] = parseMarkdown('**bold** plain');
  assert.equal(
    serializeMarkdown([{ ...block, inlines: insertInlineTextAtRange(block.inlines, 4, 4, 'X', true) }]),
    '**bold**X plain',
  );
  assert.equal(
    serializeMarkdown([{ ...block, inlines: insertInlineTextAtRange(block.inlines, 3, 3, 'X', false) }]),
    '**bolXd** plain',
  );
});

test('parses multiline Markdown paste into replacement block AST', () => {
  const result = pasteMarkdownAtTextBlock(
    parseMarkdown('replace me'),
    [0],
    0,
    10,
    '# Pasted\n\n- [ ] Nested task',
  );

  assert.deepEqual(result.blocks.map((block) => block.type), ['heading', 'taskList']);
  assert.equal(serializeMarkdown(result.blocks), '# Pasted\n\n- [ ] Nested task');
  assert.deepEqual(result.nextPath, [1]);
});

test('adds a timestamp newline only away from a line start', () => {
  assert.equal(timestampInsertionText('', 0, '09:30 '), '09:30 ');
  assert.equal(timestampInsertionText('first\nsecond', 6, '09:30 '), '09:30 ');
  assert.equal(timestampInsertionText('first\nsecond', 8, '09:30 '), '\n09:30 ');
  assert.equal(timestampInsertionText('first', 5, '09:30 '), '\n09:30 ');
});

test('replaces a native whole-editor selection through the Web Markdown facade', () => {
  const source = parseMarkdown('First\n\nSecond');
  const result = replaceEditorSelection(source, {
    anchor: { path: [0], offset: 0 },
    focus: { path: [1], offset: 6 },
  }, 'Replacement');

  assert.equal(serializeMarkdown(result.blocks), 'Replacement');
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [0], offset: 11 },
    focus: { path: [0], offset: 11 },
  });
});

test('parses multiline paste and keeps a paragraph after a terminal table', () => {
  const pasted = replaceEditorSelection(parseMarkdown('Replace me'), {
    anchor: { path: [0], offset: 0 },
    focus: { path: [0], offset: 10 },
  }, '# Pasted\n\n| Name |\n| --- |\n| Ada |');
  const tablePath = [1];
  const continued = ensureParagraphAfterBlock(pasted.blocks, tablePath);

  assert.deepEqual(continued.blocks.map((block) => block.type), ['heading', 'table', 'paragraph']);
  assert.deepEqual(continued.nextPath, [2]);
  assert.equal(serializeMarkdown(continued.blocks), '# Pasted\n\n| Name |\n| --- |\n| Ada |\n\n');
});

test('falls back to a top-level structural replacement across lists, quotes, and tables', () => {
  const source = parseMarkdown('- one\n\n> quoted\n\n| name |\n| --- |\n| cell |');
  const result = replaceEditorSelectionWithFallback(source, {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [2], offset: 0 },
  }, '# New\n\n- [ ] task');

  assert.equal(result.handled, true);
  assert.equal(result.usedFallback, true);
  assert.deepEqual(result.blocks.map((block) => block.type), ['heading', 'taskList', 'paragraph']);
  assert.equal(serializeMarkdown(result.blocks), '# New\n\n- [ ] task\n\n');
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [2], offset: 0 },
    focus: { path: [2], offset: 0 },
  });
});

test('normalizes reversed structural selections before applying the fallback', () => {
  const result = replaceEditorSelectionWithFallback(parseMarkdown('First text\n\n- list'), {
    anchor: { path: [1, 0], offset: 0 },
    focus: { path: [0], offset: 2 },
  }, 'Replacement');

  assert.equal(serializeMarkdown(result.blocks), 'Fi\n\nReplacement');
});

test('splits a non-empty nested list item at the caret using canonical paths', () => {
  const source = [{ type: 'list', ordered: false, items: [{
    inlines: [{ type: 'text', value: 'parent' }],
    children: [{
      type: 'taskList',
      items: [task('nested text')],
    }],
  }] }];
  const result = splitListItemAtSelection(source, {
    anchor: { path: [0, 0, 0, 0], offset: 6 },
    focus: { path: [0, 0, 0, 0], offset: 6 },
  });

  assert.equal(result.handled, true);
  assert.deepEqual(result.blocks[0].items[0].children[0].items.map((item) => serializeMarkdown([{ type: 'paragraph', inlines: item.inlines }])), ['nested', ' text']);
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [0, 0, 0, 1], offset: 0 },
    focus: { path: [0, 0, 0, 1], offset: 0 },
  });
});

test('reconciles a rejected controlled value and preserves or falls back selection', () => {
  const oldBlocks = parseMarkdown('local text');
  const accepted = syncEditorValue('server text', { anchor: { path: [0], offset: 5 }, focus: { path: [0], offset: 5 } });
  const rejected = syncEditorValue('prop text', { anchor: { path: [99], offset: 5 }, focus: { path: [99], offset: 5 } });

  assert.equal(serializeMarkdown(accepted.blocks), 'server text');
  assert.deepEqual(accepted.selection, { anchor: { path: [0], offset: 5 }, focus: { path: [0], offset: 5 } });
  assert.equal(serializeMarkdown(rejected.blocks), 'prop text');
  assert.deepEqual(rejected.selection, { anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 0 } });
  assert.deepEqual(reconcileEditorSelection(oldBlocks, { anchor: { path: [99], offset: 0 }, focus: { path: [99], offset: 0 } }), {
    anchor: { path: [0], offset: 0 },
    focus: { path: [0], offset: 0 },
  });
});

test('delegates one task checkbox change without changing unrelated editor content', () => {
  const blocks = parseMarkdown('- [ ] task');
  const result = applyEditorCheckboxChange(blocks, {
    dataset: { markdownEditorTask: 'true', markdownTaskPath: '0.0' },
  });

  assert.equal(result.handled, true);
  assert.equal(result.blocks[0].items[0].checked, true);
  assert.equal(serializeMarkdown(result.blocks), '- [x] task');
  assert.equal(applyEditorCheckboxChange(blocks, { dataset: {} }).handled, false);
});

test('replaces text inside one list item without replacing the enclosing list', () => {
  const result = replaceEditorSelectionWithFallback(parseMarkdown('- one\n- two'), {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: 3 },
  }, 'first');

  assert.equal(result.handled, true);
  assert.equal(result.blocks[0].type, 'list');
  assert.deepEqual(result.blocks[0].items.map((item) => item.inlines[0]?.value), ['first', 'two']);
});

test('multiline paste inside a list item preserves the item siblings', () => {
  const result = replaceEditorSelectionWithFallback(parseMarkdown('- one\n- two'), {
    anchor: { path: [0, 0], offset: 2 },
    focus: { path: [0, 0], offset: 2 },
  }, 'A\n\nB');

  assert.equal(result.handled, true);
  assert.deepEqual(result.blocks[0].items.map((item) => item.inlines[0]?.value), ['onA', 'Be', 'two']);
});

test('prevents the native event only when the replacement transaction handled the selection', () => {
  const handled = replaceEditorSelectionWithFallback(parseMarkdown('- one\n- two'), {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: 3 },
  }, 'first');
  const unhandled = replaceEditorSelectionWithFallback(parseMarkdown('- one'), {
    anchor: { path: [99], offset: 0 },
    focus: { path: [99], offset: 0 },
  }, 'replacement');

  assert.equal(shouldPreventEditorDefault(handled), true);
  assert.equal(shouldPreventEditorDefault(unhandled), false);
  assert.equal(serializeMarkdown(unhandled.blocks), '- one');
});

test('keeps the editor selection when a toolbar button moves browser focus', () => {
  const remembered = {
    anchor: { path: [0], offset: 2 },
    focus: { path: [0], offset: 6 },
  };

  assert.deepEqual(toolbarSelection(null, remembered), remembered);
  assert.deepEqual(toolbarSelection({
    anchor: { path: [0], offset: 0 },
    focus: { path: [0], offset: 0 },
  }, remembered), remembered);
});
