import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, renderBlocks, renderMarkdown, serializeMarkdown } from './index.js';

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
