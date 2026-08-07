/** 跟 extension/src/lib/db.js 的欄位一對一對應 */

/** 專案目標／筆記的一則，append 進來時記時間戳，之後可以修改 */
export type ProjectNote = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string | null;
};

export type Project = {
  id: string;
  /** 上層專案；null = 最上層。可以一直往下掛 */
  parentId: string | null;
  name: string;
  notes?: string;
  color: string;
  /** 目標／筆記時間軸，舊的在前 */
  notes: ProjectNote[];
  archivedAt: string | null;
  createdAt: string;
};

export type NoteTarget = { kind: 'project' | 'task' | 'entry'; id: string };
export type NoteAttachment = {
  id: string;
  target: NoteTarget;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
  createdAt: string;
};
export type NoteShare = { id: string; token: string; target: NoteTarget; revokedAt: string | null };

export type Tag = { id: string; name: string; color: string };

export type TaskStatus = 'todo' | 'doing' | 'done' | 'archived';

export type Task = {
  id: string;
  projectId: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  /** 開單時間戳，建立當下決定，不可改 */
  openedAt: string | null;
  /** 截止日 YYYY-MM-DD，唯一可以手改的日期 */
  dueDate: string | null;
  /** 截止時間 HH:MM，排程產生的才會有 */
  dueTime: string | null;
  /** 由哪一條排程產生的 */
  scheduleId: string | null;
  remindedAt?: string | null;
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

/** 週期排程：到點自動開一張 Todo。weekdays 用 0=週日 … 6=週六 */
export type Schedule = {
  id: string;
  title: string;
  projectId: string | null;
  notes: string;
  weekdays: number[];
  /** 幾點自動開單 HH:MM */
  createTime: string;
  /** 當天幾點截止 HH:MM */
  dueTime: string | null;
  /** 截止前幾分鐘提醒 */
  remindMinutes: number | null;
  enabled: boolean;
  lastRunDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Snapshot = {
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
  entries: Entry[];
  schedules: Schedule[];
  settings: Settings;
  timer: Timer;
};

export const EMPTY_SNAPSHOT: Snapshot = {
  projects: [], tags: [], tasks: [], entries: [], schedules: [],
  settings: { idleThresholdMin: 15, weekStartsOn: 1, roundToMin: 0 },
  timer: null,
};
