export const TODO_PRIORITIES = Object.freeze([
  Object.freeze({ value: 'urgent', label: '緊急' }),
  Object.freeze({ value: 'high', label: '高' }),
  Object.freeze({ value: 'normal', label: '一般' }),
  Object.freeze({ value: 'low', label: '低' }),
]);

export const TODO_STATUSES = Object.freeze([
  Object.freeze({ value: 'active', label: '未完成' }),
  Object.freeze({ value: 'doing', label: '進行中' }),
  Object.freeze({ value: 'todo', label: '待辦' }),
  Object.freeze({ value: 'done', label: '已完成' }),
  Object.freeze({ value: 'all', label: '全部' }),
]);

import { translate } from './i18n.js';

const PRIORITY_VALUES = new Set(TODO_PRIORITIES.map(({ value }) => value));
const STATUS_VALUES = new Set(TODO_STATUSES.map(({ value }) => value));

export function normalizePriority(priority) {
  return PRIORITY_VALUES.has(priority) ? priority : 'normal';
}

export function priorityLabel(priority, locale = 'zh-TW') {
  return translate(locale, `todo.priority.${normalizePriority(priority)}`);
}

export function normalizeStatus(status) {
  return STATUS_VALUES.has(status) ? status : 'active';
}

export function statusLabel(status, locale = 'zh-TW') {
  return translate(locale, `todo.status.${normalizeStatus(status)}`);
}

export function filterTasks(
  tasks,
  { projectScope = null, priority = '', status = '', showDone = false } = {},
) {
  const selectedStatus = status ? normalizeStatus(status) : (showDone ? 'all' : 'active');
  return tasks.filter((task) =>
    task.status !== 'archived'
      && (selectedStatus === 'all'
        || (selectedStatus === 'active' && task.status !== 'done')
        || task.status === selectedStatus)
      && (!projectScope || projectScope.has(task.projectId))
      && (!priority || normalizePriority(task.priority) === priority)
  );
}

export function taskCountLabel(tasks, showDone, status = '', locale = 'zh-TW') {
  if (status === 'doing') return translate(locale, 'todo.count.doing', { count: tasks.length });
  if (status === 'todo') return translate(locale, 'todo.count.todo', { count: tasks.length });
  if (status === 'done') return translate(locale, 'todo.count.done', { count: tasks.length });
  const open = tasks.filter((task) => task.status !== 'done').length;
  return showDone
    ? translate(locale, 'todo.count.openAndTotal', { open, total: tasks.length })
    : translate(locale, 'todo.count.open', { count: open });
}
