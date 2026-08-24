import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, pathToItem, renderBlocks, renderMarkdown, serializeMarkdown, updateAtPath } from './index.js';

const source = [
  '# Title', '',
  '**bold** *italic* `code` [link](https://example.com)', '',
  '- [ ] Open',
  '  - [x] Nested done',
  '',
  '> Quote', '',
  '```js', 'const value = <tag>;', '```', '',
  '| A | B |', '| --- | ---: |', '| x | 2 |', '',
  '---',
].join('\n');

test('parses and serializes the supported Markdown block fixture', () => {
  const blocks = parseMarkdown(source.replace(/\n/g, '\r\n'));

  assert.deepEqual(blocks.map((block) => block.type), [
    'heading', 'paragraph', 'taskList', 'quote', 'codeBlock', 'table', 'horizontalRule',
  ]);
  assert.equal(blocks[0].level, 1);
  assert.deepEqual(blocks[1].inlines.map((inline) => inline.type), ['strong', 'text', 'emphasis', 'text', 'code', 'text', 'link']);
  assert.equal(blocks[2].items[0].checked, false);
  assert.equal(blocks[2].items[0].children[0].type, 'taskList');
  assert.equal(blocks[2].items[0].children[0].items[0].checked, true);
  assert.deepEqual(blocks[5].alignments, ['left', 'right']);
  assert.equal(serializeMarkdown(blocks), source);
});

test('keeps non-task ordered and unordered lists plus unsupported syntax as semantic text', () => {
  const blocks = parseMarkdown(['1. First', '2. Second', '', '- Plain', '  - Child', '', '~~not supported~~'].join('\n'));

  assert.deepEqual(blocks.map((block) => block.type), ['list', 'list', 'paragraph']);
  assert.equal(blocks[0].ordered, true);
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items[0].children[0].type, 'list');
  assert.deepEqual(blocks[2].inlines, [{ type: 'text', value: '~~not supported~~' }]);
  assert.equal(serializeMarkdown(blocks), ['1. First', '2. Second', '', '- Plain', '  - Child', '', '~~not supported~~'].join('\n'));
  assert.deepEqual(parseMarkdown('````'), [{ type: 'paragraph', inlines: [{ type: 'text', value: '````' }] }]);
});

test('renders escaped deterministic HTML and only safe task interactions', () => {
  const html = renderMarkdown(source);

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong> <em>italic<\/em> <code>code<\/code> <a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">link<\/a>/);
  assert.match(html, /<input type="checkbox" disabled>/);
  assert.match(html, /const value = &lt;tag&gt;;/);
  assert.match(html, /<th style="text-align:right">B<\/th>/);
  assert.doesNotMatch(html, /data-markdown-task-path/);

  const interactive = renderBlocks(parseMarkdown(source), { interactiveTasks: true });
  assert.match(interactive, /data-markdown-task-path="2\.0"/);
  assert.match(interactive, /data-markdown-task-checked="false"/);
  assert.doesNotMatch(interactive, /disabled/);

  assert.equal(
    renderMarkdown('[unsafe](javascript:alert(1))'),
    '<p>[unsafe](javascript:alert(1))</p>',
  );
});

test('preserves escaped table pipes and round-trips their semantic AST', () => {
  const tableSource = [
    '| A | B |',
    '| --- | ---: |',
    '| left\\|right | `code\\|pipe` |',
  ].join('\n');
  const blocks = parseMarkdown(tableSource);

  assert.deepEqual(blocks[0].rows[0][0], [{ type: 'text', value: 'left|right' }]);
  assert.deepEqual(blocks[0].rows[0][1], [{ type: 'code', inlines: 'code|pipe' }]);
  assert.equal(serializeMarkdown(blocks), tableSource);
  assert.deepEqual(parseMarkdown(serializeMarkdown(blocks)), blocks);
});

test('renders normal-list and quote task paths consumable by AST helpers', () => {
  const normalListBlocks = parseMarkdown(['- Parent', '  - [ ] Nested task'].join('\n'));
  const normalListPath = [0, 0, 0];
  const normalListHtml = renderBlocks(normalListBlocks, { interactiveTasks: true });

  assert.match(normalListHtml, /data-markdown-task-path="0\.0\.0"/);
  assert.equal(pathToItem(normalListBlocks, normalListPath).inlines[0].value, 'Nested task');
  assert.equal(updateAtPath(normalListBlocks, normalListPath, (item) => ({ ...item, checked: true }))[0].items[0].children[0].items[0].checked, true);

  const quoteBlocks = parseMarkdown('> - [x] Quoted task');
  const quotePath = [0, 0, 0];
  const quoteHtml = renderBlocks(quoteBlocks, { interactiveTasks: true });

  assert.match(quoteHtml, /data-markdown-task-path="0\.0\.0"/);
  assert.equal(pathToItem(quoteBlocks, quotePath).inlines[0].value, 'Quoted task');
  assert.equal(updateAtPath(quoteBlocks, quotePath, (item) => ({ ...item, checked: false }))[0].blocks[0].items[0].checked, false);
});

test('renders Inline-array code with one escaping pass', () => {
  const blocks = [{ type: 'paragraph', inlines: [{
    type: 'code',
    inlines: [{ type: 'text', value: '<code>&' }],
  }] }];

  assert.equal(renderBlocks(blocks), '<p><code>&lt;code&gt;&amp;</code></p>');
});

test('round-trips a non-canonical Markdown source to an equivalent AST', () => {
  const nonCanonicalSource = [
    '2. First', '3. Second', '',
    '- Parent', '  - [x] Nested task', '',
    '> - [ ] Quoted task',
  ].join('\n');
  const blocks = parseMarkdown(nonCanonicalSource);

  assert.deepEqual(parseMarkdown(serializeMarkdown(blocks)), blocks);
});
