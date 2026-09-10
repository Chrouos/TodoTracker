import test from 'node:test';
import assert from 'node:assert/strict';
import { sortProjectsByRecentActivity } from './workspace.js';

test('sortProjectsByRecentActivity puts latest project activity first and bubbles child activity to ancestors', () => {
  const projects = [
    { id: 'parent', name: 'Parent', parentId: null },
    { id: 'child', name: 'Child', parentId: 'parent' },
    { id: 'old', name: 'Old', parentId: null },
    { id: 'empty', name: 'Empty', parentId: null },
  ];
  const entries = [
    { id: 'old-entry', projectId: 'old', startedAt: '2026-09-08T10:00:00.000Z', endedAt: '2026-09-08T11:00:00.000Z' },
    { id: 'child-entry', projectId: 'child', startedAt: '2026-09-10T10:00:00.000Z', endedAt: '2026-09-10T11:00:00.000Z' },
    { id: 'long-entry', projectId: 'old', startedAt: '2026-09-01T10:00:00.000Z', endedAt: '2026-09-12T11:00:00.000Z' },
  ];

  const result = sortProjectsByRecentActivity(projects, entries);

  assert.deepEqual(result.map((project) => project.id), ['old', 'parent', 'child', 'empty']);
  assert.equal(result.find((project) => project.id === 'old').latestActivity, '2026-09-12T11:00:00.000Z');
  assert.equal(result.find((project) => project.id === 'parent').latestActivity, '2026-09-10T11:00:00.000Z');
  assert.equal(result.find((project) => project.id === 'empty').latestActivity, null);
});

test('sortProjectsByRecentActivity resolves task-linked work and ignores deleted or open records', () => {
  const projects = [
    { id: 'alpha', name: 'Alpha', parentId: null },
    { id: 'beta', name: 'Beta', parentId: null },
  ];
  const tasks = [{ id: 'task-beta', projectId: 'beta' }];
  const entries = [
    { id: 'task-entry', taskId: 'task-beta', startedAt: '2026-09-10T12:00:00.000Z', endedAt: '2026-09-10T13:00:00.000Z' },
    { id: 'open', projectId: 'alpha', startedAt: '2026-09-11T12:00:00.000Z' },
    { id: 'deleted', projectId: 'alpha', startedAt: '2026-09-12T12:00:00.000Z', endedAt: '2026-09-12T13:00:00.000Z', deletedAt: '2026-09-12T13:01:00.000Z' },
  ];

  const result = sortProjectsByRecentActivity(projects, entries, tasks);

  assert.deepEqual(result.map((project) => project.id), ['beta', 'alpha']);
  assert.equal(result.find((project) => project.id === 'alpha').latestActivity, null);
});
