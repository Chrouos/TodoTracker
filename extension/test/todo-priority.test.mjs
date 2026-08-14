import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TODO_PRIORITIES,
  filterTasks,
  normalizePriority,
  priorityLabel,
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

const tasks = [
  { id: 'urgent-a', projectId: 'project-a', status: 'todo', priority: 'urgent' },
  { id: 'normal-a', projectId: 'project-a', status: 'todo' },
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
const { listTasks, upsertTask } = await import('../src/lib/db.js');
const created = await upsertTask({ id: 'priority-default', title: 'Default priority' });
assert.equal(created.priority, 'normal');

taskStorage.tasks = [{ id: 'legacy-task', title: 'Legacy task', status: 'todo' }];
const updatedLegacy = await upsertTask({ ...taskStorage.tasks[0], status: 'doing' });
assert.equal(updatedLegacy.priority, 'normal');
assert.equal((await listTasks())[0].priority, 'normal');

console.log('todo priority contract passed');
