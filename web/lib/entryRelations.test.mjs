import assert from 'node:assert/strict';
import { projectIdForTask } from './entryRelations.ts';

const tasks = [
  { id: 'task-project', projectId: 'new-project' },
  { id: 'task-unclassified', projectId: null },
];

assert.equal(projectIdForTask('task-project', tasks, 'old-project'), 'new-project');
assert.equal(projectIdForTask('task-unclassified', tasks, 'old-project'), '');
assert.equal(projectIdForTask('missing', tasks, 'old-project'), 'old-project');

console.log('Web Todo project sync contract passed');
