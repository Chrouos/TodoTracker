import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneBlocks, updateAtPath } from './ast.js';

test('updates a nested task item without mutating the original tree', () => {
  const source = [{
    type: 'taskList',
    items: [{ checked: false, inlines: [{ type: 'text', value: 'Parent' }], children: [
      { type: 'taskList', items: [{ checked: false, inlines: [{ type: 'text', value: 'Child' }], children: [] }] },
    ] }],
  }];
  const next = updateAtPath(source, [0, 0, 0], (item) => ({ ...item, checked: true }));
  assert.equal(next[0].items[0].children[0].items[0].checked, true);
  assert.equal(source[0].items[0].children[0].items[0].checked, false);
});
