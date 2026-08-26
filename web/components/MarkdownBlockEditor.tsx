'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  cloneBlocks,
  applyEditorCheckboxChange,
  deleteBackwardAtSelection,
  deleteForwardAtSelection,
  detectMarkdownShortcut,
  ensureParagraphAfterBlock,
  exitEmptyBlock,
  indentListItem,
  parseMarkdown,
  removeTableBeforeParagraph,
  replaceEditorSelectionWithFallback,
  serializeMarkdown,
  shouldPreventEditorDefault,
  splitListItemAtSelection,
  splitBlockAtSelection,
  syncEditorValue,
  type Block,
  type EditorPoint,
  type EditorSelection,
  type Inline,
} from '@/lib/markdown';
import {
  blockPathForNode,
  readEditableBlocks,
  readEditorSelection,
  renderEditableBlocks,
  restoreEditorSelection,
} from '@/lib/markdown-dom';
import {
  applyInlineCommand,
  inlineText,
  insertInlineTextAtRange,
  listItemPathAfterIndent,
  type InlineCommand,
} from '@/lib/markdown-editor';

export type MarkdownBlockEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  mode?: 'blocks' | 'source';
  onTaskToggle?: (value: string) => void;
};

export type MarkdownEditorHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  getValue: () => string;
  getSelectionContext: () => { value: string; offset: number };
};

type BlockLocation = {
  container: Block[];
  index: number;
  block: Block;
};

type InlineTarget = {
  element: HTMLElement;
  inlines: Inline[];
  kind: 'block' | 'listItem' | 'tableCell';
  path: number[];
  column?: number;
  row?: number;
  section?: 'header' | 'body';
};

type CommitOptions = {
  render?: boolean;
  selection?: EditorSelection;
};

const emptyParagraph = (): Block => ({ type: 'paragraph', inlines: [] });
const textInline = (value: string): Inline[] => value ? [{ type: 'text', value }] : [];
const selectionAt = (path: number[], offset: number): EditorSelection => ({
  anchor: { path: [...path], offset },
  focus: { path: [...path], offset },
});

function blocksFromValue(value: string): Block[] {
  const parsed = parseMarkdown(value);
  return parsed.length ? parsed : [emptyParagraph()];
}

function parsePath(value: string | undefined): number[] | null {
  if (!value || !/^\d+(?:\.\d+)*$/.test(value)) return null;
  return value.split('.').map(Number);
}

function samePath(first: number[], second: number[]): boolean {
  return first.length === second.length && first.every((part, index) => part === second[index]);
}

function isCollapsed(selection: EditorSelection): boolean {
  return samePath(selection.anchor.path, selection.focus.path)
    && selection.anchor.offset === selection.focus.offset;
}

function blockLocation(blocks: Block[], path: number[]): BlockLocation | null {
  const visit = (container: Block[], index: number, remaining: number[]): BlockLocation | null => {
    const block = container[index];
    if (!block) return null;
    if (!remaining.length) return { container, index, block };
    if (block.type === 'quote') return visit(block.blocks ?? [], remaining[0], remaining.slice(1));
    if (block.type === 'list' || block.type === 'taskList') {
      const item = block.items[remaining[0]];
      const childIndex = remaining[1];
      return item && childIndex !== undefined
        ? visit(item.children, childIndex, remaining.slice(2))
        : null;
    }
    return null;
  };
  return path.length ? visit(blocks, path[0], path.slice(1)) : null;
}

function updateBlockAtPath(blocks: Block[], path: number[], updater: (block: Block) => Block): Block[] {
  const next = cloneBlocks(blocks);
  const location = blockLocation(next, path);
  if (location) location.container[location.index] = updater(location.block);
  return next;
}

function listItemInlines(blocks: Block[], path: number[]): Inline[] | null {
  const visit = (block: Block | undefined, remaining: number[]): Inline[] | null => {
    if (!block || !remaining.length) return null;
    if (block.type === 'quote') return visit(block.blocks?.[remaining[0]], remaining.slice(1));
    if (block.type !== 'list' && block.type !== 'taskList') return null;
    const item = block.items[remaining[0]];
    if (!item) return null;
    if (remaining.length === 1) return item.inlines;
    return visit(item.children[remaining[1]], remaining.slice(2));
  };
  return visit(blocks[path[0]], path.slice(1));
}

function updateListItemInlines(blocks: Block[], path: number[], updater: (inlines: Inline[]) => Inline[]): Block[] {
  const next = cloneBlocks(blocks);
  const visit = (block: Block | undefined, remaining: number[]): boolean => {
    if (!block || !remaining.length) return false;
    if (block.type === 'quote') return visit(block.blocks?.[remaining[0]], remaining.slice(1));
    if (block.type !== 'list' && block.type !== 'taskList') return false;
    const item = block.items[remaining[0]];
    if (!item) return false;
    if (remaining.length === 1) {
      item.inlines = updater(item.inlines);
      return true;
    }
    return visit(item.children[remaining[1]], remaining.slice(2));
  };
  visit(next[path[0]], path.slice(1));
  return next;
}

function shortcutBlock(block: Block, value: string): Block | null {
  const shortcut = detectMarkdownShortcut(value) as
    | { type: 'heading'; level: number }
    | { type: 'task'; checked: boolean }
    | { type: 'list'; ordered: boolean }
    | { type: 'quote' }
    | { type: 'codeBlock' }
    | null;
  if (!shortcut || (block.type !== 'paragraph' && block.type !== 'heading')) return null;
  if (shortcut.type === 'heading') return { type: 'heading', level: shortcut.level, inlines: [] };
  if (shortcut.type === 'task') return { type: 'taskList', items: [{ checked: shortcut.checked, inlines: [], children: [] }] };
  if (shortcut.type === 'list') return { type: 'list', ordered: shortcut.ordered, items: [{ inlines: [], children: [] }] };
  if (shortcut.type === 'quote') return { type: 'quote', blocks: [emptyParagraph()] };
  return { type: 'codeBlock', value: '' };
}

function shortcutSelection(path: number[], block: Block): EditorSelection {
  if (block.type === 'list' || block.type === 'taskList' || block.type === 'quote') {
    return selectionAt([...path, 0], 0);
  }
  return selectionAt(path, 0);
}

function elementFromNode(root: HTMLElement, node: Node | null): HTMLElement | null {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node?.parentElement;
  const target = element?.closest<HTMLElement>('[data-block-path]') ?? null;
  return target && root.contains(target) ? target : null;
}

function selectedElement(root: HTMLElement): HTMLElement | null {
  const selection = root.ownerDocument.getSelection();
  return elementFromNode(root, selection?.focusNode ?? null);
}

function selectionOffsets(element: HTMLElement): { start: number; end: number } | null {
  const selection = element.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

function isInlineMark(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && ['STRONG', 'EM', 'CODE', 'A'].includes(node.tagName);
}

function isAtNodeEnd(node: Node, offset: number): boolean {
  return node.nodeType === Node.TEXT_NODE
    ? offset === (node.nodeValue ?? '').length
    : offset === node.childNodes.length;
}

function isSelectionAfterInlineMark(element: HTMLElement): boolean {
  const selection = element.ownerDocument.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !element.contains(range.startContainer) || !isAtNodeEnd(range.startContainer, range.startOffset)) return false;
  let node: Node | null = range.startContainer;
  if (node === element) return isInlineMark(element.childNodes[range.startOffset - 1] ?? null);
  if (isInlineMark(node)) return true;
  while (node && node !== element) {
    const parent: Node | null = node.parentNode;
    if (!parent || node.nextSibling) return false;
    if (isInlineMark(parent)) return true;
    node = parent;
  }
  return false;
}

function tableCellTarget(blocks: Block[], element: HTMLElement, path: number[]): InlineTarget | null {
  if (element.tagName !== 'TH' && element.tagName !== 'TD') return null;
  const table = blockLocation(blocks, path)?.block;
  if (table?.type !== 'table') return null;
  const rowElement = element.parentElement;
  const sectionElement = rowElement?.parentElement;
  const column = rowElement ? Array.from(rowElement.children).indexOf(element) : -1;
  const section = sectionElement?.tagName === 'THEAD' ? 'header' : sectionElement?.tagName === 'TBODY' ? 'body' : null;
  const row = section === 'body' && sectionElement && rowElement
    ? Array.from(sectionElement.children).indexOf(rowElement)
    : 0;
  const cells = section === 'header' ? table.header : section === 'body' ? table.rows[row] : null;
  if (!section || !cells || column < 0 || !cells[column]) return null;
  return { element, inlines: cells[column], kind: 'tableCell', path, column, row, section };
}

function inlineTarget(blocks: Block[], root: HTMLElement): InlineTarget | null {
  const element = selectedElement(root);
  const path = element ? parsePath(element.dataset.blockPath) : null;
  if (!element || !path) return null;
  if (element.tagName === 'LI') {
    const inlines = listItemInlines(blocks, path);
    return inlines ? { element, inlines, kind: 'listItem', path } : null;
  }
  const tableTarget = tableCellTarget(blocks, element, path);
  if (tableTarget) return tableTarget;
  const block = blockLocation(blocks, path)?.block;
  return block?.type === 'paragraph' || block?.type === 'heading'
    ? { element, inlines: block.inlines, kind: 'block', path }
    : null;
}

function updateInlineTarget(blocks: Block[], target: InlineTarget, updater: (inlines: Inline[]) => Inline[]): Block[] {
  if (target.kind === 'listItem') return updateListItemInlines(blocks, target.path, updater);
  if (target.kind === 'tableCell') {
    return updateBlockAtPath(blocks, target.path, (block) => {
      if (block.type !== 'table' || target.column === undefined || target.row === undefined || !target.section) return block;
      const cells = target.section === 'header' ? block.header : block.rows[target.row];
      if (cells?.[target.column]) cells[target.column] = updater(cells[target.column]);
      return block;
    });
  }
  return updateBlockAtPath(blocks, target.path, (block) => block.type === 'paragraph' || block.type === 'heading'
    ? { ...block, inlines: updater(block.inlines) }
    : block);
}

function textBlockPoint(blocks: Block[], point: EditorPoint): boolean {
  const block = blockLocation(blocks, point.path)?.block;
  return block?.type === 'paragraph' || block?.type === 'heading';
}

function rootWideSelection(root: HTMLElement, blocks: Block[]): EditorSelection | null {
  const browserSelection = root.ownerDocument.getSelection();
  if (!browserSelection?.rangeCount || blocks.length === 0) return null;
  const range = browserSelection.getRangeAt(0);
  const selectsRoot = range.startContainer === root
    && range.startOffset === 0
    && range.endContainer === root
    && range.endOffset === root.childNodes.length;
  const last = blocks.at(-1);
  if (!selectsRoot || !last) return null;
  return {
    anchor: { path: [0], offset: 0 },
    focus: { path: [blocks.length - 1], offset: last.type === 'paragraph' || last.type === 'heading' ? inlineText(last.inlines).length : 0 },
  };
}

function logicalSelection(root: HTMLElement, blocks: Block[]): EditorSelection | null {
  return readEditorSelection(root) ?? rootWideSelection(root, blocks);
}

function renderRoot(root: HTMLElement, blocks: Block[], selection?: EditorSelection): void {
  renderEditableBlocks(root, blocks);
  if (!selection) return;
  requestAnimationFrame(() => {
    root.focus();
    restoreEditorSelection(root, selection);
  });
}

const MarkdownBlockEditor = forwardRef<MarkdownEditorHandle, MarkdownBlockEditorProps>(function MarkdownBlockEditor({
  value,
  onChange,
  placeholder = '開始輸入 Markdown…',
  min,
  max,
  mode = 'blocks',
  onTaskToggle,
}, ref) {
  const [sourceValue, setSourceValue] = useState(value);
  const [editorMode, setEditorMode] = useState<'blocks' | 'source'>(mode);
  const editorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const blocksRef = useRef<Block[]>(blocksFromValue(value));
  const composingRef = useRef(false);
  const emittedValueRef = useRef(value);

  useEffect(() => {
    const root = editorRef.current;
    if (root) renderRoot(root, blocksRef.current);
  }, []);

  useEffect(() => {
    if (value !== emittedValueRef.current) {
      const root = editorRef.current;
      const previous = root ? logicalSelection(root, blocksRef.current) : null;
      const synced = syncEditorValue(value, previous);
      blocksRef.current = synced.blocks;
      emittedValueRef.current = value;
      setSourceValue(value);
      if (root) renderRoot(root, synced.blocks, synced.selection);
    }
  }, [value, sourceValue]);

  useEffect(() => {
    setEditorMode(mode);
  }, [mode]);

  const commitBlocks = (blocks: Block[], options: CommitOptions = {}): string => {
    const nextValue = serializeMarkdown(blocks);
    blocksRef.current = blocks;
    emittedValueRef.current = nextValue;
    setSourceValue(nextValue);
    const root = editorRef.current;
    if (root && options.render !== false) renderRoot(root, blocks, options.selection);
    onChange(nextValue);
    return nextValue;
  };

  const commitSource = (nextValue: string): void => {
    const blocks = blocksFromValue(nextValue);
    blocksRef.current = blocks;
    emittedValueRef.current = nextValue;
    setSourceValue(nextValue);
    const root = editorRef.current;
    if (root) renderRoot(root, blocks);
    onChange(nextValue);
  };

  const commitDom = (root: HTMLElement): void => {
    if (composingRef.current) return;
    const blocks = readEditableBlocks(root, [emptyParagraph()]);
    const selection = logicalSelection(root, blocks);
    const path = selection?.focus.path;
    const location = path ? blockLocation(blocks, path) : null;
    const converted = location && (location.block.type === 'paragraph' || location.block.type === 'heading')
      ? shortcutBlock(location.block, inlineText(location.block.inlines))
      : null;
    if (location && path && converted) {
      location.container[location.index] = converted;
      commitBlocks(blocks, { selection: shortcutSelection(path, converted) });
      return;
    }
    commitBlocks(blocks, { render: false });
  };

  const handleInput = (event: FormEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLInputElement;
    if (target.dataset?.markdownEditorTask === 'true') return;
    commitDom(event.currentTarget);
  };

  const replaceLogicalSelection = (text: string, allowCollapsedFallback = false): boolean => {
    const root = editorRef.current;
    if (!root) return false;
    const blocks = blocksRef.current;
    const selection = logicalSelection(root, blocks);
    if (!selection || (isCollapsed(selection) && !allowCollapsedFallback)) return false;
    const replaced = replaceEditorSelectionWithFallback(blocks, selection, text);
    if (!shouldPreventEditorDefault(replaced)) return false;
    commitBlocks(replaced.blocks, { selection: replaced.nextSelection });
    return true;
  };

  const handleEnter = (root: HTMLElement): boolean => {
    const blocks = blocksRef.current;
    const element = selectedElement(root);
    const selection = logicalSelection(root, blocks);
    const path = selection?.focus.path ?? (element ? blockPathForNode(element) : null);
    if (!element || !path) return false;

    if (element.tagName === 'TH' || element.tagName === 'TD') {
      const continued = ensureParagraphAfterBlock(blocks, path);
      commitBlocks(continued.blocks, { selection: selectionAt(continued.nextPath, 0) });
      return true;
    }

    if (element.tagName === 'LI') {
      const inlines = listItemInlines(blocks, path);
      if (!inlines) return false;
      if (!inlineText(inlines).trim()) {
        const next = exitEmptyBlock(blocks, path);
        commitBlocks(next, { selection: selectionAt(path, 0) });
        return true;
      }
      if (!selection) return false;
      const split = splitListItemAtSelection(blocks, selection);
      if (!split.handled) return false;
      commitBlocks(split.blocks, { selection: split.nextSelection });
      return split.handled;
    }

    if (!selection || !isCollapsed(selection) || !textBlockPoint(blocks, selection.focus)) return false;
    const split = splitBlockAtSelection(blocks, selection);
    commitBlocks(split.blocks, { selection: split.nextSelection });
    return true;
  };

  const handleDelete = (direction: 'backward' | 'forward'): boolean => {
    const root = editorRef.current;
    if (!root) return false;
    const blocks = blocksRef.current;
    const selection = logicalSelection(root, blocks);
    if (!selection || !textBlockPoint(blocks, selection.anchor) || !textBlockPoint(blocks, selection.focus)) return false;
    const result = direction === 'backward'
      ? deleteBackwardAtSelection(blocks, selection)
      : deleteForwardAtSelection(blocks, selection);
    if (result.changed) {
      commitBlocks(result.blocks, { selection: result.nextSelection });
      return true;
    }
    if (direction === 'backward' && isCollapsed(selection) && selection.anchor.offset === 0) {
      const removed = removeTableBeforeParagraph(blocks, selection.anchor.path);
      if (serializeMarkdown(removed.blocks) !== serializeMarkdown(blocks)) {
        commitBlocks(removed.blocks, { selection: selectionAt(removed.nextPath, 0) });
        return true;
      }
    }
    return false;
  };

  const handleBeforeInput = (event: FormEvent<HTMLDivElement>): void => {
    if (composingRef.current) return;
    const input = event.nativeEvent as InputEvent;
    if (input.inputType === 'insertParagraph' && handleEnter(event.currentTarget)) {
      event.preventDefault();
      return;
    }
    if (input.inputType === 'deleteContentBackward' && handleDelete('backward')) {
      event.preventDefault();
      return;
    }
    if (input.inputType === 'deleteContentForward' && handleDelete('forward')) {
      event.preventDefault();
      return;
    }
    const selection = logicalSelection(event.currentTarget, blocksRef.current);
    if (input.inputType === 'insertText' && input.data && selection && !isCollapsed(selection) && replaceLogicalSelection(input.data)) {
      event.preventDefault();
    }
  };

  const applyInlineFormatting = (command: InlineCommand): void => {
    const root = editorRef.current;
    if (!root) return;
    const target = inlineTarget(blocksRef.current, root);
    const offsets = target ? selectionOffsets(target.element) : null;
    if (!target || !offsets) return;
    const url = command === 'link'
      ? window.prompt('連結網址（僅支援 https://）', 'https://example.com') ?? 'https://example.com'
      : undefined;
    const formatted = applyInlineCommand(target.inlines, offsets.start, offsets.end, command, url);
    const next = updateInlineTarget(blocksRef.current, target, () => formatted.inlines);
    commitBlocks(next, {
      selection: {
        anchor: { path: target.path, offset: formatted.selectionStart },
        focus: { path: target.path, offset: formatted.selectionEnd },
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (composingRef.current) return;
    if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'k'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      applyInlineFormatting(event.key.toLowerCase() === 'b' ? 'strong' : event.key.toLowerCase() === 'i' ? 'emphasis' : 'link');
      return;
    }
    const root = event.currentTarget;
    const element = selectedElement(root);
    const path = element ? blockPathForNode(element) : null;
    if (event.key === 'Tab' && element?.tagName === 'LI' && path) {
      event.preventDefault();
      const direction = event.shiftKey ? 'out' : 'in';
      const nextPath = listItemPathAfterIndent(blocksRef.current, path, direction);
      commitBlocks(indentListItem(blocksRef.current, path, direction), { selection: selectionAt(nextPath, 0) });
      return;
    }
    if (event.key === 'Enter' && handleEnter(root)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Backspace' && handleDelete('backward')) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Delete' && handleDelete('forward')) event.preventDefault();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    const markdown = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    const selection = logicalSelection(event.currentTarget, blocksRef.current);
    if ((!markdown.includes('\n') && (!selection || isCollapsed(selection))) || !replaceLogicalSelection(markdown, markdown.includes('\n'))) return;
    event.preventDefault();
  };

  const handleComposition = (event: CompositionEvent<HTMLDivElement>): void => {
    composingRef.current = event.type === 'compositionstart';
    if (event.type === 'compositionend') {
      composingRef.current = false;
      commitDom(event.currentTarget);
    }
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' && !event.metaKey && !event.ctrlKey) event.preventDefault();
  };

  const handleChange = (event: FormEvent<HTMLDivElement>): void => {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.tagName !== 'INPUT' || checkbox.type !== 'checkbox' || checkbox.dataset.markdownEditorTask !== 'true') return;
    const result = applyEditorCheckboxChange(blocksRef.current, { dataset: checkbox.dataset });
    if (!result.handled) return;
    const nextValue = commitBlocks(result.blocks, { render: false });
    onTaskToggle?.(nextValue);
  };

  const applyBlockCommand = (command: 'paragraph' | 'heading' | 'list' | 'task' | 'quote' | 'code' | 'table' | 'rule'): void => {
    const root = editorRef.current;
    if (!root) return;
    const selection = logicalSelection(root, blocksRef.current);
    const path = selection?.focus.path;
    const location = path ? blockLocation(blocksRef.current, path) : null;
    if (!path || !location || (location.block.type !== 'paragraph' && location.block.type !== 'heading')) return;
    const content = location.block.inlines;
    const next = updateBlockAtPath(blocksRef.current, path, () => {
      if (command === 'paragraph') return { type: 'paragraph', inlines: content };
      if (command === 'heading') return { type: 'heading', level: 2, inlines: content };
      if (command === 'list') return { type: 'list', ordered: false, items: [{ inlines: content, children: [] }] };
      if (command === 'task') return { type: 'taskList', items: [{ checked: false, inlines: content, children: [] }] };
      if (command === 'quote') return { type: 'quote', blocks: [{ type: 'paragraph', inlines: content }] };
      if (command === 'code') return { type: 'codeBlock', value: inlineText(content) };
      if (command === 'table') return {
        type: 'table',
        header: [textInline('欄位 1'), textInline('欄位 2')],
        alignments: ['left', 'left'],
        rows: [[[], []]],
      };
      return { type: 'horizontalRule' };
    });
    if (command === 'table' || command === 'rule') {
      const continued = ensureParagraphAfterBlock(next, path);
      commitBlocks(continued.blocks, { selection: selectionAt(continued.nextPath, 0) });
      return;
    }
    const changed = blockLocation(next, path)?.block;
    if (changed) commitBlocks(next, { selection: shortcutSelection(path, changed) });
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (editorMode === 'source') sourceRef.current?.focus();
      else editorRef.current?.focus();
    },
    insertText: (text: string) => {
      if (!text) return;
      if (editorMode === 'source') {
        const textarea = sourceRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextValue = `${sourceValue.slice(0, start)}${text}${sourceValue.slice(end)}`;
        commitSource(nextValue);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(start + text.length, start + text.length);
        });
        return;
      }
      if (replaceLogicalSelection(text)) return;
      const root = editorRef.current;
      const target = root ? inlineTarget(blocksRef.current, root) : null;
      const offsets = target ? selectionOffsets(target.element) : null;
      if (!target || !offsets) return;
      const next = updateInlineTarget(blocksRef.current, target, (inlines) => insertInlineTextAtRange(
        inlines,
        offsets.start,
        offsets.end,
        text,
        isSelectionAfterInlineMark(target.element),
      ));
      commitBlocks(next, { selection: selectionAt(target.path, offsets.start + text.length) });
    },
    getValue: () => editorMode === 'source' ? sourceValue : serializeMarkdown(blocksRef.current),
    getSelectionContext: () => {
      if (editorMode === 'source') {
        return { value: sourceValue, offset: sourceRef.current?.selectionStart ?? 0 };
      }
      const root = editorRef.current;
      const target = root ? inlineTarget(blocksRef.current, root) : null;
      if (!target) return { value: '', offset: 0 };
      return { value: target.element.textContent ?? '', offset: selectionOffsets(target.element)?.start ?? 0 };
    },
  }), [editorMode, sourceValue]);

  const modeToggle = (
    <>
      <button aria-pressed={editorMode === 'blocks'} onClick={() => setEditorMode('blocks')} type="button">Blocks</button>
      <button aria-pressed={editorMode === 'source'} onClick={() => setEditorMode('source')} type="button">Source</button>
    </>
  );

  return (
    <div className="markdown-block-editor" style={{ minHeight: min, maxHeight: max }}>
      <div className="markdown-editor-toolbar" role="toolbar" aria-label={editorMode === 'source' ? 'Markdown 編輯模式' : 'Markdown 編輯工具'}>
        {modeToggle}
        {editorMode === 'blocks' && <>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting('strong')} type="button"><strong>B</strong></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting('emphasis')} type="button"><em>I</em></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting('code')} type="button">行內碼</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting('link')} type="button">連結</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('paragraph')} type="button">段落</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('heading')} type="button">標題</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('list')} type="button">清單</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('task')} type="button">待辦</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('quote')} type="button">引用</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('code')} type="button">程式碼區塊</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('table')} type="button">表格</button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('rule')} type="button">分隔線</button>
        </>}
      </div>
      <div
        ref={editorRef}
        className="markdown-editor-content"
        contentEditable
        data-placeholder={placeholder}
        hidden={editorMode === 'source'}
        onBeforeInput={handleBeforeInput}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleComposition}
        onCompositionEnd={handleComposition}
        onClick={handleClick}
        onChange={handleChange}
        style={{ minHeight: min, maxHeight: max }}
        suppressContentEditableWarning
      />
      <textarea
        ref={sourceRef}
        className="markdown-block-editor-source"
        hidden={editorMode === 'blocks'}
        value={sourceValue}
        placeholder={placeholder}
        style={{ minHeight: min, maxHeight: max, border: 0, borderRadius: 0, background: 'transparent' }}
        onChange={(event) => commitSource(event.target.value)}
      />
    </div>
  );
});

export default MarkdownBlockEditor;
