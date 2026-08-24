import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneBlocks, pathToItem, updateAtPath } from './ast.js';

function taskList(items) {
  return { type: 'taskList', items };
}

function item(value, children = []) {
  return { checked: false, inlines: [{ type: 'text', value }], children };
}

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

test('resolves and updates a sibling nested task item by item index', () => {
  const source = [{ type: 'taskList', items: [item('Parent', [taskList([item('First'), item('Second')])])] }];
  assert.equal(pathToItem(source, [0, 0, 1]).inlines[0].value, 'Second');
  const next = updateAtPath(source, [0, 0, 1], (task) => ({ ...task, checked: true }));
  assert.equal(next[0].items[0].children[0].items[1].checked, true);
  assert.equal(source[0].items[0].children[0].items[1].checked, false);
});

test('resolves and updates a deeply nested task item by each item index', () => {
  const source = [{ type: 'taskList', items: [item('Root', [taskList([
    item('Sibling'),
    item('Middle', [taskList([item('Deep sibling'), item('Target')])]),
  ])])] }];
  const next = updateAtPath(source, [0, 0, 1, 1], (task) => ({ ...task, checked: true }));
  assert.equal(pathToItem(next, [0, 0, 1, 1]).inlines[0].value, 'Target');
  assert.equal(pathToItem(source, [0, 0, 1, 1]).checked, false);
});

test('cloneBlocks recursively clones the AST without sharing nested references', () => {
  const source = [{ type: 'taskList', items: [item('Root', [taskList([item('Child')])])] }];
  const clone = cloneBlocks(source);
  assert.deepEqual(clone, source);
  assert.notStrictEqual(clone, source);
  assert.notStrictEqual(clone[0].items[0], source[0].items[0]);
  assert.notStrictEqual(clone[0].items[0].children[0].items, source[0].items[0].children[0].items);
});

test('rejects invalid or out-of-range task item paths', () => {
  const source = [{ type: 'taskList', items: [item('Root')] }];
  assert.throws(() => pathToItem(source, [0]), /at least two/);
  assert.throws(() => pathToItem(source, [0, 2]), /task item/);
  assert.throws(() => pathToItem(source, [0, 0, 0]), /nested task list/);
});
