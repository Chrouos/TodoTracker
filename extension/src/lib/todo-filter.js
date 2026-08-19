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

const PRIORITY_VALUES = new Set(TODO_PRIORITIES.map(({ value }) => value));
const STATUS_VALUES = new Set(TODO_STATUSES.map(({ value }) => value));

export function normalizePriority(priority) {
  return PRIORITY_VALUES.has(priority) ? priority : 'normal';
}

export function priorityLabel(priority) {
  return TODO_PRIORITIES.find(({ value }) => value === normalizePriority(priority)).label;
}

export function normalizeStatus(status) {
  return STATUS_VALUES.has(status) ? status : 'active';
}

export function statusLabel(status) {
  return TODO_STATUSES.find(({ value }) => value === normalizeStatus(status)).label;
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

export function taskCountLabel(tasks, showDone, status = '') {
  if (status === 'doing') return `共 ${tasks.length} 個進行中`;
  if (status === 'todo') return `共 ${tasks.length} 個待辦`;
  if (status === 'done') return `共 ${tasks.length} 個已完成`;
  const open = tasks.filter((task) => task.status !== 'done').length;
  return showDone ? `${open} 個未完成／共 ${tasks.length} 個` : `共 ${open} 個未完成`;
}
