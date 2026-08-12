/** 跟 extension/src/lib/db.js 的欄位一對一對應 */

export type Project = {
  id: string;
  /** 上層專案；null = 最上層。可以一直往下掛 */
  parentId: string | null;
  name: string;
  color: string;
  archivedAt: string | null;
  createdAt: string;
};

export type Tag = { id: string; name: string; color: string };

export type TaskStatus = 'todo' | 'doing' | 'done' | 'archived';

export type Task = {
  id: string;
  projectId: string | null;
  parentTaskId: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  /** 開單時間戳，建立當下決定，不可改 */
  openedAt: string | null;
  /** 截止日 YYYY-MM-DD，唯一可以手改的日期 */
  dueDate: string | null;
  reminderAt: string | null;
  /** 結案時間戳，按下完成的當下；重新打開就清掉 */
  completedAt: string | null;
  /** 被重新打開過幾次 */
  reopenCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Entry = {
  id: string;
  clientEntryId: string;
  projectId: string | null;
  taskId: string | null;
  description: string;
  /** 工作紀錄：做完之後補寫的內容 */
  notes: string;
  tagIds: string[];
  startedAt: string;
  endedAt: string | null;
  source: 'extension' | 'web' | 'import' | 'manual';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  synced?: boolean;
};

export type Timer = {
  entryId: string;
  clientEntryId: string;
  startedAt: string;
  projectId: string | null;
  taskId: string | null;
  description: string;
  /** 計時中隨手寫的內容，停止時會落地到 entry.notes */
  notes: string;
  tagIds: string[];
  idleSince: string | null;
} | null;

export type Settings = {
  idleThresholdMin: number;
  weekStartsOn: number;
  roundToMin: number;
};

export type Snapshot = {
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
  entries: Entry[];
  settings: Settings;
  timer: Timer;
};

export const EMPTY_SNAPSHOT: Snapshot = {
  projects: [], tags: [], tasks: [], entries: [],
  settings: { idleThresholdMin: 15, weekStartsOn: 1, roundToMin: 0 },
  timer: null,
};
