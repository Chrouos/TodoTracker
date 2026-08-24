import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMarkdownShortcut,
  continueBlock,
  exitEmptyBlock,
  indentListItem,
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
  const next = exitEmptyBlock(source, [0, 0, 0]);
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
  const outdented = indentListItem(indented, [0, 0, 0], 'out');
  assert.equal(outdented[0].items.length, 3);
  assert.equal(source[0].items.length, 3);
});

test('toggles only the selected task checkbox', () => {
  const source = [{ type: 'taskList', items: [task('one'), task('two')] }];
  const next = toggleTaskItem(source, [0, 1]);
  assert.equal(next[0].items[1].checked, true);
  assert.equal(next[0].items[0].checked, false);
  assert.equal(source[0].items[1].checked, false);
});
