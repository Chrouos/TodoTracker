import assert from 'node:assert/strict';
import { buildProjectWorkspace, paginateItems } from './projectWorkspace';

const result = buildProjectWorkspace('p1', [
  { id: 'p1', parentId: null, name: 'Root', color: '#000', archivedAt: null, createdAt: '' },
  { id: 'p2', parentId: 'p1', name: 'Child', color: '#000', archivedAt: null, createdAt: '' },
], [
  { id: 't1', projectId: 'p2', title: 'Todo', notes: '', status: 'todo', openedAt: '2026-08-01T00:00:00.000Z', dueDate: null, dueTime: null, scheduleId: null, completedAt: null, reopenCount: 0, sortOrder: 0, createdAt: '', updatedAt: '' },
], [
  { id: 'e1', projectId: null, taskId: 't1', description: 'Work', notes: 'note', startedAt: '2026-08-01T01:00:00.000Z', endedAt: '2026-08-01T02:00:00.000Z', clientEntryId: '', source: 'manual', tagIds: [], createdAt: '', updatedAt: '', deletedAt: null },
]);

assert.equal(result?.tasks.length, 1);
assert.equal(result?.entries.length, 1);
assert.equal(result?.stats.totalSeconds, 3600);
assert.equal(buildProjectWorkspace('missing', [], [], []), null);

assert.deepEqual(paginateItems(['a', 'b', 'c'], 1, 2), { items: ['a', 'b'], page: 1, pageCount: 2 });
assert.deepEqual(paginateItems(['a', 'b', 'c'], 2, 2), { items: ['c'], page: 2, pageCount: 2 });
assert.deepEqual(paginateItems(['a', 'b', 'c'], 99, 2), { items: ['c'], page: 2, pageCount: 2 });
assert.deepEqual(paginateItems([], 1, 2), { items: [], page: 1, pageCount: 1 });
