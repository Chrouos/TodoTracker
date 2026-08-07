import assert from 'node:assert/strict';
import { collectProjectWorkLog } from './projectWorkLog';

const result = collectProjectWorkLog('p1', [
  { id: 'p1', parentId: null, name: 'Project', color: '#000', archivedAt: null, createdAt: '' },
  { id: 'p2', parentId: 'p1', name: 'Child', color: '#000', archivedAt: null, createdAt: '' },
], [
  { id: 't1', projectId: 'p2', title: 'Todo', notes: 'todo note', status: 'todo', openedAt: null, dueDate: null, completedAt: null, reopenCount: 0, sortOrder: 0, createdAt: '', updatedAt: '' },
], [
  { id: 'e1', projectId: null, taskId: 't1', description: 'work', notes: 'work note', startedAt: '', endedAt: '', clientEntryId: '', source: 'manual', tagIds: [], createdAt: '', updatedAt: '', deletedAt: null },
]);

assert.equal(result.tasks[0].notes, 'todo note');
assert.equal(result.entries[0].notes, 'work note');
