import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TODO_STATUSES,
  TODO_PRIORITIES,
  filterTasks,
  normalizePriority,
  normalizeStatus,
  priorityLabel,
  statusLabel,
  taskCountLabel,
} from '../src/lib/todo-filter.js';

assert.deepEqual(
  TODO_PRIORITIES,
  [
    { value: 'urgent', label: '緊急' },
    { value: 'high', label: '高' },
    { value: 'normal', label: '一般' },
    { value: 'low', label: '低' },
  ],
);

assert.equal(normalizePriority(undefined), 'normal');
assert.equal(normalizePriority('urgent'), 'urgent');
assert.equal(normalizePriority('not-a-priority'), 'normal');
assert.equal(priorityLabel('high'), '高');
assert.equal(priorityLabel('not-a-priority'), '一般');
assert.deepEqual(TODO_STATUSES.map(({ value }) => value), ['active', 'doing', 'todo', 'done', 'all']);
assert.equal(normalizeStatus('doing'), 'doing');
assert.equal(normalizeStatus('not-a-status'), 'active');
assert.equal(statusLabel('doing'), '進行中');

const tasks = [
  { id: 'urgent-a', projectId: 'project-a', status: 'todo', priority: 'urgent' },
  { id: 'normal-a', projectId: 'project-a', status: 'todo' },
  { id: 'doing-a', projectId: 'project-a', status: 'doing', priority: 'low' },
  { id: 'done-high', projectId: 'project-a', status: 'done', priority: 'high' },
  { id: 'low-b', projectId: 'project-b', status: 'todo', priority: 'low' },
  { id: 'archived', projectId: 'project-a', status: 'archived', priority: 'urgent' },
];

assert.deepEqual(
  filterTasks(tasks, { projectScope: new Set(['project-a']), priority: 'urgent', showDone: false })
    .map((task) => task.id),
  ['urgent-a'],
);
assert.deepEqual(
  filterTasks(tasks, { projectScope: new Set(['project-a']), priority: 'normal', showDone: false })
    .map((task) => task.id),
  ['normal-a'],
);
assert.deepEqual(
  filterTasks(tasks, { projectScope: null, priority: 'high', showDone: true })
    .map((task) => task.id),
  ['done-high'],
);
assert.deepEqual(
  filterTasks(tasks, { status: 'doing' }).map((task) => task.id),
  ['doing-a'],
);
assert.deepEqual(
  filterTasks(tasks, { status: 'todo' }).map((task) => task.id),
  ['urgent-a', 'normal-a', 'low-b'],
);
assert.deepEqual(
  filterTasks(tasks, { status: 'done' }).map((task) => task.id),
  ['done-high'],
);

assert.equal(taskCountLabel([{ status: 'todo' }, { status: 'doing' }], false), '共 2 個未完成');
assert.equal(
  taskCountLabel([
    { status: 'todo' },
    { status: 'done' },
    { status: 'doing' },
  ], true),
  '2 個未完成／共 3 個',
);

const popupHtml = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
const popup = await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8');
assert.match(popupHtml, /id="todoPriorityFilter"/, 'popup Todo should have a priority filter');
assert.match(popup, /filterTasks/, 'popup Todo should apply the priority filter');
assert.match(popup, /priorityLabel/, 'popup Todo should render priority');

const taskStorage = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) { return { [key]: taskStorage[key] }; },
      async set(patch) { Object.assign(taskStorage, patch); },
    },
  },
};
const {
  listTasks, upsertEntry, upsertTask, listSchedules, upsertSchedule, runDueSchedules,
} = await import('../src/lib/db.js');
const created = await upsertTask({ id: 'priority-default', title: 'Default priority' });
assert.equal(created.priority, 'normal');

taskStorage.tasks = [{ id: 'legacy-task', title: 'Legacy task', status: 'todo' }];
const updatedLegacy = await upsertTask({ ...taskStorage.tasks[0], status: 'doing' });
assert.equal(updatedLegacy.priority, 'normal');
assert.equal((await listTasks())[0].priority, 'normal');

const schedule = await upsertSchedule({
  id: 'schedule-priority', title: '優先排程', weekdays: [1], createTime: '09:00', priority: 'high',
});
assert.equal(schedule.priority, 'high');
assert.equal((await listSchedules())[0].priority, 'high');
const generated = await runDueSchedules(new Date('2026-08-10T09:01:00'));
assert.equal(generated[0].priority, 'high');
assert.equal((await listTasks()).find((task) => task.scheduleId === 'schedule-priority').priority, 'high');

taskStorage.tasks = [
  { id: 'task-with-history', title: 'Has history', status: 'todo' },
  { id: 'task-deleted-history', title: 'Deleted history', status: 'todo' },
  { id: 'task-done-history', title: 'Done history', status: 'done' },
  { id: 'task-archived-history', title: 'Archived history', status: 'archived' },
];
taskStorage.entries = [
  { id: 'entry-history', taskId: 'task-with-history', startedAt: '2026-08-19T09:00:00.000Z' },
  { id: 'entry-deleted-history', taskId: 'task-deleted-history', deletedAt: '2026-08-19T10:00:00.000Z' },
  { id: 'entry-done-history', taskId: 'task-done-history' },
  { id: 'entry-archived-history', taskId: 'task-archived-history' },
];
assert.equal((await listTasks()).find((task) => task.id === 'task-with-history').status, 'doing');
assert.equal((await listTasks()).find((task) => task.id === 'task-deleted-history').status, 'todo');
assert.equal((await listTasks()).find((task) => task.id === 'task-done-history').status, 'done');
assert.equal((await listTasks()).find((task) => task.id === 'task-archived-history').status, 'archived');

taskStorage.tasks = [{ id: 'task-new-history', title: 'New history', status: 'todo' }];
taskStorage.entries = [];
await upsertEntry({
  id: 'entry-new-history',
  taskId: 'task-new-history',
  startedAt: '2026-08-19T11:00:00.000Z',
  endedAt: '2026-08-19T12:00:00.000Z',
});
assert.equal((await listTasks()).find((task) => task.id === 'task-new-history').status, 'doing');

const legacySchedule = await upsertSchedule({
  id: 'schedule-default', title: '預設排程', weekdays: [2], createTime: '09:00', priority: 'invalid',
});
assert.equal(legacySchedule.priority, 'normal');

console.log('todo priority contract passed');
