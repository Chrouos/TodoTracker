export const TODO_PRIORITIES = Object.freeze([
  Object.freeze({ value: 'urgent', label: '緊急' }),
  Object.freeze({ value: 'high', label: '高' }),
  Object.freeze({ value: 'normal', label: '一般' }),
  Object.freeze({ value: 'low', label: '低' }),
]);

const PRIORITY_VALUES = new Set(TODO_PRIORITIES.map(({ value }) => value));

export function normalizePriority(priority) {
  return PRIORITY_VALUES.has(priority) ? priority : 'normal';
}

export function priorityLabel(priority) {
  return TODO_PRIORITIES.find(({ value }) => value === normalizePriority(priority)).label;
}

export function filterTasks(
  tasks,
  { projectScope = null, priority = '', showDone = false } = {},
) {
  return tasks.filter((task) =>
    task.status !== 'archived'
      && (showDone || task.status !== 'done')
      && (!projectScope || projectScope.has(task.projectId))
      && (!priority || normalizePriority(task.priority) === priority)
  );
}

export function taskCountLabel(tasks, showDone) {
  const open = tasks.filter((task) => task.status !== 'done').length;
  return showDone ? `${open} 個未完成／共 ${tasks.length} 個` : `共 ${open} 個未完成`;
}
