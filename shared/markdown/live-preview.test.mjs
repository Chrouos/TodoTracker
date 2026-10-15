import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown, serializeMarkdown } from './index.js';
import { livePreviewFixtures } from './live-preview-fixtures.js';
import {
  activeToolbarState,
  readActiveBlockSource,
  replaceActiveBlockSource,
  serializeWithActiveBlockSource,
  toggleBlockSource,
  toggleInlineSource,
} from './live-preview.js';

test('reads paragraph, heading, task item, quote, fenced code, table, and rule source by canonical path', () => {
  const blocks = parseMarkdown([
    'Paragraph',
    '',
    '## Heading',
    '',
    '- [ ] Task',
    '',
    '> Quote',
    '',
    '```js',
    'const value = 1;',
    '```',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '---',
  ].join('\n'));

  assert.equal(readActiveBlockSource(blocks, [0]), 'Paragraph');
  assert.equal(readActiveBlockSource(blocks, [1]), '## Heading');
  assert.equal(readActiveBlockSource(blocks, [2, 0]), '- [ ] Task');
  assert.equal(readActiveBlockSource(blocks, [3]), '> Quote');
  assert.equal(readActiveBlockSource(blocks, [4]), '```js\nconst value = 1;\n```');
  assert.equal(readActiveBlockSource(blocks, [5]), '| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.equal(readActiveBlockSource(blocks, [6]), '---');
});

test('serializes the full document with invalid active source without changing the valid AST', () => {
  const blocks = parseMarkdown('Before\n\n```js\nvalid();\n```\n\nAfter');
  const original = serializeMarkdown(blocks);
  const activeSource = '```js\nvalid();\nnext();';

  assert.equal(
    serializeWithActiveBlockSource(blocks, [1], activeSource),
    `Before\n\n${activeSource}\n\nAfter`,
  );
  assert.equal(serializeMarkdown(blocks), original);
  assert.deepEqual(replaceActiveBlockSource(blocks, [1], activeSource), {
    blocks,
    valid: false,
    nextPath: [1],
  });
});

test('replaces one nested task source without changing its parent, siblings, children, or checked states', () => {
  const blocks = parseMarkdown([
    '- [x] Parent',
    '  - [ ] Nested',
    '    - Child',
    '- [ ] Sibling',
  ].join('\n'));
  const result = replaceActiveBlockSource(blocks, [0, 0, 0, 0], '- [x] Updated');

  assert.equal(result.valid, true);
  assert.deepEqual(result.nextPath, [0, 0, 0, 0]);
  assert.equal(
    serializeMarkdown(result.blocks),
    '- [x] Parent\n  - [x] Updated\n    - Child\n- [ ] Sibling',
  );
  assert.equal(
    serializeMarkdown(blocks),
    '- [x] Parent\n  - [ ] Nested\n    - Child\n- [ ] Sibling',
  );
});

test('accepts multiple same-kind task items but rejects unrelated blocks inside one active task item', () => {
  const blocks = parseMarkdown('- [ ] First\n- [x] Last');
  const accepted = replaceActiveBlockSource(blocks, [0, 0], '- [x] First\n- [ ] Inserted');
  const rejected = replaceActiveBlockSource(blocks, [0, 0], '## Heading');

  assert.equal(accepted.valid, true);
  assert.deepEqual(accepted.nextPath, [0, 1]);
  assert.equal(serializeMarkdown(accepted.blocks), '- [x] First\n- [ ] Inserted\n- [x] Last');
  assert.equal(rejected.valid, false);
  assert.equal(rejected.blocks, blocks);
  assert.deepEqual(rejected.nextPath, [0, 0]);
});

test('keeps blank lines and incomplete fences in active raw source', () => {
  const blocks = parseMarkdown('```\nfirst\nsecond\n```');
  const source = '```\nfirst\n\nsecond';

  assert.equal(readActiveBlockSource(blocks, [0]), '```\nfirst\nsecond\n```');
  assert.equal(serializeWithActiveBlockSource(blocks, [0], source), source);
  assert.equal(replaceActiveBlockSource(blocks, [0], source).valid, false);
});

test('toggles bold, italic, and inline code around a source selection', () => {
  for (const [command, expected] of [
    ['bold', '**Text**'],
    ['italic', '*Text*'],
    ['inline-code', '`Text`'],
  ]) {
    const added = toggleInlineSource('Text', 0, 4, command);
    const removed = toggleInlineSource(
      added.source,
      added.selectionStart,
      added.selectionEnd,
      command,
    );

    assert.equal(added.source, expected);
    assert.equal(removed.source, 'Text');
    assert.deepEqual(
      [removed.selectionStart, removed.selectionEnd],
      [0, 4],
    );
  }
});

test('normalizes mixed bold selection instead of nesting duplicate markers', () => {
  assert.deepEqual(toggleInlineSource('**Bold** plain', 0, 14, 'bold'), {
    source: '**Bold plain**',
    selectionStart: 2,
    selectionEnd: 12,
  });
});

test('inserts a useful placeholder for a collapsed inline selection', () => {
  assert.deepEqual(toggleInlineSource('', 0, 0, 'bold'), {
    source: '**粗體文字**',
    selectionStart: 2,
    selectionEnd: 6,
  });
});

test('removes a selected link while preserving its label', () => {
  assert.deepEqual(toggleInlineSource('[docs](https://example.com)', 0, 27, 'link'), {
    source: 'docs',
    selectionStart: 0,
    selectionEnd: 4,
  });
});

test('toggles block syntax off and applies heading and rule syntax', () => {
  for (const [command, source, expected] of [
    ['heading', '## Heading', 'Heading'],
    ['unordered-list', '- Item', 'Item'],
    ['ordered-list', '1. Item', 'Item'],
    ['task', '- [ ] Task', 'Task'],
    ['quote', '> Quote', 'Quote'],
    ['code-block', '```js\nconst value = 1;\n```', 'const value = 1;'],
    ['rule', '---', ''],
  ]) {
    assert.equal(toggleBlockSource(source, command).source, expected);
  }

  assert.equal(toggleBlockSource('Heading', 'heading').source, '## Heading');
  assert.equal(toggleBlockSource('Paragraph', 'rule').source, '---');
});

test('inserts a complete table template and reports active toolbar state', () => {
  const existingTable = '| A | B |\n| --- | --- |\n| 1 | 2 |';
  assert.equal(
    toggleBlockSource('', 'table').source,
    '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |',
  );
  assert.equal(toggleBlockSource(existingTable, 'table').source, existingTable);
  assert.deepEqual(activeToolbarState('Text **Bold**', 7, 11), {
    bold: true,
    italic: false,
    inlineCode: false,
    link: false,
    heading: false,
    unorderedList: false,
    orderedList: false,
    task: false,
    quote: false,
    codeBlock: false,
    table: false,
    rule: false,
  });
  assert.equal(activeToolbarState('---', 0, 0).rule, true);
});

test('keeps shared live preview parity fixtures executable', () => {
  for (const fixture of livePreviewFixtures.activeSource) {
    assert.equal(readActiveBlockSource(parseMarkdown(fixture.markdown), fixture.path), fixture.expected);
  }
  for (const fixture of livePreviewFixtures.composition) {
    assert.equal(
      serializeWithActiveBlockSource(parseMarkdown(fixture.markdown), fixture.path, fixture.source),
      fixture.expected,
    );
  }
  for (const fixture of livePreviewFixtures.replacement) {
    const result = replaceActiveBlockSource(parseMarkdown(fixture.markdown), fixture.path, fixture.source);
    assert.equal(result.valid, fixture.expected.valid);
    assert.deepEqual(result.nextPath, fixture.expected.nextPath);
    assert.equal(serializeMarkdown(result.blocks), fixture.expected.markdown);
  }
  for (const fixture of livePreviewFixtures.inlineToggle) {
    assert.deepEqual(
      toggleInlineSource(fixture.source, fixture.start, fixture.end, fixture.command),
      fixture.expected,
    );
  }
  for (const fixture of livePreviewFixtures.blockToggle) {
    assert.deepEqual(toggleBlockSource(fixture.source, fixture.command), fixture.expected);
  }
  for (const fixture of livePreviewFixtures.toolbarState) {
    const state = activeToolbarState(fixture.source, fixture.start, fixture.end);
    for (const [key, expected] of Object.entries(fixture.expected)) assert.equal(state[key], expected);
  }
});
