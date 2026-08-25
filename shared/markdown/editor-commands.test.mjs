import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMarkdownShortcut,
  continueBlock,
  exitEmptyBlock,
  indentListItem,
  replaceEditorSelection,
  splitBlockAtSelection,
  deleteBackwardAtSelection,
  deleteForwardAtSelection,
  ensureParagraphAfterBlock,
  removeTableBeforeParagraph,
  toggleTaskItem,
} from './editor-commands.js';

const text = (value) => [{ type: 'text', value }];
const item = (value, children = []) => ({ inlines: text(value), children });
const task = (value, checked = false, children = []) => ({ checked, inlines: text(value), children });

test('detects heading and unchecked task shortcuts only at the block start', () => {
  assert.deepEqual(detectMarkdownShortcut('# '), { type: 'heading', level: 1 });
  assert.deepEqual(detectMarkdownShortcut('- [ ] '), { type: 'task', checked: false });
  assert.deepEqual(detectMarkdownShortcut('- [x] '), { type: 'task', checked: true });
  assert.deepEqual(detectMarkdownShortcut('3. '), { type: 'list', ordered: true });
  assert.deepEqual(detectMarkdownShortcut('> '), { type: 'quote' });
  assert.deepEqual(detectMarkdownShortcut('``` '), { type: 'codeBlock' });
  assert.equal(detectMarkdownShortcut('text # '), null);
  assert.equal(detectMarkdownShortcut('# heading '), null);
});

test('continues and toggles task items inside a quote using the shared path contract', () => {
  const source = [{ type: 'quote', blocks: [{ type: 'taskList', items: [task('one')] }] }];
  const continued = continueBlock(source, [0, 0, 0]);
  assert.equal(continued[0].blocks[0].items.length, 2);
  const toggled = toggleTaskItem(source, [0, 0, 0]);
  assert.equal(toggled[0].blocks[0].items[0].checked, true);
  assert.equal(source[0].blocks[0].items[0].checked, false);
});

test('resolves a quote nested inside a list item at a four-index path', () => {
  const source = [{ type: 'taskList', items: [task('parent', false, [
    { type: 'quote', blocks: [{ type: 'taskList', items: [task('quoted')] }] },
  ])] }];
  const next = toggleTaskItem(source, [0, 0, 0, 0, 0]);
  assert.equal(next[0].items[0].children[0].blocks[0].items[0].checked, true);
  assert.equal(source[0].items[0].children[0].blocks[0].items[0].checked, false);
});

test('continues a nested list without mutating the source tree', () => {
  const source = [{ type: 'list', ordered: false, items: [item('one'), item('two')] }];
  const next = continueBlock(source, [0, 0]);
  assert.equal(next[0].items.length, 3);
  assert.deepEqual(next[0].items[1].inlines, []);
  assert.notStrictEqual(next, source);
  assert.equal(source[0].items.length, 2);
});

test('exits an empty nested task item into a paragraph after its list', () => {
  const source = [{ type: 'taskList', items: [task('parent', false, [
    { type: 'taskList', items: [task('')] },
  ])] }];
  const next = exitEmptyBlock(source, [0, 0, 0, 0]);
  assert.deepEqual(next[0].items[0].children, [{ type: 'paragraph', inlines: [] }]);
  assert.equal(source[0].items[0].children[0].items.length, 1);
});

test('does not exit a non-empty item or lose its children', () => {
  const source = [{ type: 'list', ordered: false, items: [item('content', [
    { type: 'paragraph', inlines: text('child') },
  ])] }];
  const next = exitEmptyBlock(source, [0, 0]);
  assert.deepEqual(next, source);
  assert.notStrictEqual(next, source);
  assert.notStrictEqual(next[0], source[0]);
});

test('exits a top-level empty list item after removing its list', () => {
  const source = [{ type: 'taskList', items: [task('')] }];
  const next = exitEmptyBlock(source, [0, 0]);
  assert.deepEqual(next, [{ type: 'paragraph', inlines: [] }]);
  assert.deepEqual(source[0].items, [task('')]);
});

test('indents and outdents list items immutably', () => {
  const source = [{ type: 'list', ordered: false, items: [item('one'), item('two'), item('three')] }];
  const indented = indentListItem(source, [0, 1], 'in');
  assert.deepEqual(indented[0].items.map((entry) => entry.inlines[0].value), ['one', 'three']);
  assert.equal(indented[0].items[0].children[0].items[0].inlines[0].value, 'two');
  const outdented = indentListItem(indented, [0, 0, 0, 0], 'out');
  assert.equal(outdented[0].items.length, 3);
  assert.equal(source[0].items.length, 3);
});

test('indents and outdents an item through more than one nested level', () => {
  const source = [{ type: 'list', ordered: false, items: [item('root', [
    { type: 'list', ordered: false, items: [item('middle'), item('leaf')] },
  ])] }];
  const deeper = indentListItem(source, [0, 0, 0, 1], 'in');
  assert.equal(deeper[0].items[0].children[0].items[0].children[0].items[0].inlines[0].value, 'leaf');
  const oneLevelOut = indentListItem(deeper, [0, 0, 0, 0, 0, 0], 'out');
  assert.deepEqual(oneLevelOut[0].items[0].children[0].items.map((entry) => entry.inlines[0].value), ['middle', 'leaf']);
  const fullyOut = indentListItem(oneLevelOut, [0, 0, 0, 1], 'out');
  assert.deepEqual(fullyOut[0].items.map((entry) => entry.inlines[0].value), ['root', 'leaf']);
  assert.equal(source[0].items[0].children[0].items.length, 2);
});

test('outdents quote-nested list items only within the quote', () => {
  const source = [{ type: 'list', ordered: false, items: [item('outer', [
    { type: 'quote', blocks: [{ type: 'list', ordered: false, items: [item('quote parent', [
      { type: 'list', ordered: false, items: [item('nested'), item('target')] },
    ])] }] },
  ]), item('outside')] }];
  const next = indentListItem(source, [0, 0, 0, 0, 0, 0, 1], 'out');
  const quoteList = next[0].items[0].children[0].blocks[0];
  assert.equal(quoteList.items[0].children[0].items[0].inlines[0].value, 'nested');
  assert.deepEqual(quoteList.items.map((entry) => entry.inlines[0].value), ['quote parent', 'target']);
  assert.deepEqual(next[0].items.map((entry) => entry.inlines[0].value), ['outer', 'outside']);
  assert.equal(source[0].items[0].children[0].blocks[0].items[0].children[0].items.length, 2);
});

test('does not outdent a quote-contained list item across the quote boundary', () => {
  const source = [{ type: 'list', ordered: false, items: [item('outer', [
    { type: 'quote', blocks: [{ type: 'list', ordered: false, items: [item('first'), item('target')] }] },
  ]), item('outside')] }];
  const next = indentListItem(source, [0, 0, 0, 0, 1], 'out');
  const quoteList = next[0].items[0].children[0].blocks[0];
  assert.deepEqual(quoteList.items.map((entry) => entry.inlines[0].value), ['first', 'target']);
  assert.deepEqual(next[0].items.map((entry) => entry.inlines[0].value), ['outer', 'outside']);
  assert.notStrictEqual(next, source);
  assert.deepEqual(source[0].items[0].children[0].blocks[0].items.map((entry) => entry.inlines[0].value), ['first', 'target']);
});

test('toggles only the selected task checkbox', () => {
  const source = [{ type: 'taskList', items: [task('one'), task('two')] }];
  const next = toggleTaskItem(source, [0, 1]);
  assert.equal(next[0].items[1].checked, true);
  assert.equal(next[0].items[0].checked, false);
  assert.equal(source[0].items[1].checked, false);
});

test('consumes every child block index when toggling mixed nested tasks', () => {
  const source = [{ type: 'list', ordered: false, items: [item('parent', [
    { type: 'taskList', items: [task('first')] },
    { type: 'paragraph', inlines: text('plain child') },
    { type: 'taskList', items: [task('target')] },
  ])] }];

  const next = toggleTaskItem(source, [0, 0, 2, 0]);
  assert.equal(next[0].items[0].children[0].items[0].checked, false);
  assert.equal(next[0].items[0].children[2].items[0].checked, true);
});

test('replaces a paragraph selection with text without mutating the source tree', () => {
  const source = [{ type: 'paragraph', inlines: text('hello world') }];
  const result = replaceEditorSelection(source, {
    anchor: { path: [0], offset: 6 },
    focus: { path: [0], offset: 11 },
  }, 'there');

  assert.deepEqual(result.blocks, [{ type: 'paragraph', inlines: text('hello there') }]);
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [0], offset: 11 },
    focus: { path: [0], offset: 11 },
  });
  assert.deepEqual(source, [{ type: 'paragraph', inlines: text('hello world') }]);
});

test('replaces a selection with parsed multiline Markdown blocks', () => {
  const result = replaceEditorSelection([{ type: 'paragraph', inlines: text('replace me') }], {
    anchor: { path: [0], offset: 0 },
    focus: { path: [0], offset: 10 },
  }, '# Pasted\n\nsecond');

  assert.deepEqual(result.blocks, [
    { type: 'heading', level: 1, inlines: text('Pasted') },
    { type: 'paragraph', inlines: text('second') },
  ]);
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [1], offset: 6 },
    focus: { path: [1], offset: 6 },
  });
});

test('splits a heading at its logical selection offset', () => {
  const result = splitBlockAtSelection([{ type: 'heading', level: 2, inlines: text('abcdef') }], {
    anchor: { path: [0], offset: 3 },
    focus: { path: [0], offset: 3 },
  });

  assert.deepEqual(result.blocks, [
    { type: 'heading', level: 2, inlines: text('abc') },
    { type: 'heading', level: 2, inlines: text('def') },
  ]);
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [1], offset: 0 },
    focus: { path: [1], offset: 0 },
  });
});

test('Backspace merges adjacent paragraphs and returns the join selection', () => {
  const result = deleteBackwardAtSelection([
    { type: 'paragraph', inlines: text('first') },
    { type: 'paragraph', inlines: text('second') },
  ], {
    anchor: { path: [1], offset: 0 },
    focus: { path: [1], offset: 0 },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.blocks, [{ type: 'paragraph', inlines: text('firstsecond') }]);
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [0], offset: 5 },
    focus: { path: [0], offset: 5 },
  });
});

test('Delete merges the following paragraph and returns the join selection', () => {
  const result = deleteForwardAtSelection([
    { type: 'paragraph', inlines: text('first') },
    { type: 'paragraph', inlines: text('second') },
  ], {
    anchor: { path: [0], offset: 5 },
    focus: { path: [0], offset: 5 },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.blocks, [{ type: 'paragraph', inlines: text('firstsecond') }]);
  assert.deepEqual(result.nextSelection, {
    anchor: { path: [0], offset: 5 },
    focus: { path: [0], offset: 5 },
  });
});

test('does not merge across quote, list, or table boundaries', () => {
  const source = [
    { type: 'paragraph', inlines: text('before') },
    { type: 'quote', blocks: [{ type: 'paragraph', inlines: text('quoted') }] },
    { type: 'list', ordered: false, items: [item('listed')] },
    { type: 'table', header: [text('head')], alignments: ['left'], rows: [] },
    { type: 'paragraph', inlines: text('after') },
  ];
  const backward = deleteBackwardAtSelection(source, {
    anchor: { path: [4], offset: 0 },
    focus: { path: [4], offset: 0 },
  });
  const forward = deleteForwardAtSelection(source, {
    anchor: { path: [0], offset: 6 },
    focus: { path: [0], offset: 6 },
  });

  assert.equal(backward.changed, false);
  assert.equal(forward.changed, false);
  assert.deepEqual(backward.blocks, source);
  assert.deepEqual(forward.blocks, source);
});

test('adds a paragraph after a table and removes a table before its paragraph', () => {
  const table = { type: 'table', header: [text('head')], alignments: ['left'], rows: [] };
  const continued = ensureParagraphAfterBlock([table], [0]);
  assert.deepEqual(continued.blocks, [table, { type: 'paragraph', inlines: [] }]);
  assert.deepEqual(continued.nextPath, [1]);

  const removed = removeTableBeforeParagraph(continued.blocks, [1]);
  assert.deepEqual(removed.blocks, [{ type: 'paragraph', inlines: [] }]);
  assert.deepEqual(removed.nextPath, [0]);
});
