import test from 'node:test';
import assert from 'node:assert/strict';
import { removeProjectData } from './relations.js';

test('removing a project detaches its task-linked entries and reparents children', () => {
  const result = removeProjectData('project-1', {
    projects: [
      { id: 'project-1', parentId: 'project-root' },
      { id: 'project-child', parentId: 'project-1' },
      { id: 'project-other', parentId: 'project-root' },
    ],
    tasks: [
      { id: 'task-1', projectId: 'project-1' },
      { id: 'task-other', projectId: 'project-other' },
    ],
    entries: [
      { id: 'task-entry', taskId: 'task-1', projectId: 'project-1' },
      { id: 'direct-entry', taskId: null, projectId: 'project-1' },
      { id: 'other-entry', taskId: 'task-other', projectId: 'project-other' },
    ],
  });

  assert.deepEqual(result.projects, [
    { id: 'project-child', parentId: 'project-root' },
    { id: 'project-other', parentId: 'project-root' },
  ]);
  assert.deepEqual(result.tasks, [{ id: 'task-other', projectId: 'project-other' }]);
  assert.deepEqual(result.entries, [
    { id: 'task-entry', taskId: null, projectId: null },
    { id: 'direct-entry', taskId: null, projectId: null },
    { id: 'other-entry', taskId: 'task-other', projectId: 'project-other' },
  ]);
});
