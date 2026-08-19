import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesForTask, promoteTodoTasksWithEntries, todoHealth } from './tasks.js';

test('returns completed work records for a todo, newest first', () => {
  const result = entriesForTask(
    { id: 'task-1' },
    [
      { id: 'old', taskId: 'task-1', startedAt: '2026-08-01T09:00:00.000Z', endedAt: '2026-08-01T10:00:00.000Z' },
      { id: 'deleted', taskId: 'task-1', startedAt: '2026-08-03T09:00:00.000Z', endedAt: '2026-08-03T10:00:00.000Z', deletedAt: '2026-08-03T10:00:00.000Z' },
      { id: 'new', taskId: 'task-1', startedAt: '2026-08-05T09:00:00.000Z', endedAt: '2026-08-05T10:00:00.000Z' },
      { id: 'other', taskId: 'task-2', startedAt: '2026-08-06T09:00:00.000Z', endedAt: '2026-08-06T10:00:00.000Z' },
    ],
  );

  assert.deepEqual(result.map((entry) => entry.id), ['new', 'old']);
});

test('todoHealth counts active, completed, and overdue todos', () => {
  const result = todoHealth([
    { status: 'done', dueDate: '2026-08-10' },
    { status: 'doing', dueDate: '2026-08-12' },
    { status: 'todo', dueDate: '2026-08-01' },
    { status: 'todo', dueDate: '2026-08-20' },
    { status: 'archived', dueDate: '2026-08-01' },
  ], '2026-08-12');

  assert.deepEqual(result, {
    total: 4,
    done: 1,
    completionRate: 0.25,
    active: 1,
    overdue: 1,
  });
});

test('promotes todo tasks with non-deleted work records to doing', () => {
  const result = promoteTodoTasksWithEntries([
    { id: 'worked', status: 'todo' },
    { id: 'already-doing', status: 'doing' },
    { id: 'done', status: 'done' },
    { id: 'archived', status: 'archived' },
    { id: 'deleted-only', status: 'todo' },
  ], [
    { id: 'work-1', taskId: 'worked' },
    { id: 'work-2', taskId: 'done' },
    { id: 'work-3', taskId: 'already-doing' },
    { id: 'work-4', taskId: 'archived' },
    { id: 'work-5', taskId: 'deleted-only', deletedAt: '2026-08-19T10:00:00.000Z' },
  ]);

  assert.deepEqual(result.map((task) => [task.id, task.status]), [
    ['worked', 'doing'],
    ['already-doing', 'doing'],
    ['done', 'done'],
    ['archived', 'archived'],
    ['deleted-only', 'todo'],
  ]);
});

test('todoHealth handles empty todos without division by zero', () => {
  assert.deepEqual(todoHealth([], '2026-08-12'), {
    total: 0,
    done: 0,
    completionRate: 0,
    active: 0,
    overdue: 0,
  });
});
