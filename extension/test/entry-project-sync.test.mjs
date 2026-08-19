import assert from 'node:assert/strict';
import * as entryRelations from '../src/lib/entry-relations.js';

const tasks = [
  { id: 'task-project', projectId: 'new-project' },
  { id: 'task-unclassified', projectId: null },
];

assert.equal(entryRelations.projectIdForTask('task-project', tasks, 'old-project'), 'new-project');
assert.equal(entryRelations.projectIdForTask('task-unclassified', tasks, 'old-project'), '');
assert.equal(entryRelations.projectIdForTask('missing', tasks, 'old-project'), 'old-project');

assert.equal(typeof entryRelations.tasksForProject, 'function');
assert.deepEqual(
  entryRelations.tasksForProject([
    { id: 'same-project', projectId: 'new-project' },
    { id: 'other-project', projectId: 'other-project' },
  ], 'new-project').map((task) => task.id),
  ['same-project'],
);
assert.deepEqual(
  entryRelations.tasksForProject(tasks, '').map((task) => task.id),
  ['task-project', 'task-unclassified'],
);

assert.equal(typeof entryRelations.sortTasksForManualEntry, 'function');
assert.deepEqual(
  entryRelations.sortTasksForManualEntry([
    { id: 'done-old', status: 'done', updatedAt: '2026-08-01T09:00:00Z' },
    { id: 'active-old', status: 'todo', updatedAt: '2026-08-01T09:00:00Z' },
    { id: 'active-entry-recent', status: 'todo', updatedAt: '2026-07-01T09:00:00Z' },
    { id: 'never', status: 'todo' },
    { id: 'done-recent', status: 'done', updatedAt: '2026-08-19T09:00:00Z' },
    { id: 'active-task-recent', status: 'doing', updatedAt: '2026-08-18T09:00:00Z' },
  ], [
    { id: 'entry-recent', taskId: 'active-entry-recent', endedAt: '2026-08-20T09:00:00Z' },
  ]).map((task) => task.id),
  ['active-entry-recent', 'active-task-recent', 'active-old', 'never', 'done-recent', 'done-old'],
);

console.log('Extension Todo project sync contract passed');
