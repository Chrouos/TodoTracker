import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCompletedTasks } from './workspace-history.js';

test('groups completed tasks newest first and keeps undated tasks last', () => {
  const tasks = [{ id: 'a', completedAt: '2026-08-01T02:00:00Z' }, { id: 'b', completedAt: null }, { id: 'c', completedAt: '2026-09-02T02:00:00Z' }];
  assert.deepEqual(groupCompletedTasks(tasks).map(({ month, tasks: items }) => [month, items.map((item) => item.id)]), [['2026-09', ['c']], ['2026-08', ['a']], ['', ['b']]]);
  assert.equal(tasks[0].id, 'a');
});
