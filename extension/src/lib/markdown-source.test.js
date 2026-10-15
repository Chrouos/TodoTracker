import test from 'node:test';
import assert from 'node:assert/strict';
import * as extension from './markdown-live-preview.js';
import * as shared from '../../../shared/markdown/live-preview.js';

for (const [name, api] of [['Extension', extension], ['Web', shared]]) {
  test(`${name}: source formatting preserves surrounding whitespace and toggles selected lines`, () => {
    assert.equal(typeof api.formatSourceSelection, 'function');
    const source = 'Before  \n\n\nOne\nTwo\n\nAfter  \n';
    const result = api.formatSourceSelection(source, 11, 18, 'unordered-list');
    assert.equal(result.source, 'Before  \n\n\n- One\n- Two\n\nAfter  \n');
    const restored = api.formatSourceSelection(result.source, result.selectionStart, result.selectionEnd, 'unordered-list');
    assert.equal(restored.source, source);
  });

  test(`${name}: heading at the start of a line does not modify the previous line`, () => {
    assert.equal(typeof api.formatSourceSelection, 'function');
    assert.equal(api.formatSourceSelection('First\nSecond\nThird', 6, 6, 'heading').source, 'First\n## Second\nThird');
    assert.equal(api.formatSourceSelection('First\nSecond', 0, 0, 'heading').source, '## First\nSecond');
  });

  test(`${name}: source formatting inserts a fenced block without consuming neighboring notes`, () => {
    assert.equal(typeof api.formatSourceSelection, 'function');
    assert.equal(api.formatSourceSelection('Before\n\nA  B\n1  2\n\nAfter', 8, 17, 'code-block').source,
      'Before\n\n```\nA  B\n1  2\n```\n\nAfter');
  });

  test(`${name}: inserting a table or divider at a caret preserves the current line`, () => {
    assert.equal(api.formatSourceSelection('Keep this\nTail', 4, 4, 'rule').source, 'Keep this\n\n---\n\nTail');
    assert.equal(api.formatSourceSelection('Keep this\nTail', 4, 4, 'table').source,
      'Keep this\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n\nTail');
  });

  test(`${name}: preview task toggles change only the checkbox marker`, () => {
    assert.equal(typeof api.toggleTaskSource, 'function');
    const source = '表頭    數值\n12      264\n\n\n> - [ ] **確認**  結果\n\n最後  \n';
    const toggled = api.toggleTaskSource(source, [1, 0, 0]);
    assert.equal(toggled, '表頭    數值\n12      264\n\n\n> - [x] **確認**  結果\n\n最後  \n');
    assert.equal(api.toggleTaskSource(toggled, [1, 0, 0]), source);
    assert.equal(api.toggleTaskSource(source, [99, 0]), source);
  });

  test(`${name}: task source mapping ignores fenced examples and handles nested duplicate labels`, () => {
    assert.equal(typeof api.toggleTaskSource, 'function');
    const source = '```\n- [ ] Same\n```\n\n- Parent\n  - [ ] Same\n  - [ ] Same\n';
    assert.equal(api.toggleTaskSource(source, [1, 0, 0, 1]),
      '```\n- [ ] Same\n```\n\n- Parent\n  - [ ] Same\n  - [x] Same\n');
  });
}
