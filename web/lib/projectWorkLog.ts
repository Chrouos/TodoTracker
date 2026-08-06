import { descendantIds } from './tree';
import type { Entry, Project, Task } from './types';

export function collectProjectWorkLog(projectId: string, projects: Project[], tasks: Task[], entries: Entry[]) {
  const projectIds = new Set([projectId, ...descendantIds(projects, projectId)]);
  const projectTasks = tasks.filter((task) => task.projectId !== null && projectIds.has(task.projectId));
  const taskIds = new Set(projectTasks.map((task) => task.id));
  const projectEntries = entries.filter((entry) =>
    !entry.deletedAt && ((entry.projectId !== null && projectIds.has(entry.projectId)) || (entry.taskId !== null && taskIds.has(entry.taskId))),
  );
  return { tasks: projectTasks, entries: projectEntries };
}
