'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import AutoTextarea from '@/components/AutoTextarea';
import { replaceTextareaSource } from '@/lib/markdown-dom';
import {
  activeToolbarState,
  formatSourceSelection,
  renderMarkdown,
  toggleTaskSource,
  type SourceCommand,
} from '@/lib/markdown';

export type MarkdownBlockEditorProps = {
  id?: string;
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

const commonCommands: [SourceCommand, string][] = [
  ['bold', '粗體'],
  ['heading', '標題'],
  ['unordered-list', '清單'],
  ['link', '連結'],
];
const moreCommands: [SourceCommand, string][] = [
  ['italic', '斜體'],
  ['ordered-list', '編號清單'],
  ['task', '待辦清單'],
  ['quote', '引用'],
  ['inline-code', '行內碼'],
  ['code-block', '程式碼區塊'],
  ['table', '表格'],
  ['rule', '分隔線'],
];

const MarkdownBlockEditor = forwardRef<MarkdownEditorHandle, MarkdownBlockEditorProps>(function MarkdownBlockEditor({
  id,
  value,
  onChange,
  placeholder = '開始記錄，支援 Markdown…',
  min = 160,
  mode = 'source',
  onTaskToggle,
}, ref) {
  const [preview, setPreview] = useState(mode === 'blocks');
  const [wrap, setWrap] = useState(true);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const currentValue = useRef(value);
  currentValue.current = value;

  useEffect(() => { setPreview(mode === 'blocks'); }, [mode]);

  const commit = (nextValue: string): void => {
    currentValue.current = nextValue;
    onChange(nextValue);
  };

  const rememberSelection = (): void => {
    const textarea = sourceRef.current;
    if (textarea) setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  };

  const focusSource = (start = selection.start, end = selection.end): void => {
    setPreview(false);
    requestAnimationFrame(() => {
      sourceRef.current?.focus();
      sourceRef.current?.setSelectionRange(start, end);
      setSelection({ start, end });
    });
  };

  const applyCommand = (command: SourceCommand): void => {
    const textarea = sourceRef.current;
    const start = textarea?.selectionStart ?? selection.start;
    const end = textarea?.selectionEnd ?? selection.end;
    const result = formatSourceSelection(currentValue.current, start, end, command);
    if (!textarea || !replaceTextareaSource(textarea, result.source)) commit(result.source);
    if (moreRef.current) moreRef.current.open = false;
    focusSource(result.selectionStart, result.selectionEnd);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && moreRef.current) moreRef.current.open = false;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const command = ({ b: 'bold', i: 'italic', k: 'link' } as const)[event.key.toLowerCase() as 'b' | 'i' | 'k'];
    if (!command) return;
    event.preventDefault();
    applyCommand(command);
  };

  const togglePreviewTask = (path: string | undefined): void => {
    if (!path || !/^\d+(?:\.\d+)+$/.test(path)) return;
    const nextValue = toggleTaskSource(currentValue.current, path.split('.').map(Number));
    commit(nextValue);
    onTaskToggle?.(nextValue);
  };

  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    const checkbox = target.closest<HTMLInputElement>('input[data-markdown-task-path]');
    if (checkbox) { togglePreviewTask(checkbox.dataset.markdownTaskPath); return; }
    if (target.closest('a, input')) return;
    event.preventDefault();
    focusSource();
  };

  useImperativeHandle(ref, () => ({
    focus: () => focusSource(),
    insertText: (text: string) => {
      if (!text) return;
      const textarea = sourceRef.current;
      const start = textarea?.selectionStart ?? selection.start;
      const end = textarea?.selectionEnd ?? selection.end;
      const nextValue = currentValue.current.slice(0, start) + text + currentValue.current.slice(end);
      if (!textarea || !replaceTextareaSource(textarea, nextValue)) commit(nextValue);
      focusSource(start + text.length, start + text.length);
    },
    getValue: () => currentValue.current,
    getSelectionContext: () => ({
      value: currentValue.current,
      offset: sourceRef.current?.selectionStart ?? selection.start,
    }),
  }));

  const state = activeToolbarState(value, selection.start, selection.end);
  const renderCommand = ([command, label]: [SourceCommand, string]) => (
    <button
      key={command}
      type="button"
      title={label}
      aria-pressed={command === 'bold' ? state.bold : command === 'italic' ? state.italic : command === 'link' ? state.link : undefined}
      onMouseDown={(event) => { rememberSelection(); event.preventDefault(); }}
      onClick={() => applyCommand(command)}
    >{label}</button>
  );

  return (
    <div className="markdown-block-editor markdown-text-editor">
      <div className="markdown-editor-toolbar" role="toolbar" aria-label="Markdown 編輯工具">
        {!preview && <>
          {commonCommands.map(renderCommand)}
          <details ref={moreRef} className="markdown-editor-more">
            <summary>更多</summary>
            <div className="markdown-editor-more-menu">{moreCommands.map(renderCommand)}</div>
          </details>
          <button type="button" aria-pressed={wrap} title="關閉後可橫向捲動，方便閱讀寬表格"
            onMouseDown={(event) => event.preventDefault()} onClick={() => setWrap(!wrap)}>自動換行</button>
        </>}
        <button type="button" className="markdown-editor-preview-toggle" aria-pressed={preview}
          onMouseDown={(event) => { rememberSelection(); event.preventDefault(); }}
          onClick={() => preview ? focusSource() : setPreview(true)}>{preview ? '繼續編輯' : '預覽'}</button>
      </div>
      <AutoTextarea
        id={id}
        innerRef={sourceRef}
        className="markdown-text-source"
        hidden={preview}
        value={value}
        onChange={commit}
        placeholder={placeholder}
        aria-label={placeholder}
        wrap={wrap ? 'soft' : 'off'}
        min={Math.max(min, 160)}
        max={Infinity}
        onKeyDown={handleKeyDown}
        onSelect={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
      />
      {preview && <div
        className={`markdown-text-preview markdown-preview${wrap ? '' : ' is-nowrap'}`}
        onClick={handlePreviewClick}
        style={{ minHeight: Math.max(min, 160) }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(value, { interactiveTasks: true }) }}
      />}
    </div>
  );
});

export default MarkdownBlockEditor;
