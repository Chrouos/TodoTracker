import test from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenTaskTree,
  incompleteTaskChildCount,
  taskDescendantIds,
  taskWouldCycle,
} from './tree.js';

const tasks = [
  { id: 'a', title: '主任務', parentId: null, sortOrder: 1 },
  { id: 'b', title: '子任務', parentId: 'a', sortOrder: 1, status: 'todo' },
  { id: 'c', title: '另一個子任務', parentId: 'a', sortOrder: 2, status: 'done' },
];

test('flattens task hierarchy in parent order', () => {
  assert.deepEqual(flattenTaskTree(tasks).map((task) => [task.id, task.depth]), [
    ['a', 0], ['b', 1], ['c', 1],
  ]);
});

test('detects task cycles and descendants', () => {
  assert.deepEqual([...taskDescendantIds(tasks, 'a')].sort(), ['b', 'c']);
  assert.equal(taskWouldCycle(tasks, 'a', 'b'), true);
  assert.equal(taskWouldCycle(tasks, 'b', 'a'), false);
});

test('counts incomplete direct children', () => {
  assert.equal(incompleteTaskChildCount(tasks, 'a'), 1);
});
