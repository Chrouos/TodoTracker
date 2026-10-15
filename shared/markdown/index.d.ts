export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis' | 'code'; inlines: Inline[] | string }
  | { type: 'link'; url: string; inlines: Inline[] };

export type TaskItem = { checked: boolean; inlines: Inline[]; children: Block[] };
export type ListItem = { inlines: Inline[]; children: Block[] };
export type TableAlignment = 'left' | 'center' | 'right';
/** Numeric AST path: top-level block, list item indexes, and quote block indexes. */
export type TaskPath = number[];
export type EditorPoint = { path: TaskPath; offset: number };
export type EditorSelection = { anchor: EditorPoint; focus: EditorPoint };
export type Block =
  | { type: 'paragraph' | 'heading'; inlines: Inline[]; level?: number }
  | { type: 'quote' | 'codeBlock'; blocks?: Block[]; value?: string; language?: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'taskList'; items: TaskItem[] }
  | { type: 'table'; header: Inline[][]; alignments: TableAlignment[]; rows: Inline[][][] }
  | { type: 'horizontalRule' };
export type MarkdownEditorMode = 'edit' | 'preview';
export type ActiveBlockReplacement = { blocks: Block[]; valid: boolean; nextPath: TaskPath };
export type InlineSourceCommand = 'bold' | 'italic' | 'inline-code' | 'link';
export type BlockSourceCommand =
  | 'heading'
  | 'unordered-list'
  | 'ordered-list'
  | 'task'
  | 'quote'
  | 'code-block'
  | 'table'
  | 'rule';
export type SourceToggleResult = { source: string; selectionStart: number; selectionEnd: number };
export type SourceCommand = InlineSourceCommand | BlockSourceCommand | 'paragraph';
export type ToolbarState = {
  bold: boolean;
  italic: boolean;
  inlineCode: boolean;
  link: boolean;
  heading: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  task: boolean;
  quote: boolean;
  codeBlock: boolean;
  table: boolean;
  rule: boolean;
};
export type Shortcut =
  | { type: 'heading'; level: number }
  | { type: 'task'; checked: boolean }
  | { type: 'list'; ordered: boolean };

export function cloneBlocks(blocks: Block[]): Block[];
export function pathToItem(blocks: Block[], path: TaskPath): TaskItem;
export function updateAtPath(blocks: Block[], path: TaskPath, updater: (item: TaskItem) => TaskItem): Block[];
export function parseMarkdown(markdown: string): Block[];
export function serializeMarkdown(blocks: Block[]): string;
export function renderMarkdown(markdown: string, options?: { interactiveTasks?: boolean }): string;
export function renderBlocks(blocks: Block[], options?: { interactiveTasks?: boolean }): string;
export function readActiveBlockSource(blocks: Block[], path: TaskPath): string | null;
export function replaceActiveBlockSource(blocks: Block[], path: TaskPath, source: string): ActiveBlockReplacement;
export function serializeWithActiveBlockSource(blocks: Block[], path: TaskPath, source: string): string;
export function toggleInlineSource(source: string, start: number, end: number, command: InlineSourceCommand, url?: string): SourceToggleResult;
export function formatSourceSelection(source: string, start: number, end: number, command: SourceCommand): SourceToggleResult;
export function toggleTaskSource(source: string, path: TaskPath): string;
export function toggleBlockSource(source: string, command: BlockSourceCommand): SourceToggleResult;
export function activeToolbarState(source: string, start: number, end: number): ToolbarState;
export function detectMarkdownShortcut(text: string): Shortcut | null;
export function continueBlock(blocks: Block[], path: TaskPath): Block[];
export function exitEmptyBlock(blocks: Block[], path: TaskPath): Block[];
export function indentListItem(blocks: Block[], path: TaskPath, direction: 'in' | 'out'): Block[];
export function toggleTaskItem(blocks: Block[], path: TaskPath): Block[];
export function replaceEditorSelection(blocks: Block[], selection: EditorSelection, pastedMarkdown: string): { blocks: Block[]; nextSelection: EditorSelection };
export function splitBlockAtSelection(blocks: Block[], selection: EditorSelection): { blocks: Block[]; nextSelection: EditorSelection };
export function deleteBackwardAtSelection(blocks: Block[], selection: EditorSelection): { blocks: Block[]; nextSelection: EditorSelection; changed: boolean };
export function deleteForwardAtSelection(blocks: Block[], selection: EditorSelection): { blocks: Block[]; nextSelection: EditorSelection; changed: boolean };
export function ensureParagraphAfterBlock(blocks: Block[], path: TaskPath): { blocks: Block[]; nextPath: TaskPath };
export function removeTableBeforeParagraph(blocks: Block[], path: TaskPath): { blocks: Block[]; nextPath: TaskPath };
