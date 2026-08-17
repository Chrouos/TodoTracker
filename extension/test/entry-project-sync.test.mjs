import assert from 'node:assert/strict';
import { projectIdForTask } from '../src/lib/entry-relations.js';

const tasks = [
  { id: 'task-project', projectId: 'new-project' },
  { id: 'task-unclassified', projectId: null },
];

assert.equal(projectIdForTask('task-project', tasks, 'old-project'), 'new-project');
assert.equal(projectIdForTask('task-unclassified', tasks, 'old-project'), '');
assert.equal(projectIdForTask('missing', tasks, 'old-project'), 'old-project');

console.log('Extension Todo project sync contract passed');
