import type { Task } from './types';

export function projectIdForTask(
  taskId: string,
  tasks: ReadonlyArray<Pick<Task, 'id' | 'projectId'>>,
  currentProjectId: string,
): string {
  const task = tasks.find((item) => item.id === taskId);
  return task ? task.projectId ?? '' : currentProjectId;
}
