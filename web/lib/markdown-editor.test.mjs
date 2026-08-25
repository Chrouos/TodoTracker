import assert from 'node:assert/strict';
import test from 'node:test';
import { indentListItem, parseMarkdown, pathToItem, serializeMarkdown } from '../../shared/markdown/index.js';
import {
  collectTaskItemPaths,
  listItemPathAfterIndent,
  splitTextBlockAtOffset,
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

test('collects task paths through a task list, quote, and nested task list', () => {
  const blocks = [{
    type: 'taskList',
    items: [task('outer', false, [{
      type: 'quote',
      blocks: [{ type: 'taskList', items: [task('inner')] }],
    }])],
  }];
  const paths = collectTaskItemPaths(blocks);
  assert.deepEqual(paths, [[0, 0], [0, 0, 0, 0]]);
  assert.equal(pathToItem(blocks, paths[1]).inlines[0].value, 'inner');
});

test('returns the transformed path for indent and outdent before refocusing', () => {
  const source = [{ type: 'taskList', items: [task('one'), task('two')] }];
  const indentedPath = listItemPathAfterIndent(source, [0, 1], 'in');
  const indented = indentListItem(source, [0, 1], 'in');
  assert.deepEqual(indentedPath, [0, 0, 0]);
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
