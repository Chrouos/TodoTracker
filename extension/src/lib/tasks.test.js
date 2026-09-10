import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTodoTasks, completedTodosOnDate, dueTodoAlerts, entriesForTask, flattenTodoTree, promoteTodoTasksWithEntries, todoHealth,
} from './tasks.js';

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

test('sorts todos by priority, then latest update, then existing fallbacks', () => {
  const tasks = [
    { id: 'high-new', priority: 'high', updatedAt: '2026-08-20T10:00:00.000Z', dueDate: '2026-08-30', sortOrder: 4 },
    { id: 'urgent-old', priority: 'urgent', updatedAt: '2026-08-01T10:00:00.000Z', dueDate: '2026-08-30', sortOrder: 3 },
    { id: 'high-old', priority: 'high', updatedAt: '2026-08-10T10:00:00.000Z', dueDate: '2026-08-01', sortOrder: 2 },
    { id: 'normal-due-later', priority: 'normal', updatedAt: null, dueDate: '2026-08-20', sortOrder: 1 },
    { id: 'normal-due-sooner', priority: 'normal', updatedAt: null, dueDate: '2026-08-15', sortOrder: 5 },
  ];

  assert.deepEqual(tasks.sort(compareTodoTasks).map((task) => task.id), [
    'urgent-old',
    'high-new',
    'high-old',
    'normal-due-sooner',
    'normal-due-later',
  ]);
});

test('treats unknown priority as normal and uses sort order as the final fallback', () => {
  const tasks = [
    { id: 'legacy-new', priority: 'legacy', updatedAt: '2026-08-20T10:00:00.000Z', dueDate: null, sortOrder: 2 },
    { id: 'high-old', priority: 'high', updatedAt: '2026-08-01T10:00:00.000Z', dueDate: null, sortOrder: 3 },
    { id: 'normal-second', priority: 'normal', updatedAt: null, dueDate: null, sortOrder: 5 },
    { id: 'normal-first', priority: 'normal', updatedAt: null, dueDate: null, sortOrder: 1 },
  ];

  assert.deepEqual(tasks.sort(compareTodoTasks).map((task) => task.id), [
    'high-old',
    'legacy-new',
    'normal-first',
    'normal-second',
  ]);
});

test('preserves original Todo depth when a filtered parent is hidden', () => {
  const allRows = flattenTodoTree([
    { id: 'parent', parentId: null, priority: 'normal', updatedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'child', parentId: 'parent', priority: 'urgent', updatedAt: '2026-08-02T10:00:00.000Z' },
    { id: 'root', parentId: null, priority: 'high', updatedAt: '2026-08-03T10:00:00.000Z' },
  ]);

  assert.deepEqual(
    allRows.filter((task) => task.id !== 'parent').map((task) => [task.id, task.depth]),
    [['root', 0], ['child', 1]],
  );
});

test('sorts orphan Todos as roots and preserves their child depth', () => {
  const rows = flattenTodoTree([
    { id: 'low-orphan', parentId: 'deleted-low-parent', priority: 'low', updatedAt: '2026-08-03T10:00:00.000Z' },
    { id: 'urgent-orphan', parentId: 'deleted-urgent-parent', priority: 'urgent', updatedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'orphan-child', parentId: 'urgent-orphan', priority: 'normal', updatedAt: '2026-08-02T10:00:00.000Z' },
  ]);

  assert.deepEqual(rows.map((task) => [task.id, task.depth]), [
    ['urgent-orphan', 0],
    ['orphan-child', 1],
    ['low-orphan', 0],
  ]);
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

test('dueTodoAlerts keeps unfinished due todos visible even without notes or work records', () => {
  const alerts = dueTodoAlerts([
    { id: 'empty', title: '', notes: '', status: 'todo', dueDate: '2026-09-10' },
    { id: 'done', title: 'Done', status: 'done', dueDate: '2026-09-10' },
    { id: 'archived', title: 'Archived', status: 'archived', dueDate: '2026-09-10' },
    { id: 'none', title: 'No due date', status: 'todo', dueDate: null },
  ], '2026-09-10');

  assert.deepEqual(alerts.map((item) => [item.id, item.dueDelta, item.alertKind]), [
    ['empty', 0, 'today'],
  ]);
});

test('dueTodoAlerts prioritizes overdue and nearest upcoming deadlines, then due time and priority', () => {
  const alerts = dueTodoAlerts([
    { id: 'old-overdue', status: 'todo', dueDate: '2026-09-01', dueTime: '09:00', priority: 'urgent' },
    { id: 'near-overdue', status: 'doing', dueDate: '2026-09-09', dueTime: '18:00', priority: 'low' },
    { id: 'today-late', status: 'todo', dueDate: '2026-09-10', dueTime: '18:00', priority: 'normal' },
    { id: 'today-soon', status: 'todo', dueDate: '2026-09-10', dueTime: '09:00', priority: 'low' },
    { id: 'tomorrow', status: 'todo', dueDate: '2026-09-11', dueTime: '09:00', priority: 'normal' },
    { id: 'later', status: 'todo', dueDate: '2026-09-20', dueTime: '09:00', priority: 'urgent' },
  ], '2026-09-10', 99);

  assert.deepEqual(alerts.map((item) => item.id), ['near-overdue', 'old-overdue', 'today-soon', 'today-late', 'tomorrow']);
  assert.deepEqual(alerts.map((item) => item.alertKind), ['overdue', 'overdue', 'today', 'today', 'upcoming']);
  assert.equal(alerts.some((item) => item.id === 'later'), false);
});

test('completedTodosOnDate returns done todos completed on the local date, newest first', () => {
  const result = completedTodosOnDate([
    { id: 'old', status: 'done', completedAt: '2026-09-10T09:00:00.000Z' },
    { id: 'new', status: 'done', completedAt: '2026-09-10T15:00:00.000Z' },
    { id: 'open', status: 'doing', completedAt: '2026-09-10T16:00:00.000Z' },
    { id: 'archived', status: 'archived', completedAt: '2026-09-10T17:00:00.000Z' },
    { id: 'other-day', status: 'done', completedAt: '2026-09-11T09:00:00.000Z' },
    { id: 'missing-date', status: 'done' },
  ], '2026-09-10');

  assert.deepEqual(result.map((task) => task.id), ['new', 'old']);
});
