import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  ensureParagraphAfterBlock,
  indentListItem,
  parseMarkdown,
  pathToItem,
  replaceEditorSelection,
  serializeMarkdown,
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

test('wires one persistent Web root to the DOM adapter and shared transactions', () => {
  const source = fs.readFileSync(new URL('../components/MarkdownBlockEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /renderEditableBlocks\(root, blocks\)/);
  assert.match(source, /readEditableBlocks\(root,/);
  assert.match(source, /readEditorSelection\(root\)/);
  assert.match(source, /restoreEditorSelection\(root, selection\)/);
  assert.equal((source.match(/contentEditable/g) ?? []).length, 1);
  assert.doesNotMatch(source, /data-editor-surface|activeTargetRef|focusPath|onSurface/);
  for (const handler of [
    'onBeforeInput',
    'onInput',
    'onKeyDown',
    'onPaste',
    'onCompositionStart',
    'onCompositionEnd',
    'onClick',
    'onChange',
  ]) assert.match(source, new RegExp(`${handler}=`));
});

test('preserves toolbar, source mode, imperative, task, and external-sync hooks', () => {
  const source = fs.readFileSync(new URL('../components/MarkdownBlockEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /role="toolbar"/);
  assert.match(source, /MarkdownBlockEditorProps/);
  assert.match(source, /MarkdownEditorHandle/);
  assert.match(source, /focus:\s*\(\)\s*=>/);
  assert.match(source, /insertText:\s*\(text: string\)\s*=>/);
  assert.match(source, /getValue:\s*\(\)\s*=>/);
  assert.match(source, /getSelectionContext:\s*\(\)\s*=>/);
  assert.match(source, /className="markdown-block-editor-source"/);
  assert.match(source, /value !== emittedValueRef\.current/);
  assert.match(source, /dataset\.markdownEditorTask/);
  assert.match(source, /onInput=\{handleInput\}/);
  assert.match(source, /const handleInput[\s\S]*?markdownEditorTask[\s\S]*?commitDom/);
  assert.match(source, /toggleTaskItem\(/);
  assert.match(source, /ensureParagraphAfterBlock\(/);
});
