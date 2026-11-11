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

const isPreviewShortcut = (event: KeyboardEvent<HTMLElement>): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'e';

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const currentValue = useRef(value);
  currentValue.current = value;

  useEffect(() => { setPreview(mode === 'blocks'); }, [mode]);

  // 表單清空時回到編輯，不留下空白預覽
  useEffect(() => { if (!value.trim()) setPreview(false); }, [value]);

  // 版面會在預覽後改變高度，等 click 才切換，避免按鈕在放開滑鼠前被推走；
  // 用 pointerdown 記下起點，從編輯區拖曳選字到外面放開時不會誤觸
  useEffect(() => {
    let outsidePress = false;
    const onPointerDown = (event: PointerEvent): void => {
      const wrapper = wrapperRef.current;
      outsidePress = Boolean(wrapper?.contains(document.activeElement) && !wrapper.contains(event.target as Node));
    };
    const onClick = (event: globalThis.MouseEvent): void => {
      const pressedOutside = outsidePress;
      outsidePress = false;
      const wrapper = wrapperRef.current;
      // 外部按鈕若攔下 mousedown 保留焦點（例如插入時間），代表仍在編輯
      if (!pressedOutside || !wrapper || wrapper.contains(event.target as Node) || wrapper.contains(document.activeElement)) return;
      if (currentValue.current.trim()) setPreview(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

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

  // 快捷鍵或工具列切換時把焦點留在預覽，才能再按快捷鍵切回
  const openPreview = (): void => {
    const hadFocus = wrapperRef.current?.contains(document.activeElement);
    rememberSelection();
    setPreview(true);
    if (hadFocus) requestAnimationFrame(() => previewRef.current?.focus({ preventScroll: true }));
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
    if (isPreviewShortcut(event)) {
      event.preventDefault();
      openPreview();
      return;
    }
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
    <div ref={wrapperRef} className="markdown-block-editor markdown-text-editor">
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
        <button type="button" className="markdown-editor-preview-toggle" aria-pressed={preview} title="Ctrl/⌘+E"
          onMouseDown={(event) => { rememberSelection(); event.preventDefault(); }}
          onClick={() => preview ? focusSource() : openPreview()}>{preview ? '繼續編輯' : '預覽'}</button>
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
        ref={previewRef}
        tabIndex={-1}
        className={`markdown-text-preview markdown-preview${wrap ? '' : ' is-nowrap'}`}
        onClick={handlePreviewClick}
        onKeyDown={(event) => {
          if (!isPreviewShortcut(event)) return;
          event.preventDefault();
          focusSource();
        }}
        style={{ minHeight: Math.max(min, 160), outline: 'none' }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(value, { interactiveTasks: true }) }}
      />}
    </div>
  );
});

export default MarkdownBlockEditor;
