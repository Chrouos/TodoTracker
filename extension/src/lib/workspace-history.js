export function groupCompletedTasks(tasks) {
  const groups = new Map();
  for (const task of [...tasks].sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))) {
    const date = task.completedAt ? new Date(task.completedAt) : null;
    const month = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(task);
  }
  return [...groups].map(([month, items]) => ({ month, tasks: items }));
}
