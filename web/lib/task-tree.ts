import type { Task } from '@/lib/types';

export type TaskTreeItem = Task & { depth: number };

function compareTasks(a: Task, b: Task) {
  return Number(a.status === 'done') - Number(b.status === 'done')
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
    || a.sortOrder - b.sortOrder;
}

export function descendantTaskIds(tasks: Task[], id: string): Set<string> {
  const descendants = new Set<string>();
  const visit = (parentId: string) => {
    tasks.filter((task) => task.parentTaskId === parentId).forEach((task) => {
      if (descendants.has(task.id)) return;
      descendants.add(task.id);
      visit(task.id);
    });
  };
  visit(id);
  return descendants;
}

export function flattenTaskTree(tasks: Task[]): TaskTreeItem[] {
  const children = new Map<string | null, Task[]>();
  tasks.forEach((task) => {
    const parentId = task.parentTaskId ?? null;
    const group = children.get(parentId) ?? [];
    group.push(task);
    children.set(parentId, group);
  });

  const output: TaskTreeItem[] = [];
  const visit = (parentId: string | null, depth: number, path: Set<string>) => {
    for (const task of [...(children.get(parentId) ?? [])].sort(compareTasks)) {
      if (path.has(task.id)) continue;
      output.push({ ...task, depth });
      const nextPath = new Set(path).add(task.id);
      visit(task.id, depth + 1, nextPath);
    }
  };
  visit(null, 0, new Set());

  // 舊資料若有不存在的父任務，仍要顯示，不讓任務消失。
  const visible = new Set(output.map((task) => task.id));
  tasks.filter((task) => !visible.has(task.id)).sort(compareTasks)
    .forEach((task) => output.push({ ...task, depth: 0 }));
  return output;
}
