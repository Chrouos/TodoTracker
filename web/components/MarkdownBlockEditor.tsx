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
  type ReactNode,
} from 'react';
import {
  cloneBlocks,
  continueBlock,
  detectMarkdownShortcut,
  exitEmptyBlock,
  indentListItem,
  parseMarkdown,
  serializeMarkdown,
  toggleTaskItem,
  type Block,
  type Inline,
} from '@/lib/markdown';
import {
  applyInlineCommand,
  inlineText,
  insertInlineTextAtRange,
  listItemPathAfterIndent,
  pasteMarkdownAtTextBlock,
  splitTextBlockAtOffset,
  updateInlinesForTextInput,
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

type EditorTarget = {
  kind: 'block' | 'listItem' | 'codeBlock' | 'tableCell';
  path: number[];
  row?: number;
  column?: number;
  section?: 'header' | 'body';
};

const textInline = (value: string): Inline[] => value ? [{ type: 'text', value }] : [];

function blocksFromValue(value: string): Block[] {
  const parsed = parseMarkdown(value);
  return parsed.length ? parsed : [{ type: 'paragraph', inlines: [] }];
}

function toPath(value: string | undefined): number[] | null {
  if (!value || !/^\d+(?:\.\d+)*$/.test(value)) return null;
  return value.split('.').map(Number);
}

function pathLabel(path: number[]): string {
  return path.join('.');
}

function getTarget(surface: HTMLElement): EditorTarget | null {
  const path = toPath(surface.dataset.blockPath);
  const kind = surface.dataset.editorKind as EditorTarget['kind'] | undefined;
  if (!path || !kind) return null;
  const target: EditorTarget = { kind, path };
  if (kind === 'tableCell') {
    const row = Number(surface.dataset.tableRow);
    const column = Number(surface.dataset.tableColumn);
    const section = surface.dataset.tableSection;
    if (!Number.isInteger(row) || !Number.isInteger(column) || (section !== 'header' && section !== 'body')) return null;
    target.row = row;
    target.column = column;
    target.section = section;
  }
  return target;
}

function blockLocation(blocks: Block[], path: number[]): { container: Block[]; index: number; block: Block } | null {
  const visit = (container: Block[], index: number, remaining: number[]): { container: Block[]; index: number; block: Block } | null => {
    const block = container[index];
    if (!block) return null;
    if (!remaining.length) return { container, index, block };
    if (block.type === 'quote') {
      return block.blocks ? visit(block.blocks, remaining[0], remaining.slice(1)) : null;
    }
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

function updateListItemAtPath(blocks: Block[], path: number[], updater: (inlines: Inline[]) => Inline[]): Block[] {
  const next = cloneBlocks(blocks);
  const visitBlock = (block: Block | undefined, remaining: number[]): boolean => {
    if (!block || !remaining.length) return false;
    if (block.type === 'quote') return visitBlock(block.blocks?.[remaining[0]], remaining.slice(1));
    if (block.type !== 'list' && block.type !== 'taskList') return false;
    const item = block.items[remaining[0]];
    if (!item) return false;
    if (remaining.length === 1) {
      item.inlines = updater(item.inlines);
      return true;
    }
    const child = item.children[remaining[1]];
    return visitBlock(child, remaining.slice(2));
  };
  visitBlock(next[path[0]], path.slice(1));
  return next;
}

function updateTableCell(blocks: Block[], target: EditorTarget, value: string): Block[] {
  return updateBlockAtPath(blocks, target.path, (block) => {
    if (block.type !== 'table' || target.row === undefined || target.column === undefined || !target.section) return block;
    const cells = target.section === 'header' ? block.header : block.rows[target.row];
    if (!cells || !cells[target.column]) return block;
    cells[target.column] = updateInlinesForTextInput(cells[target.column], value);
    return block;
  });
}

function updateTargetInlines(blocks: Block[], target: EditorTarget, updater: (inlines: Inline[]) => Inline[]): Block[] {
  if (target.kind === 'listItem') return updateListItemAtPath(blocks, target.path, updater);
  if (target.kind === 'tableCell') {
    return updateBlockAtPath(blocks, target.path, (block) => {
      if (block.type !== 'table' || target.row === undefined || target.column === undefined || !target.section) return block;
      const cells = target.section === 'header' ? block.header : block.rows[target.row];
      if (cells?.[target.column]) cells[target.column] = updater(cells[target.column]);
      return block;
    });
  }
  return updateBlockAtPath(blocks, target.path, (block) => {
    return block.type === 'paragraph' || block.type === 'heading'
      ? { ...block, inlines: updater(block.inlines) }
      : block;
  });
}

function getTargetInlines(blocks: Block[], target: EditorTarget): Inline[] {
  if (target.kind === 'listItem') {
    const visit = (block: Block | undefined, remaining: number[]): Inline[] => {
      if (!block || !remaining.length) return [];
      if (block.type === 'quote') return visit(block.blocks?.[remaining[0]], remaining.slice(1));
      if (block.type !== 'list' && block.type !== 'taskList') return [];
      const item = block.items[remaining[0]];
      if (!item) return [];
      if (remaining.length === 1) return item.inlines;
      return visit(item.children[remaining[1]], remaining.slice(2));
    };
    return visit(blocks[target.path[0]], target.path.slice(1));
  }
  const block = findBlockAtPath(blocks, target.path);
  if (target.kind === 'tableCell' && block?.type === 'table' && target.row !== undefined && target.column !== undefined && target.section) {
    const cells = target.section === 'header' ? block.header : block.rows[target.row];
    return cells?.[target.column] ?? [];
  }
  return block?.type === 'paragraph' || block?.type === 'heading' ? block.inlines : [];
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
  if (shortcut.type === 'quote') return { type: 'quote', blocks: [{ type: 'paragraph', inlines: [] }] };
  return { type: 'codeBlock', value: '' };
}

function isEmptySurface(surface: HTMLElement): boolean {
  return !(surface.textContent ?? '').trim();
}

function caretOffset(surface: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return (surface.textContent ?? '').length;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.startContainer)) return (surface.textContent ?? '').length;
  const before = range.cloneRange();
  before.selectNodeContents(surface);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function selectionOffsets(surface: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(surface);
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

function isSelectionAfterInlineMark(surface: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !surface.contains(range.startContainer) || !isAtNodeEnd(range.startContainer, range.startOffset)) return false;
  let node: Node | null = range.startContainer;
  if (node === surface) return isInlineMark(surface.childNodes[range.startOffset - 1] ?? null);
  if (isInlineMark(node)) return true;
  while (node && node !== surface) {
    const parent: Node | null = node.parentNode;
    if (!parent || node.nextSibling) return false;
    if (isInlineMark(parent)) return true;
    node = parent;
  }
  return false;
}

function setSurfaceSelection(surface: HTMLElement, start: number, end = start): void {
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startNode: Node | null = null;
  let endNode: Node | null = null;
  let startOffset = 0;
  let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (!startNode && start <= cursor + length) {
      startNode = node;
      startOffset = Math.max(0, start - cursor);
    }
    if (!endNode && end <= cursor + length) {
      endNode = node;
      endOffset = Math.max(0, end - cursor);
      break;
    }
    cursor += length;
  }
  if (!startNode) {
    surface.focus();
    return;
  }
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode ?? startNode, endNode ? endOffset : startOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  surface.focus();
}

function renderInlines(inlines: Inline[]): ReactNode {
  return inlines.map((inline, index) => {
    if (inline.type === 'text') return inline.value;
    const content = typeof inline.inlines === 'string' ? inline.inlines : renderInlines(inline.inlines);
    if (inline.type === 'strong') return <strong key={index}>{content}</strong>;
    if (inline.type === 'emphasis') return <em key={index}>{content}</em>;
    if (inline.type === 'code') return <code key={index}>{content}</code>;
    if (inline.type === 'link') return <a href={inline.url} key={index} rel="noopener noreferrer" target="_blank">{content}</a>;
    return null;
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
  const [blocks, setBlocks] = useState<Block[]>(() => blocksFromValue(value));
  const [sourceValue, setSourceValue] = useState(value);
  const [editorMode, setEditorMode] = useState<'blocks' | 'source'>(mode);
  const editorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const dirtyRef = useRef(false);
  const emittedValueRef = useRef(value);
  const composingRef = useRef(false);
  const activeTargetRef = useRef<EditorTarget | null>(null);

  useEffect(() => {
    if (value === emittedValueRef.current) {
      dirtyRef.current = false;
      return;
    }
    if (!dirtyRef.current) {
      setBlocks(blocksFromValue(value));
      setSourceValue(value);
      emittedValueRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    setEditorMode(mode);
  }, [mode]);

  const commitBlocks = (next: Block[]) => {
    const nextValue = serializeMarkdown(next);
    setBlocks(next);
    setSourceValue(nextValue);
    dirtyRef.current = true;
    emittedValueRef.current = nextValue;
    onChange(nextValue);
    return nextValue;
  };

  const commitSource = (nextValue: string) => {
    setSourceValue(nextValue);
    setBlocks(blocksFromValue(nextValue));
    dirtyRef.current = true;
    emittedValueRef.current = nextValue;
    onChange(nextValue);
  };

  const focusPath = (path: number[], start?: number, end = start) => {
    requestAnimationFrame(() => {
      const element = editorRef.current?.querySelector<HTMLElement>(`[data-editor-surface="true"][data-block-path="${pathLabel(path)}"]`);
      if (!element) return;
      if (start === undefined) element.focus();
      else setSurfaceSelection(element, start, end);
    });
  };

  const selectedSurface = (): HTMLElement | null => {
    const selection = typeof window === 'undefined' ? null : window.getSelection();
    const node = selection?.anchorNode;
    const selected = node instanceof Element
      ? node.closest<HTMLElement>('[data-editor-surface="true"]')
      : node?.parentElement?.closest<HTMLElement>('[data-editor-surface="true"]');
    if (selected && editorRef.current?.contains(selected)) return selected;
    const target = activeTargetRef.current;
    return target
      ? editorRef.current?.querySelector<HTMLElement>(`[data-editor-surface="true"][data-block-path="${pathLabel(target.path)}"]`) ?? null
      : editorRef.current?.querySelector<HTMLElement>('[data-editor-surface="true"]') ?? null;
  };

  const commitSurface = (surface: HTMLElement) => {
    const target = getTarget(surface);
    if (!target) return;
    activeTargetRef.current = target;
    const nextText = surface.textContent ?? '';
    if (target.kind === 'listItem') {
      commitBlocks(updateListItemAtPath(blocks, target.path, (inlines) => updateInlinesForTextInput(inlines, nextText)));
      return;
    }
    if (target.kind === 'codeBlock') {
      commitBlocks(updateBlockAtPath(blocks, target.path, (block) => block.type === 'codeBlock' ? { ...block, value: nextText } : block));
      return;
    }
    if (target.kind === 'tableCell') {
      commitBlocks(updateTableCell(blocks, target, nextText));
      return;
    }
    const current = findBlockAtPath(blocks, target.path);
    const converted = current ? shortcutBlock(current, nextText) : null;
    const next = updateBlockAtPath(blocks, target.path, (block) => {
      if (converted) return converted;
      return block.type === 'heading' || block.type === 'paragraph'
        ? { ...block, inlines: updateInlinesForTextInput(block.inlines, nextText) }
        : block;
    });
    commitBlocks(next);
  };

  const onSurfaceInput = (surface: HTMLElement) => {
    if (!composingRef.current) commitSurface(surface);
  };

  const onSurfaceBeforeInput = (event: FormEvent<HTMLElement>) => {
    if (composingRef.current) return;
    const input = event.nativeEvent as InputEvent;
    if (input.inputType !== 'insertText' || !input.data || !isSelectionAfterInlineMark(event.currentTarget)) return;
    const target = getTarget(event.currentTarget);
    const selection = selectionOffsets(event.currentTarget);
    if (!target || !selection || !['block', 'listItem', 'tableCell'].includes(target.kind)) return;
    event.preventDefault();
    activeTargetRef.current = target;
    commitBlocks(updateTargetInlines(
      blocks,
      target,
      (inlines) => insertInlineTextAtRange(inlines, selection.start, selection.end, input.data ?? '', true),
    ));
    focusPath(target.path, selection.start + input.data.length);
  };

  const onSurfacePaste = (event: ClipboardEvent<HTMLElement>) => {
    const markdown = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (!markdown.includes('\n')) return;
    const target = getTarget(event.currentTarget);
    const selection = selectionOffsets(event.currentTarget);
    if (!target || target.kind !== 'block' || !selection) return;
    event.preventDefault();
    const pasted = pasteMarkdownAtTextBlock(blocks, target.path, selection.start, selection.end, markdown);
    commitBlocks(pasted.blocks);
    focusPath(pasted.nextPath);
  };

  const onSurfaceComposition = (event: CompositionEvent<HTMLElement>) => {
    composingRef.current = event.type === 'compositionstart';
    if (event.type === 'compositionend') commitSurface(event.currentTarget);
  };

  const applyInlineFormatting = (command: InlineCommand) => {
    const surface = selectedSurface();
    const target = surface ? getTarget(surface) : null;
    const selection = surface ? selectionOffsets(surface) : null;
    if (!target || !selection || !['block', 'listItem', 'tableCell'].includes(target.kind)) return;
    const url = command === 'link'
      ? window.prompt('連結網址（僅支援 https://）', 'https://example.com') ?? 'https://example.com'
      : undefined;
    const formatted = applyInlineCommand(
      getTargetInlines(blocks, target),
      selection.start,
      selection.end,
      command,
      url,
    );
    commitBlocks(updateTargetInlines(blocks, target, () => formatted.inlines));
    focusPath(target.path, formatted.selectionStart, formatted.selectionEnd);
  };

  const onSurfaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = getTarget(event.currentTarget);
    if (!target || composingRef.current) return;
    activeTargetRef.current = target;
    if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'k'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      applyInlineFormatting(event.key.toLowerCase() === 'b' ? 'strong' : event.key.toLowerCase() === 'i' ? 'emphasis' : 'link');
      return;
    }
    if (target.kind === 'block' && event.key === 'Enter') {
      event.preventDefault();
      const split = splitTextBlockAtOffset(blocks, target.path, caretOffset(event.currentTarget));
      commitBlocks(split.blocks);
      focusPath(split.nextPath);
      return;
    }
    if (target.kind !== 'listItem') return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? 'out' : 'in';
      const nextPath = listItemPathAfterIndent(blocks, target.path, direction);
      commitBlocks(indentListItem(blocks, target.path, direction));
      focusPath(nextPath);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (isEmptySurface(event.currentTarget)) {
      commitBlocks(exitEmptyBlock(blocks, target.path));
      return;
    }
    commitBlocks(continueBlock(blocks, target.path));
    const nextPath = [...target.path];
    nextPath[nextPath.length - 1] += 1;
    focusPath(nextPath);
  };

  const toggleTask = (path: number[]) => {
    const nextValue = commitBlocks(toggleTaskItem(blocks, path));
    onTaskToggle?.(nextValue);
  };

  const applyBlockCommand = (command: 'paragraph' | 'heading' | 'list' | 'task' | 'quote' | 'code' | 'table' | 'rule') => {
    const target = activeTargetRef.current;
    if (!target || target.kind !== 'block') return;
    const next = updateBlockAtPath(blocks, target.path, (block) => {
      const content = block.type === 'paragraph' || block.type === 'heading' ? block.inlines : textInline('');
      if (command === 'paragraph') return { type: 'paragraph', inlines: content };
      if (command === 'heading') return { type: 'heading', level: 2, inlines: content };
      if (command === 'list') return { type: 'list', ordered: false, items: [{ inlines: content, children: [] }] };
      if (command === 'task') return { type: 'taskList', items: [{ checked: false, inlines: content, children: [] }] };
      if (command === 'quote') return { type: 'quote', blocks: [{ type: 'paragraph', inlines: content }] };
      if (command === 'code') return { type: 'codeBlock', value: inlineText(content) };
      if (command === 'table') return { type: 'table', header: [textInline('欄位 1'), textInline('欄位 2')], alignments: ['left', 'left'], rows: [[textInline(''), textInline('')]] };
      return { type: 'horizontalRule' };
    });
    commitBlocks(next);
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (editorMode === 'source') sourceRef.current?.focus();
      else editorRef.current?.querySelector<HTMLElement>('[data-editor-surface="true"]')?.focus();
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
      const surface = selectedSurface();
      if (!surface) return;
      const target = getTarget(surface);
      const selection = selectionOffsets(surface) ?? { start: 0, end: 0 };
      if (!target) return;
      if (target.kind === 'codeBlock') {
        commitBlocks(updateBlockAtPath(blocks, target.path, (block) => {
          if (block.type !== 'codeBlock') return block;
          const current = block.value ?? '';
          return { ...block, value: `${current.slice(0, selection.start)}${text}${current.slice(selection.end)}` };
        }));
      } else if (['block', 'listItem', 'tableCell'].includes(target.kind)) {
        commitBlocks(updateTargetInlines(
          blocks,
          target,
          (inlines) => insertInlineTextAtRange(inlines, selection.start, selection.end, text, isSelectionAfterInlineMark(surface)),
        ));
      } else {
        return;
      }
      focusPath(target.path, selection.start + text.length);
    },
    getValue: () => editorMode === 'source' ? sourceValue : serializeMarkdown(blocks),
    getSelectionContext: () => {
      if (editorMode === 'source') {
        const offset = sourceRef.current?.selectionStart ?? 0;
        return { value: sourceValue, offset };
      }
      const surface = selectedSurface();
      if (!surface) return { value: '', offset: 0 };
      const offset = selectionOffsets(surface)?.start ?? 0;
      return { value: surface.textContent ?? '', offset };
    },
  }), [blocks, editorMode, sourceValue]);

  const renderTextSurface = (content: ReactNode, target: EditorTarget, className = '') => (
    <div
      className={`markdown-editor-surface ${className}`.trim()}
      contentEditable
      data-block-path={pathLabel(target.path)}
      data-editor-kind={target.kind}
      data-editor-surface="true"
      data-table-row={target.row}
      data-table-column={target.column}
      data-table-section={target.section}
      onFocus={(event) => { activeTargetRef.current = getTarget(event.currentTarget); }}
      onBeforeInput={onSurfaceBeforeInput}
      onInput={(event) => onSurfaceInput(event.currentTarget)}
      onPaste={onSurfacePaste}
      onCompositionStart={onSurfaceComposition}
      onCompositionEnd={onSurfaceComposition}
      onKeyDown={onSurfaceKeyDown}
      suppressContentEditableWarning
    >
      {content}
    </div>
  );

  const renderBlock = (block: Block, path: number[], blockPath = path): ReactNode => {
    const key = pathLabel(blockPath);
    if (block.type === 'paragraph' || block.type === 'heading') {
      const surface = renderTextSurface(renderInlines(block.inlines), { kind: 'block', path });
      if (block.type === 'paragraph') return <p className="markdown-editor-block" data-block-path={key} key={key}>{surface}</p>;
      const headingProps = { className: 'markdown-editor-block', 'data-block-path': key, key };
      switch (Math.min(6, Math.max(1, block.level ?? 1))) {
        case 1: return <h1 {...headingProps}>{surface}</h1>;
        case 2: return <h2 {...headingProps}>{surface}</h2>;
        case 3: return <h3 {...headingProps}>{surface}</h3>;
        case 4: return <h4 {...headingProps}>{surface}</h4>;
        case 5: return <h5 {...headingProps}>{surface}</h5>;
        default: return <h6 {...headingProps}>{surface}</h6>;
      }
    }
    if (block.type === 'quote') return <blockquote className="markdown-editor-block" data-block-path={key} key={key}>{(block.blocks ?? []).map((child, index) => renderBlock(child, [...path, index], [...blockPath, index]))}</blockquote>;
    if (block.type === 'codeBlock') return <pre className="markdown-editor-block" data-block-path={key} key={key}><code>{renderTextSurface(block.value ?? '', { kind: 'codeBlock', path }, 'markdown-editor-code')}</code></pre>;
    if (block.type === 'list' || block.type === 'taskList') {
      const ListTag = block.type === 'list' && block.ordered ? 'ol' : 'ul';
      return <ListTag className={`markdown-editor-block ${block.type === 'taskList' ? 'markdown-task-list' : ''}`} data-block-path={key} key={key}>{block.items.map((item, index) => {
        const itemPath = [...path, index];
        return <li data-block-path={pathLabel(itemPath)} key={pathLabel(itemPath)}>
          {block.type === 'taskList' && <input aria-label="切換待辦事項" checked={'checked' in item && item.checked} onChange={() => toggleTask(itemPath)} type="checkbox" />}
          {renderTextSurface(renderInlines(item.inlines), { kind: 'listItem', path: itemPath })}
          {item.children.map((child, childIndex) => renderBlock(
            child,
            [...itemPath, childIndex],
            [...blockPath, index, childIndex],
          ))}
        </li>;
      })}</ListTag>;
    }
    if (block.type === 'table') return <div className="markdown-editor-table-wrap" data-block-path={key} key={key}><table className="markdown-editor-block"><thead><tr>{block.header.map((cell, column) => <th key={column}>{renderTextSurface(renderInlines(cell), { kind: 'tableCell', path, section: 'header', row: 0, column })}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{renderTextSurface(renderInlines(cell), { kind: 'tableCell', path, section: 'body', row: rowIndex, column })}</td>)}</tr>)}</tbody></table></div>;
    return <hr className="markdown-editor-block" data-block-path={key} key={key} />;
  };

  const modeToggle = (
    <>
      <button aria-pressed={editorMode === 'blocks'} onClick={() => setEditorMode('blocks')} type="button">Blocks</button>
      <button aria-pressed={editorMode === 'source'} onClick={() => setEditorMode('source')} type="button">Source</button>
    </>
  );

  if (editorMode === 'source') {
    return (
      <div className="markdown-block-editor" style={{ minHeight: min, maxHeight: max }}>
        <div className="markdown-editor-toolbar" role="toolbar" aria-label="Markdown 編輯模式">
          {modeToggle}
        </div>
        <textarea
          ref={sourceRef}
          className="markdown-block-editor-source"
          value={sourceValue}
          placeholder={placeholder}
          style={{ minHeight: min, maxHeight: max, border: 0, borderRadius: 0, background: 'transparent' }}
          onChange={(event) => commitSource(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="markdown-block-editor" style={{ minHeight: min, maxHeight: max }}>
      <div className="markdown-editor-toolbar" role="toolbar" aria-label="Markdown 編輯工具">
        {modeToggle}
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
      </div>
      <div className="markdown-editor-content" ref={editorRef} data-placeholder={placeholder}>
        {blocks.map((block, index) => renderBlock(block, [index]))}
      </div>
    </div>
  );
});

function findBlockAtPath(blocks: Block[], path: number[]): Block | null {
  return blockLocation(blocks, path)?.block ?? null;
}

export default MarkdownBlockEditor;
