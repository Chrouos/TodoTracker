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

console.log('Extension Todo project sync contract passed');
