export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis' | 'code'; inlines: Inline[] | string }
  | { type: 'link'; url: string; inlines: Inline[] };

export type TaskItem = { checked: boolean; inlines: Inline[]; children: Block[] };
export type ListItem = { inlines: Inline[]; children: Block[] };
export type Block =
  | { type: 'paragraph' | 'heading'; inlines: Inline[]; level?: number }
  | { type: 'quote' | 'codeBlock'; blocks?: Block[]; value?: string; language?: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'taskList'; items: TaskItem[] };
export type MarkdownEditorMode = 'edit' | 'preview';

export function cloneBlocks(blocks: Block[]): Block[];
export function pathToItem(blocks: Block[], path: number[]): TaskItem;
export function updateAtPath(blocks: Block[], path: number[], updater: (item: TaskItem) => TaskItem): Block[];
