export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis' | 'code'; inlines: Inline[] | string }
  | { type: 'link'; url: string; inlines: Inline[] };

export type TaskItem = { checked: boolean; inlines: Inline[]; children: Block[] };
export type ListItem = { inlines: Inline[]; children: Block[] };
export type TableAlignment = 'left' | 'center' | 'right';
export type Block =
  | { type: 'paragraph' | 'heading'; inlines: Inline[]; level?: number }
  | { type: 'quote' | 'codeBlock'; blocks?: Block[]; value?: string; language?: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'taskList'; items: TaskItem[] }
  | { type: 'table'; header: Inline[][]; alignments: TableAlignment[]; rows: Inline[][][] }
  | { type: 'horizontalRule' };
export type MarkdownEditorMode = 'edit' | 'preview';

export function cloneBlocks(blocks: Block[]): Block[];
export function pathToItem(blocks: Block[], path: number[]): TaskItem;
export function updateAtPath(blocks: Block[], path: number[], updater: (item: TaskItem) => TaskItem): Block[];
export function parseMarkdown(markdown: string): Block[];
export function serializeMarkdown(blocks: Block[]): string;
export function renderMarkdown(markdown: string, options?: { interactiveTasks?: boolean }): string;
export function renderBlocks(blocks: Block[], options?: { interactiveTasks?: boolean }): string;
