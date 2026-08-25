'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CompositionEvent,
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
  inlineText,
  listItemPathAfterIndent,
  splitTextBlockAtOffset,
  updateInlinesForTextInput,
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

function updateBlockAtPath(blocks: Block[], path: number[], updater: (block: Block) => Block): Block[] {
  const next = cloneBlocks(blocks);
  const update = (container: Block[], remaining: number[]): void => {
    const index = remaining[0];
    const block = container[index];
    if (!block) return;
    if (remaining.length === 1) {
      container[index] = updater(block);
      return;
    }
    if (block.type === 'quote' && block.blocks) update(block.blocks, remaining.slice(1));
  };
  update(next, path);
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
    const child = item.children.find((entry) => entry.type === 'list' || entry.type === 'taskList' || entry.type === 'quote');
    return visitBlock(child, remaining.slice(1));
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

function shortcutBlock(block: Block, value: string): Block | null {
  const shortcut = detectMarkdownShortcut(value);
  if (!shortcut || (block.type !== 'paragraph' && block.type !== 'heading')) return null;
  if (shortcut.type === 'heading') return { type: 'heading', level: shortcut.level, inlines: [] };
  if (shortcut.type === 'task') return { type: 'taskList', items: [{ checked: shortcut.checked, inlines: [], children: [] }] };
  return { type: 'list', ordered: shortcut.ordered, items: [{ inlines: [], children: [] }] };
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

  const focusPath = (path: number[]) => {
    requestAnimationFrame(() => {
      const element = editorRef.current?.querySelector<HTMLElement>(`[data-editor-surface="true"][data-block-path="${pathLabel(path)}"]`);
      element?.focus();
    });
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

  const onSurfaceComposition = (event: CompositionEvent<HTMLElement>) => {
    composingRef.current = event.type === 'compositionstart';
    if (event.type === 'compositionend') commitSurface(event.currentTarget);
  };

  const onSurfaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = getTarget(event.currentTarget);
    if (!target || composingRef.current) return;
    activeTargetRef.current = target;
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
      if (mode === 'source') sourceRef.current?.focus();
      else editorRef.current?.querySelector<HTMLElement>('[data-editor-surface="true"]')?.focus();
    },
    insertText: (text: string) => {
      if (!text) return;
      if (mode === 'source') {
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
      const selection = typeof window === 'undefined' ? null : window.getSelection();
      const node = selection?.anchorNode;
      const selectedSurface = node instanceof Element
        ? node.closest<HTMLElement>('[data-editor-surface="true"]')
        : node?.parentElement?.closest<HTMLElement>('[data-editor-surface="true"]');
      const surface = selection?.rangeCount && selectedSurface && editorRef.current?.contains(selectedSurface)
        ? selectedSurface
        : editorRef.current?.querySelector<HTMLElement>('[data-editor-surface="true"]');
      if (!surface) return;
      const range = selection?.rangeCount && surface === selectedSurface
        ? selection.getRangeAt(0)
        : document.createRange();
      if (!selection?.rangeCount || surface !== selectedSurface) {
        range.selectNodeContents(surface);
        range.collapse(true);
      }
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      commitSurface(surface);
    },
    getValue: () => mode === 'source' ? sourceValue : serializeMarkdown(blocks),
  }), [blocks, mode, sourceValue]);

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
      onInput={(event) => onSurfaceInput(event.currentTarget)}
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
            itemPath,
            [...blockPath, index, childIndex],
          ))}
        </li>;
      })}</ListTag>;
    }
    if (block.type === 'table') return <div className="markdown-editor-table-wrap" data-block-path={key} key={key}><table className="markdown-editor-block"><thead><tr>{block.header.map((cell, column) => <th key={column}>{renderTextSurface(renderInlines(cell), { kind: 'tableCell', path, section: 'header', row: 0, column })}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{renderTextSurface(renderInlines(cell), { kind: 'tableCell', path, section: 'body', row: rowIndex, column })}</td>)}</tr>)}</tbody></table></div>;
    return <hr className="markdown-editor-block" data-block-path={key} key={key} />;
  };

  if (mode === 'source') {
    return <textarea ref={sourceRef} className="markdown-block-editor markdown-block-editor-source" value={sourceValue} placeholder={placeholder} style={{ minHeight: min, maxHeight: max }} onChange={(event) => commitSource(event.target.value)} />;
  }

  return (
    <div className="markdown-block-editor" style={{ minHeight: min, maxHeight: max }}>
      <div className="markdown-editor-toolbar" role="toolbar" aria-label="Markdown 編輯工具">
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('paragraph')} type="button">段落</button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('heading')} type="button">標題</button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('list')} type="button">清單</button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('task')} type="button">待辦</button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('quote')} type="button">引用</button>
        <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand('code')} type="button">程式碼</button>
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
  let container = blocks;
  for (let index = 0; index < path.length; index += 1) {
    const block = container[path[index]];
    if (!block) return null;
    if (index === path.length - 1) return block;
    if (block.type !== 'quote' || !block.blocks) return null;
    container = block.blocks;
  }
  return null;
}

export default MarkdownBlockEditor;
