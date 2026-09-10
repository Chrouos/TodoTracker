import {
  cloneBlocks,
  detectMarkdownShortcut,
  parseMarkdown,
  serializeMarkdown,
  toggleTaskItem,
} from './markdown.js';
import {
  blockPathForNode,
  readEditableBlocks,
  readEditorSelection,
  renderEditableBlocks,
  restoreEditorSelection,
} from './markdown-dom.js';

const DEFAULT_MODE = 'toolbar';

export function normalizeMarkdownEditorMode(mode) {
  return mode === 'source' ? 'source' : DEFAULT_MODE;
}

function wrapSelection(value, start, end, marker, placeholder) {
  const selected = value.slice(start, end) || placeholder;
  const replacement = `${marker}${selected}${marker}`;
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  };
}

function prefixLines(value, start, end, prefix) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const selectedEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const selected = value.slice(lineStart, selectedEnd);
  const lines = selected.split('\n');
  const replacement = lines.map((line) => `${prefix}${line}`).join('\n');
  const added = prefix.length * lines.length;
  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(selectedEnd)}`,
    selectionStart: start + prefix.length,
    selectionEnd: end + added,
  };
}

export function formatMarkdownSelection(value, start, end, command) {
  const text = String(value ?? '');
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  if (command === 'bold') return wrapSelection(text, safeStart, safeEnd, '**', '粗體文字');
  if (command === 'italic') return wrapSelection(text, safeStart, safeEnd, '*', '斜體文字');
  if (command === 'code') return wrapSelection(text, safeStart, safeEnd, '`', '程式碼');
  if (command === 'heading') return prefixLines(text, safeStart, safeEnd, '## ');
  if (command === 'unordered-list') return prefixLines(text, safeStart, safeEnd, '- ');
  if (command === 'ordered-list') return prefixLines(text, safeStart, safeEnd, '1. ');
  if (command === 'quote') return prefixLines(text, safeStart, safeEnd, '> ');
  if (command === 'todo') return prefixLines(text, safeStart, safeEnd, '- [ ] ');
  if (command === 'table') {
    const replacement = '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |';
    return {
      value: `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`,
      selectionStart: safeStart + 2,
      selectionEnd: safeStart + 10,
    };
  }
  if (command === 'link') {
    const selected = text.slice(safeStart, safeEnd) || '連結文字';
    const replacement = `[${selected}](https://)`;
    const urlStart = safeStart + selected.length + 3;
    return {
      value: `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`,
      selectionStart: urlStart,
      selectionEnd: urlStart + 8,
    };
  }
  return { value: text, selectionStart: safeStart, selectionEnd: safeEnd };
}

export function markdownShortcutToBlock(value) {
  const shortcut = detectMarkdownShortcut(value);
  if (!shortcut) return null;
  if (shortcut.type === 'heading') return { type: 'heading', level: shortcut.level, inlines: [] };
  if (shortcut.type === 'task') return { type: 'taskList', items: [{ checked: shortcut.checked, inlines: [], children: [] }] };
  if (shortcut.type === 'quote') return { type: 'quote', blocks: [{ type: 'paragraph', inlines: [] }] };
  if (shortcut.type === 'codeBlock') return { type: 'codeBlock', value: '' };
  return { type: 'list', ordered: shortcut.ordered, items: [{ inlines: [], children: [] }] };
}

export function serializeTaskCheckboxToggle(markdown, pathLabel) {
  if (!/^\d+(?:\.\d+)+$/.test(String(pathLabel ?? ''))) return String(markdown ?? '');
  try {
    return serializeMarkdown(toggleTaskItem(parseMarkdown(markdown), String(pathLabel).split('.').map(Number)));
  } catch {
    return String(markdown ?? '');
  }
}

export const inlineText = (inlines = []) => inlines.map((inline) => {
  if (inline.type === 'text') return inline.value;
  return typeof inline.inlines === 'string' ? inline.inlines : inlineText(inline.inlines);
}).join('');

const textInlines = (value) => value ? [{ type: 'text', value }] : [];

export function blocksFromMarkdown(value) {
  const blocks = parseMarkdown(value);
  return blocks.length ? blocks : [{ type: 'paragraph', inlines: [] }];
}

export function updateInlinesForTextInput(inlines, nextText) {
  const currentText = inlineText(inlines);
  if (currentText === nextText) return inlines;
  let start = 0;
  while (start < currentText.length && start < nextText.length && currentText[start] === nextText[start]) start += 1;
  let currentEnd = currentText.length;
  let nextEnd = nextText.length;
  while (currentEnd > start && nextEnd > start && currentText[currentEnd - 1] === nextText[nextEnd - 1]) { currentEnd -= 1; nextEnd -= 1; }
  return replaceInlineRange(inlines, start, currentEnd, nextText.slice(start, nextEnd));
}

export function insertInlineTextAtSelection(inlines, start, end, text, { range, surface } = {}) {
  if (!isAfterInlineBoundary(range, surface)) return replaceInlineRange(inlines, start, end, text);
  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  return mergeInlines([...before, ...(text ? [{ type: 'text', value: text }] : []), ...after]);
}

export function splitTextBlockAtOffset(blocks, path, offset) {
  const next = cloneBlocks(blocks);
  const location = textBlockLocation(next, path);
  if (!location) return { blocks: next, nextPath: path };
  const { container, index, block } = location;
  if (!inlineText(block.inlines).length) {
    if (block.type === 'heading') { container[index] = { type: 'paragraph', inlines: [] }; return { blocks: next, nextPath: path }; }
    container.splice(index + 1, 0, { type: 'paragraph', inlines: [] });
    return { blocks: next, nextPath: [...path.slice(0, -1), index + 1] };
  }
  const [before, after] = splitInlinesAtOffset(block.inlines, offset);
  container.splice(index, 1, { ...block, inlines: before }, { ...block, inlines: after });
  return { blocks: next, nextPath: [...path.slice(0, -1), index + 1] };
}

export function pasteMarkdownAtTextBlock(blocks, path, start, end, markdown) {
  const next = cloneBlocks(blocks);
  const location = textBlockLocation(next, path);
  const pasted = parseMarkdown(markdown);
  if (!location || !pasted.length) return { blocks: next, nextPath: path };

  const textLength = inlineText(location.block.inlines).length;
  const safeStart = Math.max(0, Math.min(start, textLength));
  const safeEnd = Math.max(safeStart, Math.min(end, textLength));
  const [before, rest] = splitInlinesAtOffset(location.block.inlines, safeStart);
  const [, after] = splitInlinesAtOffset(rest, safeEnd - safeStart);
  const replacement = [];
  if (before.length) replacement.push({ ...location.block, inlines: before });
  replacement.push(...pasted);
  if (after.length) replacement.push({ ...location.block, inlines: after });
  location.container.splice(location.index, 1, ...replacement);
  return {
    blocks: next,
    nextPath: [...path.slice(0, -1), location.index + replacement.length - 1],
  };
}

function textBlockLocation(blocks, path) {
  let container = blocks;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth]; const block = container[index];
    if (!block) return null;
    if (depth === path.length - 1) return ['paragraph', 'heading'].includes(block.type) ? { container, index, block } : null;
    if (block.type !== 'quote') return null;
    container = block.blocks ?? [];
  }
  return null;
}

function replaceInlineRange(inlines, start, end, replacement) {
  let cursor = 0;
  for (const inline of inlines) {
    const length = inlineText([inline]).length;
    if (start >= cursor && end <= cursor + length && inline.type !== 'text') {
      if (inline.type === 'code' && typeof inline.inlines === 'string') return replaceInline(inlines, inline, { ...inline, inlines: `${inline.inlines.slice(0, start - cursor)}${replacement}${inline.inlines.slice(end - cursor)}` });
      if (typeof inline.inlines !== 'string') return replaceInline(inlines, inline, { ...inline, inlines: replaceInlineRange(inline.inlines, start - cursor, end - cursor, replacement) });
    }
    cursor += length;
  }
  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  return mergeInlines([...before, ...(replacement ? [{ type: 'text', value: replacement }] : []), ...after]);
}

function replaceInline(inlines, target, replacement) { return inlines.map((inline) => inline === target ? replacement : cloneInline(inline)); }
function splitInlinesAtOffset(inlines, offset) {
  const left = []; const right = []; let cursor = 0;
  for (const inline of inlines) {
    const length = inlineText([inline]).length;
    if (offset <= cursor) right.push(cloneInline(inline));
    else if (offset >= cursor + length) left.push(cloneInline(inline));
    else { const [before, after] = splitInline(inline, offset - cursor); if (before) left.push(before); if (after) right.push(after); }
    cursor += length;
  }
  return [mergeInlines(left), mergeInlines(right)];
}
function splitInline(inline, offset) {
  if (inline.type === 'text') return [inline.value.slice(0, offset) ? { type: 'text', value: inline.value.slice(0, offset) } : null, inline.value.slice(offset) ? { type: 'text', value: inline.value.slice(offset) } : null];
  if (inline.type === 'code' && typeof inline.inlines === 'string') return [inline.inlines.slice(0, offset) ? { ...inline, inlines: inline.inlines.slice(0, offset) } : null, inline.inlines.slice(offset) ? { ...inline, inlines: inline.inlines.slice(offset) } : null];
  if (typeof inline.inlines === 'string') return [cloneInline(inline), null];
  const [before, after] = splitInlinesAtOffset(inline.inlines, offset);
  return [before.length ? { ...inline, inlines: before } : null, after.length ? { ...inline, inlines: after } : null];
}
function mergeInlines(inlines) { const output = []; for (const inline of inlines) { const previous = output.at(-1); if (inline.type === 'text' && previous?.type === 'text') previous.value += inline.value; else output.push(cloneInline(inline)); } return output; }
function cloneInline(inline) { return inline.type === 'text' ? { ...inline } : typeof inline.inlines === 'string' ? { ...inline } : { ...inline, inlines: inline.inlines.map(cloneInline) }; }

function pathLabel(path) {
  return path.join('.');
}

function parsePath(value) {
  return /^\d+(?:\.\d+)*$/.test(String(value ?? '')) ? String(value).split('.').map(Number) : null;
}

export function restoreTextareaFromEditor(marker, wrapper, textarea) {
  wrapper.replaceWith(textarea);
  marker.remove();
}

function bindDoubleEnterSubmit(textarea, onEmptyParagraphEnter) {
  if (!onEmptyParagraphEnter) return () => {};
  let expectedCaretOffset = null;
  const disarm = () => { expectedCaretOffset = null; };
  const onKeyDown = (event) => {
    const plainEnter = event.key === 'Enter'
      && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
      && !event.repeat && !event.isComposing && event.keyCode !== 229;
    const collapsed = textarea.selectionStart === textarea.selectionEnd;
    if (!plainEnter || !collapsed) { disarm(); return; }
    const caret = textarea.selectionStart;
    const atEmptyLine = caret > 0
      && textarea.value[caret - 1] === '\n'
      && (caret === textarea.value.length || textarea.value[caret] === '\n');
    if (expectedCaretOffset === caret && atEmptyLine) {
      event.preventDefault();
      disarm();
      onEmptyParagraphEnter();
      return;
    }
    expectedCaretOffset = caret + 1;
  };
  const onInput = (event) => {
    const insertedEnter = ['insertLineBreak', 'insertParagraph'].includes(event.inputType)
      && textarea.selectionStart === expectedCaretOffset
      && textarea.selectionStart === textarea.selectionEnd;
    if (!insertedEnter) disarm();
  };
  textarea.addEventListener('keydown', onKeyDown);
  textarea.addEventListener('input', onInput);
  textarea.addEventListener('select', disarm);
  textarea.addEventListener('pointerdown', disarm);
  textarea.addEventListener('mousedown', disarm);
  textarea.addEventListener('compositionstart', disarm);
  return () => {
    textarea.removeEventListener('keydown', onKeyDown);
    textarea.removeEventListener('input', onInput);
    textarea.removeEventListener('select', disarm);
    textarea.removeEventListener('pointerdown', disarm);
    textarea.removeEventListener('mousedown', disarm);
    textarea.removeEventListener('compositionstart', disarm);
  };
}

function mountSimpleMarkdownEditor(textarea, onChange, onEmptyParagraphEnter) {
  const parent = textarea.parentNode;
  const marker = document.createComment('markdown-editor');
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-editor is-simple';
  wrapper.dataset.editorMode = 'simple';
  parent.insertBefore(marker, textarea);
  parent.insertBefore(wrapper, textarea);
  wrapper.appendChild(textarea);

  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Markdown editor');
  const commands = [
    ['bold', 'B', 'Bold'],
    ['italic', 'I', 'Italic'],
    ['link', '↗', 'Link'],
    ['heading', 'H2', 'Heading'],
    ['unordered-list', '•', 'List'],
    ['ordered-list', '1.', 'Ordered list'],
    ['todo', '☐', 'Todo'],
    ['quote', '❞', 'Quote'],
    ['code', '</>', 'Code'],
    ['table', '▦', 'Table'],
    ['rule', '—', 'Rule'],
  ];
  for (const [command, label, title] of commands) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.markdownCommand = command;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.textContent = label;
    toolbar.appendChild(button);
  }
  wrapper.insertBefore(toolbar, textarea);

  let savedStart = null;
  let savedEnd = null;
  const commit = (value, selectionStart, selectionEnd) => {
    textarea.value = value;
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    onChange?.(value);
  };
  const onMouseDown = (event) => {
    const button = event.target.closest?.('[data-markdown-command]');
    if (!button) return;
    savedStart = textarea.selectionStart;
    savedEnd = textarea.selectionEnd;
    event.preventDefault();
  };
  const onClick = (event) => {
    const button = event.target.closest?.('[data-markdown-command]');
    if (!button) return;
    event.preventDefault();
    const start = savedStart ?? textarea.selectionStart;
    const end = savedEnd ?? textarea.selectionEnd;
    if (button.dataset.markdownCommand === 'bold' && start === end) {
      const value = `${textarea.value.slice(0, start)}** **${textarea.value.slice(end)}`;
      commit(value, start + 2, start + 3);
      savedStart = null;
      savedEnd = null;
      return;
    }
    const result = formatMarkdownSelection(textarea.value, start, end, button.dataset.markdownCommand);
    commit(result.value, result.selectionStart, result.selectionEnd);
    savedStart = null;
    savedEnd = null;
  };
  toolbar.addEventListener('mousedown', onMouseDown);
  toolbar.addEventListener('click', onClick);
  const removeDoubleEnterSubmit = bindDoubleEnterSubmit(textarea, onEmptyParagraphEnter);

  return {
    destroy() {
      toolbar.removeEventListener('mousedown', onMouseDown);
      toolbar.removeEventListener('click', onClick);
      removeDoubleEnterSubmit();
      restoreTextareaFromEditor(marker, wrapper, textarea);
    },
    focus() { textarea.focus(); },
    sync() {},
    insertText(text) {
      if (!text) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      commit(`${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`, start + text.length, start + text.length);
    },
    getValue() { return textarea.value; },
    getSelectionContext() { return { value: textarea.value, offset: textarea.selectionStart }; },
  };
}

function caretOffset(surface) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return (surface.textContent ?? '').length;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.startContainer)) return (surface.textContent ?? '').length;
  const before = range.cloneRange(); before.selectNodeContents(surface); before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function selectionOffsets(surface) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.startContainer) || !surface.contains(range.endContainer)) return null;
  const before = range.cloneRange(); before.selectNodeContents(surface); before.setEnd(range.startContainer, range.startOffset);
  return { start: before.toString().length, end: before.toString().length + range.toString().length, range };
}

export function isTextNodeEndAtOffset(node, offset) {
  return node?.nodeType === 3 && offset === (node.nodeValue ?? '').length;
}

function isAtNodeEnd(node, offset) {
  if (node?.nodeType === 3) return isTextNodeEndAtOffset(node, offset);
  return Number.isInteger(offset) && offset === (node?.childNodes?.length ?? 0);
}

function isInlineMark(node) {
  return node?.nodeType === 1 && ['STRONG', 'EM', 'CODE', 'A'].includes(node.tagName);
}

export function isAfterInlineBoundary(range, surface) {
  if (!range?.collapsed || !surface || !isAtNodeEnd(range.startContainer, range.startOffset)) return false;
  let node = range.startContainer;
  if (node === surface) return isInlineMark(surface.childNodes?.[range.startOffset - 1]);
  if (isInlineMark(node)) return true;
  while (node && node !== surface) {
    const parent = node.parentNode;
    if (!parent || node.nextSibling) return false;
    if (isInlineMark(parent)) return true;
    node = parent;
  }
  return false;
}

function setSurfaceSelection(surface, start, end = start) {
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  let cursor = 0; let startNode = null; let endNode = null; let startOffset = 0; let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode; const length = node.textContent.length;
    if (!startNode && start <= cursor + length) { startNode = node; startOffset = Math.max(0, start - cursor); }
    if (!endNode && end <= cursor + length) { endNode = node; endOffset = Math.max(0, end - cursor); break; }
    cursor += length;
  }
  if (!startNode) { surface.focus(); return; }
  const range = document.createRange(); range.setStart(startNode, startOffset); range.setEnd(endNode ?? startNode, endNode ? endOffset : startOffset);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); surface.focus();
}

function wrapInlineRange(inlines, start, end, type) {
  const [before, rest] = splitInlinesAtOffset(inlines, start);
  const [selected, after] = splitInlinesAtOffset(rest, Math.max(0, end - start));
  if (!selected.length) return inlines;
  const wrapper = type === 'link' ? { type: 'link', url: 'https://', inlines: selected } : { type, inlines: selected };
  return [...before, wrapper, ...after];
}

function findBlockAtPath(blocks, path) {
  let container = blocks;
  for (let index = 0; index < path.length; index += 1) {
    const block = container[path[index]];
    if (!block) return null;
    if (index === path.length - 1) return block;
    if (block.type !== 'quote') return null;
    container = block.blocks ?? [];
  }
  return null;
}

function updateBlockAtPath(blocks, path, updater) {
  const next = cloneBlocks(blocks);
  let container = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    const block = container[path[index]];
    if (!block || block.type !== 'quote') return next;
    container = block.blocks ?? [];
  }
  const index = path.at(-1);
  if (container[index]) container[index] = updater(container[index]);
  return next;
}

function updateListItemAtPath(blocks, path, updater) {
  const next = cloneBlocks(blocks);
  const visit = (block, rest) => {
    if (block?.type === 'quote') return visit(block.blocks?.[rest.shift()], rest);
    if (!block || !['list', 'taskList'].includes(block.type)) return;
    const item = block.items[rest.shift()];
    if (!item) return;
    if (!rest.length) { item.inlines = updater(item.inlines); return; }
    visit(item.children[rest.shift()], rest);
  };
  visit(next[path[0]], path.slice(1));
  return next;
}

function listLocation(blocks, path) {
  const descend = (block, container, containerIndex, rest, parent, blockPath) => {
    if (block?.type === 'quote') {
      const childIndex = rest.shift();
      return descend(block.blocks?.[childIndex], block.blocks ?? [], childIndex, rest, null, [...blockPath, childIndex]);
    }
    if (!block || !['list', 'taskList'].includes(block.type)) return null;
    const index = rest.shift(); const item = block.items[index];
    if (!item) return null;
    if (!rest.length) return { block, container, containerIndex, index, item, parent, blockPath };
    const childIndex = rest.shift();
    return descend(item.children[childIndex], item.children, childIndex, rest, {
      block,
      blockPath,
      index,
      item,
    }, [...blockPath, index, childIndex]);
  };
  return descend(blocks[path[0]], blocks, path[0], path.slice(1), null, [path[0]]);
}

function emptyListItem(item) { return !item.children.length && !inlineText(item.inlines); }

export function continueListItem(blocks, path) {
  const next = cloneBlocks(blocks); const location = listLocation(next, path);
  if (!location) return next;
  location.block.items.splice(location.index + 1, 0, location.block.type === 'taskList' ? { checked: false, inlines: [], children: [] } : { inlines: [], children: [] });
  return next;
}

export function exitEmptyListItem(blocks, path) {
  const next = cloneBlocks(blocks); const location = listLocation(next, path);
  if (!location || !emptyListItem(location.item)) return next;
  location.block.items.splice(location.index, 1);
  location.container.splice(location.containerIndex + 1, 0, { type: 'paragraph', inlines: [] });
  if (!location.block.items.length) location.container.splice(location.containerIndex, 1);
  return next;
}

export function indentListItem(blocks, path, direction) {
  const next = cloneBlocks(blocks); const location = listLocation(next, path);
  if (!location) return next;
  if (direction === 'in') {
    if (!location.index) return next;
    const previous = location.block.items[location.index - 1];
    let child = previous.children.find((entry) => entry.type === location.block.type);
    if (!child) { child = { type: location.block.type, ...(location.block.type === 'list' ? { ordered: location.block.ordered } : {}), items: [] }; previous.children.push(child); }
    child.items.push(location.block.items.splice(location.index, 1)[0]);
  } else if (location.parent) {
    location.block.items.splice(location.index, 1);
    location.parent.block.items.splice(location.parent.index + 1, 0, location.item);
    if (!location.block.items.length) location.parent.item.children.splice(location.containerIndex, 1);
  }
  return next;
}

export function listItemPathAfterIndent(blocks, path, direction) {
  const location = listLocation(blocks, path);
  if (!location) return path;
  if (direction === 'out') return location.parent ? [...location.parent.blockPath, location.parent.index + 1] : path;
  if (!location.index) return path;
  const previous = location.block.items[location.index - 1];
  const childIndex = previous.children.findIndex((entry) => entry.type === location.block.type);
  const nestedIndex = childIndex < 0 ? 0 : previous.children[childIndex].items.length;
  return [...location.blockPath, location.index - 1, childIndex < 0 ? previous.children.length : childIndex, nestedIndex];
}

const emptyParagraph = () => ({ type: 'paragraph', inlines: [] });
const selectionAt = (path, offset) => ({
  anchor: { path: [...path], offset },
  focus: { path: [...path], offset },
});

function samePath(first, second) {
  return first.length === second.length && first.every((part, index) => part === second[index]);
}

function collapsedSelection(selection) {
  return samePath(selection.anchor.path, selection.focus.path)
    && selection.anchor.offset === selection.focus.offset;
}

function blockLocationAtPath(blocks, path) {
  const visit = (container, index, remaining) => {
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

function listItemInlinesAtPath(blocks, path) {
  const visit = (block, remaining) => {
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

function elementFromNode(root, node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const target = element?.closest?.('[data-block-path]') ?? null;
  return target && root.contains(target) ? target : null;
}

function selectedElement(root) {
  return elementFromNode(root, root.ownerDocument.getSelection()?.focusNode ?? null);
}

function elementForPath(root, path) {
  const expected = path.join('.');
  return Array.from(root.querySelectorAll('[data-block-path]'))
    .find((element) => element.dataset.blockPath === expected) ?? null;
}

export function toolbarSelection(live, remembered) {
  return remembered ?? live;
}

function rootWideSelection(root, blocks) {
  const browserSelection = root.ownerDocument.getSelection();
  if (!browserSelection?.rangeCount || !blocks.length) return null;
  const range = browserSelection.getRangeAt(0);
  if (range.startContainer !== root || range.startOffset !== 0
    || range.endContainer !== root || range.endOffset !== root.childNodes.length) return null;
  const last = blocks.at(-1);
  return {
    anchor: { path: [0], offset: 0 },
    focus: {
      path: [blocks.length - 1],
      offset: last?.type === 'paragraph' || last?.type === 'heading' ? inlineText(last.inlines).length : 0,
    },
  };
}

function logicalSelection(root, blocks) {
  return readEditorSelection(root) ?? rootWideSelection(root, blocks);
}

function textSelectionRange(blocks, selection) {
  const anchor = blockLocationAtPath(blocks, selection.anchor.path);
  const focus = blockLocationAtPath(blocks, selection.focus.path);
  if (!anchor || !focus || anchor.container !== focus.container
    || !['paragraph', 'heading'].includes(anchor.block.type)
    || !['paragraph', 'heading'].includes(focus.block.type)) return null;
  const anchorFirst = anchor.index < focus.index
    || (anchor.index === focus.index && selection.anchor.offset <= selection.focus.offset);
  const start = anchorFirst
    ? { ...anchor, path: selection.anchor.path, offset: selection.anchor.offset }
    : { ...focus, path: selection.focus.path, offset: selection.focus.offset };
  const end = anchorFirst
    ? { ...focus, path: selection.focus.path, offset: selection.focus.offset }
    : { ...anchor, path: selection.anchor.path, offset: selection.anchor.offset };
  if (start.container.slice(start.index, end.index + 1).some((block) => !['paragraph', 'heading'].includes(block.type))) return null;
  return { start, end };
}

function ensureParagraphAfterBlockLocal(blocks, path) {
  const next = cloneBlocks(blocks);
  const location = blockLocationAtPath(next, path);
  if (!location) return { blocks: next, nextPath: path };
  if (location.container[location.index + 1]?.type !== 'paragraph') {
    location.container.splice(location.index + 1, 0, emptyParagraph());
  }
  return { blocks: next, nextPath: [...path.slice(0, -1), location.index + 1] };
}

function replaceListItemSelectionLocal(blocks, selection, markdown) {
  const anchor = listLocation(blocks, selection.anchor.path);
  const focus = listLocation(blocks, selection.focus.path);
  if (!anchor || !focus || anchor.block.items !== focus.block.items || anchor.index !== focus.index) return null;

  const next = cloneBlocks(blocks);
  const location = listLocation(next, selection.anchor.path);
  if (!location) return null;
  const start = Math.min(selection.anchor.offset, selection.focus.offset);
  const end = Math.max(selection.anchor.offset, selection.focus.offset);
  const [before] = splitInlinesAtOffset(location.item.inlines, start);
  const [, after] = splitInlinesAtOffset(location.item.inlines, end);
  const pasted = parseMarkdown(markdown);
  const itemPath = [...selection.anchor.path];

  if (!pasted.length) {
    location.item.inlines = mergeInlines([...before, ...after]);
    return { blocks: next, nextSelection: selectionAt(itemPath, inlineText(before).length), handled: true };
  }

  if (pasted.every((block) => ['paragraph', 'heading'].includes(block.type))) {
    const items = pasted.map((block, index) => ({
      ...location.item,
      inlines: mergeInlines([
        ...(index === 0 ? before : []),
        ...block.inlines,
        ...(index === pasted.length - 1 ? after : []),
      ]),
      children: index === 0 ? location.item.children : [],
    }));
    location.block.items.splice(location.index, 1, ...items);
    const caretIndex = location.index + pasted.length - 1;
    itemPath[itemPath.length - 1] = caretIndex;
    const caretOffset = (pasted.length === 1 ? inlineText(before).length : 0)
      + inlineText(pasted.at(-1).inlines).length;
    return { blocks: next, nextSelection: selectionAt(itemPath, caretOffset), handled: true };
  }

  const leftItem = { ...location.item, inlines: before };
  const rightItem = { ...location.item, inlines: after, children: cloneBlocks(pasted) };
  location.block.items.splice(location.index, 1, leftItem, rightItem);
  itemPath[itemPath.length - 1] = location.index + 1;
  return { blocks: next, nextSelection: selectionAt(itemPath, 0), handled: true };
}

function replaceLogicalSelection(blocks, selection, markdown) {
  const listReplacement = replaceListItemSelectionLocal(blocks, selection, markdown);
  if (listReplacement) return listReplacement;

  const range = textSelectionRange(blocks, selection);
  if (range) {
    const next = cloneBlocks(blocks);
    const nextRange = textSelectionRange(next, selection);
    const [before] = splitInlinesAtOffset(nextRange.start.block.inlines, Math.max(0, nextRange.start.offset));
    const [, after] = splitInlinesAtOffset(nextRange.end.block.inlines, Math.max(0, nextRange.end.offset));
    const pasted = parseMarkdown(markdown);
    if (pasted.length === 1 && pasted[0].type === 'paragraph') {
      const inlines = mergeInlines([...before, ...pasted[0].inlines, ...after]);
      nextRange.start.container.splice(nextRange.start.index, nextRange.end.index - nextRange.start.index + 1, {
        ...nextRange.start.block,
        inlines,
      });
      return {
        blocks: next,
        nextSelection: selectionAt(nextRange.start.path, inlineText(before).length + inlineText(pasted[0].inlines).length),
        handled: true,
      };
    }

    const replacement = [];
    if (before.length) replacement.push({ ...nextRange.start.block, inlines: before });
    replacement.push(...pasted);
    if (after.length) replacement.push({ ...nextRange.end.block, inlines: after });
    if (!replacement.length) replacement.push(emptyParagraph());
    const insertionIndex = nextRange.start.index + (before.length ? 1 : 0);
    nextRange.start.container.splice(
      nextRange.start.index,
      nextRange.end.index - nextRange.start.index + 1,
      ...replacement,
    );
    const selectedBlock = pasted.at(-1) ?? replacement[0];
    const selectedIndex = pasted.length ? insertionIndex + pasted.length - 1 : nextRange.start.index;
    const selectedPath = [...nextRange.start.path.slice(0, -1), selectedIndex];
    if (pasted.length && !['paragraph', 'heading'].includes(selectedBlock.type)) {
      const continued = ensureParagraphAfterBlockLocal(next, selectedPath);
      return { blocks: continued.blocks, nextSelection: selectionAt(continued.nextPath, 0), handled: true };
    }
    return {
      blocks: next,
      nextSelection: selectionAt(
        selectedPath,
        pasted.length ? inlineText(selectedBlock.inlines).length : inlineText(before).length,
      ),
      handled: true,
    };
  }

  const anchorTop = selection?.anchor?.path?.[0];
  const focusTop = selection?.focus?.path?.[0];
  if (!Number.isInteger(anchorTop) || !Number.isInteger(focusTop)
    || !blocks[anchorTop] || !blocks[focusTop]) {
    return { blocks: cloneBlocks(blocks), nextSelection: selection, handled: false };
  }
  const next = cloneBlocks(blocks);
  const startIndex = Math.min(anchorTop, focusTop);
  const endIndex = Math.max(anchorTop, focusTop);
  const pasted = parseMarkdown(markdown);
  const replacement = pasted.length ? pasted : [emptyParagraph()];
  next.splice(startIndex, endIndex - startIndex + 1, ...replacement);
  const selectedIndex = startIndex + replacement.length - 1;
  const selected = replacement.at(-1);
  if (!['paragraph', 'heading'].includes(selected.type)) {
    const continued = ensureParagraphAfterBlockLocal(next, [selectedIndex]);
    return { blocks: continued.blocks, nextSelection: selectionAt(continued.nextPath, 0), handled: true };
  }
  return {
    blocks: next,
    nextSelection: selectionAt([selectedIndex], inlineText(selected.inlines).length),
    handled: true,
  };
}

function splitListItemAtSelectionLocal(blocks, selection) {
  if (!collapsedSelection(selection)) return { blocks: cloneBlocks(blocks), handled: false };
  const next = cloneBlocks(blocks);
  const location = listLocation(next, selection.anchor.path);
  if (!location) return { blocks: next, handled: false };
  const [left, right] = splitInlinesAtOffset(location.item.inlines, selection.anchor.offset);
  const nextItem = location.block.type === 'taskList'
    ? { checked: false, inlines: right, children: [] }
    : { inlines: right, children: [] };
  location.item.inlines = left;
  location.block.items.splice(location.index + 1, 0, nextItem);
  const nextPath = [...selection.anchor.path];
  nextPath[nextPath.length - 1] += 1;
  return { blocks: next, nextSelection: selectionAt(nextPath, 0), handled: true };
}

function deleteAtSelection(blocks, selection, direction) {
  if (!collapsedSelection(selection)) {
    const replaced = replaceLogicalSelection(blocks, selection, '');
    return { ...replaced, changed: replaced.handled };
  }
  const next = cloneBlocks(blocks);
  const location = blockLocationAtPath(next, selection.anchor.path);
  if (!location || !['paragraph', 'heading'].includes(location.block.type)) {
    return { blocks: next, nextSelection: selection, changed: false };
  }
  if (direction === 'backward' && selection.anchor.offset === 0) {
    const previous = location.container[location.index - 1];
    if (location.block.type === 'paragraph' && previous?.type === 'table') {
      location.container.splice(location.index - 1, 1);
      return {
        blocks: next,
        nextSelection: selectionAt([...selection.anchor.path.slice(0, -1), location.index - 1], 0),
        changed: true,
      };
    }
    if (location.block.type === 'paragraph' && previous?.type === 'paragraph') {
      const offset = inlineText(previous.inlines).length;
      previous.inlines = mergeInlines([...previous.inlines, ...location.block.inlines]);
      location.container.splice(location.index, 1);
      return {
        blocks: next,
        nextSelection: selectionAt([...selection.anchor.path.slice(0, -1), location.index - 1], offset),
        changed: true,
      };
    }
  }
  if (direction === 'forward' && selection.anchor.offset === inlineText(location.block.inlines).length) {
    const following = location.container[location.index + 1];
    if (location.block.type === 'paragraph' && following?.type === 'paragraph') {
      location.block.inlines = mergeInlines([...location.block.inlines, ...following.inlines]);
      location.container.splice(location.index + 1, 1);
      return { blocks: next, nextSelection: selection, changed: true };
    }
  }
  return { blocks: next, nextSelection: selection, changed: false };
}

/**
 * Mount the native block editor while preserving the textarea as the public
 * compatibility source for forms, auto-grow listeners, and external callers.
 */
export function mountMarkdownEditor(textarea, { mode, onChange, onEmptyParagraphEnter } = {}) {
  if (!textarea?.parentNode) throw new TypeError('mountMarkdownEditor requires a connected textarea');
  if (mode === 'simple') return mountSimpleMarkdownEditor(textarea, onChange, onEmptyParagraphEnter);
  const editorMode = normalizeMarkdownEditorMode(mode);
  const parent = textarea.parentNode;
  const marker = document.createComment('markdown-editor');
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-editor';
  wrapper.dataset.editorMode = editorMode;
  wrapper.classList.toggle('is-source', editorMode === 'source');
  parent.insertBefore(marker, textarea);
  parent.insertBefore(wrapper, textarea);
  wrapper.appendChild(textarea);
  let blocks = blocksFromMarkdown(textarea.value);
  let content = null;
  let composing = false;
  let emitting = false;
  let rememberedSelection = null;
  let submitOnNextEmptyEnterPath = null;
  const clearPendingEmptyEnter = () => { submitOnNextEmptyEnterPath = null; };
  const removeDoubleEnterSubmit = editorMode === 'source'
    ? bindDoubleEnterSubmit(textarea, onEmptyParagraphEnter)
    : () => {};

  const emit = () => {
    textarea.value = serializeMarkdown(blocks);
    emitting = true;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    emitting = false;
    onChange?.(textarea.value);
  };
  const refresh = () => { if (content) renderEditableBlocks(content, blocks); };
  const renderRoot = (selection) => {
    refresh();
    if (!content || !selection) return;
    requestAnimationFrame(() => {
      content.focus();
      restoreEditorSelection(content, selection);
    });
  };
  const commitBlocks = (next, { render = true, selection } = {}) => {
    blocks = next;
    if (selection) rememberedSelection = selection;
    emit();
    if (render) renderRoot(selection);
  };
  const onTextareaInput = () => {
    if (emitting || editorMode === 'source') return;
    const nextValue = textarea.value;
    if (nextValue === serializeMarkdown(blocks)) return;
    blocks = blocksFromMarkdown(nextValue);
    rememberedSelection = null;
    refresh();
  };
  const rememberSelection = () => {
    const selection = content ? logicalSelection(content, blocks) : null;
    rememberedSelection = selection;
    return selection;
  };
  const applyInlineCommand = (command) => {
    if (!content) return;
    const selection = toolbarSelection(logicalSelection(content, blocks), rememberedSelection);
    const element = selection ? elementForPath(content, selection.focus.path) : selectedElement(content);
    const path = selection?.focus.path ?? (element ? blockPathForNode(element) : null);
    if (!element || !selection || !path || !samePath(selection.anchor.path, selection.focus.path)) return;
    const start = Math.min(selection.anchor.offset, selection.focus.offset);
    const end = Math.max(selection.anchor.offset, selection.focus.offset);
    const update = (inlines) => wrapInlineRange(inlines, start, end, command);
    const next = cloneBlocks(blocks);
    if (element.tagName === 'LI') {
      const location = listLocation(next, path);
      if (!location) return;
      location.item.inlines = update(location.item.inlines);
    } else if (element.tagName === 'TH' || element.tagName === 'TD') {
      const location = blockLocationAtPath(next, path);
      if (location?.block.type !== 'table') return;
      const rowElement = element.parentElement;
      const sectionElement = rowElement?.parentElement;
      const column = rowElement ? Array.from(rowElement.children).indexOf(element) : -1;
      const row = sectionElement?.tagName === 'TBODY' && rowElement
        ? Array.from(sectionElement.children).indexOf(rowElement)
        : 0;
      const cells = sectionElement?.tagName === 'THEAD' ? location.block.header : location.block.rows[row];
      if (!cells?.[column]) return;
      cells[column] = update(cells[column]);
    } else {
      const location = blockLocationAtPath(next, path);
      if (!location || !['paragraph', 'heading'].includes(location.block.type)) return;
      location.block.inlines = update(location.block.inlines);
    }
    commitBlocks(next, {
      selection: {
        anchor: { path, offset: start },
        focus: { path, offset: end },
      },
    });
  };
  const applyCommand = (command) => {
    if (!content) return;
    const selection = toolbarSelection(logicalSelection(content, blocks), rememberedSelection);
    const path = selection?.focus.path ?? [0];
    const next = cloneBlocks(blocks);
    const location = blockLocationAtPath(next, path);
    if (!location || !['paragraph', 'heading'].includes(location.block.type)) return;
    const inlines = location.block.inlines;
    location.container[location.index] = (() => {
      if (command === 'paragraph') return { type: 'paragraph', inlines };
      if (command === 'heading') return { type: 'heading', level: 2, inlines };
      if (command === 'unordered-list') return { type: 'list', ordered: false, items: [{ inlines, children: [] }] };
      if (command === 'ordered-list') return { type: 'list', ordered: true, items: [{ inlines, children: [] }] };
      if (command === 'todo') return { type: 'taskList', items: [{ checked: false, inlines, children: [] }] };
      if (command === 'quote') return { type: 'quote', blocks: [{ type: 'paragraph', inlines }] };
      if (command === 'code') return { type: 'codeBlock', value: inlineText(inlines) };
      if (command === 'table') return { type: 'table', header: [textInlines('Column 1'), textInlines('Column 2')], alignments: ['left', 'left'], rows: [[[], []]] };
      return { type: 'horizontalRule' };
    })();
    if (command === 'table' || command === 'rule') {
      const continued = ensureParagraphAfterBlockLocal(next, path);
      commitBlocks(continued.blocks, { selection: selectionAt(continued.nextPath, 0) });
      return;
    }
    const changed = location.container[location.index];
    const nextPath = ['list', 'taskList', 'quote'].includes(changed.type) ? [...path, 0] : path;
    commitBlocks(next, { selection: selectionAt(nextPath, 0) });
  };
  const onClick = (event) => {
    const button = event.target.closest?.('[data-markdown-command]');
    if (button && wrapper.contains(button)) {
      event.preventDefault();
      if (['bold', 'italic', 'link'].includes(button.dataset.markdownCommand)) applyInlineCommand(button.dataset.markdownCommand === 'bold' ? 'strong' : button.dataset.markdownCommand === 'italic' ? 'emphasis' : 'link');
      else applyCommand(button.dataset.markdownCommand);
      return;
    }
    if (event.target.closest?.('a') && !event.metaKey && !event.ctrlKey) event.preventDefault();
  };
  const onInput = (event) => {
    if (!content || !content.contains(event.target) || composing || event.target.closest?.('[data-markdown-editor-task="true"]')) return;
    clearPendingEmptyEnter();
    blocks = readEditableBlocks(content, [{ type: 'paragraph', inlines: [] }]);
    const selection = logicalSelection(content, blocks);
    const path = selection?.focus.path;
    const location = path ? blockLocationAtPath(blocks, path) : null;
    const converted = location && ['paragraph', 'heading'].includes(location.block.type)
      ? markdownShortcutToBlock(inlineText(location.block.inlines))
      : null;
    if (location && converted) {
      location.container[location.index] = converted;
      const nextPath = ['list', 'taskList', 'quote'].includes(converted.type) ? [...path, 0] : path;
      commitBlocks(blocks, { selection: selectionAt(nextPath, 0) });
      return;
    }
    emit();
  };
  const replaceSelection = (markdown, allowCollapsed = false) => {
    if (!content) return false;
    const selection = logicalSelection(content, blocks);
    if (!selection || (collapsedSelection(selection) && !allowCollapsed)) return false;
    const result = replaceLogicalSelection(blocks, selection, markdown);
    if (!result.handled) return false;
    commitBlocks(result.blocks, { selection: result.nextSelection });
    return true;
  };
  const onPaste = (event) => {
    if (!content || !content.contains(event.target) || composing || event.isComposing) return;
    clearPendingEmptyEnter();
    const markdown = event.clipboardData?.getData('text/plain')?.replace(/\r\n?/g, '\n');
    if (!markdown) return;
    const selection = logicalSelection(content, blocks);
    if ((!markdown.includes('\n') && (!selection || collapsedSelection(selection)))
      || !replaceSelection(markdown, markdown.includes('\n'))) return;
    event.preventDefault();
  };
  const onComposition = (event) => {
    clearPendingEmptyEnter();
    composing = event.type === 'compositionstart';
    if (event.type === 'compositionend' && content) {
      composing = false;
      blocks = readEditableBlocks(content, [emptyParagraph()]);
      emit();
    }
  };
  const handleEnter = ({ allowSubmit = false, armSubmit = false } = {}) => {
    if (!content) return false;
    const element = selectedElement(content);
    const selection = logicalSelection(content, blocks);
    const path = selection?.focus.path ?? (element ? blockPathForNode(element) : null);
    if (!element || !path) return false;
    if (element.tagName === 'TH' || element.tagName === 'TD') {
      const continued = ensureParagraphAfterBlockLocal(blocks, path);
      commitBlocks(continued.blocks, { selection: selectionAt(continued.nextPath, 0) });
      return true;
    }
    if (element.tagName === 'LI') {
      const inlines = listItemInlinesAtPath(blocks, path);
      if (!inlines) return false;
      if (!inlineText(inlines).trim()) {
        const next = exitEmptyListItem(blocks, path);
        commitBlocks(next, { selection: selectionAt(path, 0) });
        return true;
      }
      if (!selection) return false;
      const split = splitListItemAtSelectionLocal(blocks, selection);
      if (!split.handled) return false;
      commitBlocks(split.blocks, { selection: split.nextSelection });
      return true;
    }
    if (!selection || !collapsedSelection(selection)) return false;
    const location = blockLocationAtPath(blocks, selection.focus.path);
    if (!location || !['paragraph', 'heading'].includes(location.block.type)) return false;
    if (allowSubmit && location.block.type === 'paragraph' && !inlineText(location.block.inlines).trim()
      && submitOnNextEmptyEnterPath && samePath(selection.focus.path, submitOnNextEmptyEnterPath)
      && onEmptyParagraphEnter) {
      clearPendingEmptyEnter();
      onEmptyParagraphEnter();
      return true;
    }
    const createsEmptyTrailingParagraph = armSubmit
      && selection.focus.offset === inlineText(location.block.inlines).length;
    const split = splitTextBlockAtOffset(blocks, selection.focus.path, selection.focus.offset);
    commitBlocks(split.blocks, { selection: selectionAt(split.nextPath, 0) });
    submitOnNextEmptyEnterPath = createsEmptyTrailingParagraph ? split.nextPath : null;
    return true;
  };
  const handleDelete = (direction) => {
    if (!content) return false;
    const selection = logicalSelection(content, blocks);
    if (!selection) return false;
    const result = deleteAtSelection(blocks, selection, direction);
    if (!result.changed) return false;
    commitBlocks(result.blocks, { selection: result.nextSelection });
    return true;
  };
  const onBeforeInput = (event) => {
    if (!content || !content.contains(event.target) || composing || event.isComposing) return;
    if (event.inputType === 'insertParagraph' && handleEnter()) {
      event.preventDefault();
      return;
    }
    if (event.inputType === 'deleteContentBackward' && handleDelete('backward')) {
      event.preventDefault();
      return;
    }
    if (event.inputType === 'deleteContentForward' && handleDelete('forward')) {
      event.preventDefault();
      return;
    }
    if (event.inputType === 'insertText' && event.data && replaceSelection(event.data)) event.preventDefault();
  };
  const onKeyDown = (event) => {
    if (!content || !content.contains(event.target)) return;
    if (composing || event.isComposing || event.keyCode === 229) { clearPendingEmptyEnter(); return; }
    const plainEnter = event.key === 'Enter'
      && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat;
    if (!plainEnter) clearPendingEmptyEnter();
    if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'k'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      applyInlineCommand(event.key.toLowerCase() === 'b' ? 'strong' : event.key.toLowerCase() === 'i' ? 'emphasis' : 'link');
      return;
    }
    const element = selectedElement(content);
    const path = element ? blockPathForNode(element) : null;
    if (event.key === 'Tab' && element?.tagName === 'LI' && path) {
      event.preventDefault();
      const direction = event.shiftKey ? 'out' : 'in';
      const nextPath = listItemPathAfterIndent(blocks, path, direction);
      commitBlocks(indentListItem(blocks, path, direction), { selection: selectionAt(nextPath, 0) });
      return;
    }
    if (event.key === 'Enter' && handleEnter({ allowSubmit: plainEnter, armSubmit: plainEnter })) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Backspace' && handleDelete('backward')) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Delete' && handleDelete('forward')) event.preventDefault();
  };
  const onMouseDown = (event) => {
    clearPendingEmptyEnter();
    if (!event.target.closest?.('[data-markdown-command]')) return;
    rememberSelection();
    event.preventDefault();
  };
  const onTaskChange = (event) => {
    const checkbox = event.target.closest?.('[data-markdown-editor-task="true"]');
    if (!checkbox || !content?.contains(checkbox)) return;
    const path = parsePath(checkbox.dataset.markdownTaskPath);
    if (!path) return;
    try {
      blocks = toggleTaskItem(blocks, path);
      emit();
    } catch {
      // Ignore stale task paths from a browser event queued before a sync.
    }
  };

  if (editorMode === 'toolbar') {
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-editor-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Markdown editor');
    [['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['link', '↗', 'Link'], ['paragraph', 'P', 'Paragraph'], ['heading', 'H2', 'Heading'], ['unordered-list', '•', 'List'], ['ordered-list', '1.', 'Ordered list'], ['todo', '☐', 'Todo'], ['quote', '❞', 'Quote'], ['code', '</>', 'Code'], ['table', '▦', 'Table'], ['rule', '—', 'Rule']].forEach(([command, label, title]) => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.markdownCommand = command; button.title = title; button.setAttribute('aria-label', title); button.textContent = label; toolbar.appendChild(button);
    });
    content = document.createElement('div'); content.className = 'markdown-editor-content'; content.dataset.markdownEditorRoot = 'true';
    wrapper.append(toolbar, content); refresh();
    wrapper.addEventListener('click', onClick);
    wrapper.addEventListener('mousedown', onMouseDown);
    wrapper.addEventListener('change', onTaskChange);
    wrapper.addEventListener('beforeinput', onBeforeInput);
    wrapper.addEventListener('input', onInput);
    wrapper.addEventListener('compositionstart', onComposition);
    wrapper.addEventListener('compositionend', onComposition);
    wrapper.addEventListener('keydown', onKeyDown);
    wrapper.addEventListener('paste', onPaste);
    textarea.addEventListener('input', onTextareaInput);
  }

  return {
    destroy() {
      wrapper.removeEventListener('click', onClick); wrapper.removeEventListener('mousedown', onMouseDown); wrapper.removeEventListener('change', onTaskChange); wrapper.removeEventListener('beforeinput', onBeforeInput); wrapper.removeEventListener('input', onInput);
      wrapper.removeEventListener('compositionstart', onComposition); wrapper.removeEventListener('compositionend', onComposition); wrapper.removeEventListener('keydown', onKeyDown);
      wrapper.removeEventListener('paste', onPaste);
      textarea.removeEventListener('input', onTextareaInput);
      removeDoubleEnterSubmit();
      restoreTextareaFromEditor(marker, wrapper, textarea);
    },
    focus() { if (editorMode === 'source') textarea.focus(); else content?.focus(); },
    sync() {
      if (editorMode === 'toolbar') { blocks = blocksFromMarkdown(textarea.value); refresh(); }
    },
    insertText(text) {
      if (!text) return;
      if (editorMode === 'source') {
        const start = textarea.selectionStart; const end = textarea.selectionEnd;
        textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
        textarea.setSelectionRange(start + text.length, start + text.length);
        textarea.dispatchEvent(new Event('input', { bubbles: true })); onChange?.(textarea.value); return;
      }
      if (replaceSelection(text)) return;
      if (!content) return;
      const selection = logicalSelection(content, blocks);
      const target = selectedElement(content);
      const path = target ? blockPathForNode(target) : null;
      if (!selection || !target || !path || !samePath(selection.anchor.path, selection.focus.path)) return;
      const start = Math.min(selection.anchor.offset, selection.focus.offset);
      const end = Math.max(selection.anchor.offset, selection.focus.offset);
      const range = content.ownerDocument.getSelection()?.rangeCount
        ? content.ownerDocument.getSelection().getRangeAt(0)
        : null;
      const update = (inlines) => insertInlineTextAtSelection(inlines, start, end, text, { range, surface: target });
      const next = cloneBlocks(blocks);
      if (target.tagName === 'LI') {
        const location = listLocation(next, path);
        if (!location) return;
        location.item.inlines = update(location.item.inlines);
      } else if (target.tagName === 'TH' || target.tagName === 'TD') {
        const location = blockLocationAtPath(next, path);
        if (location?.block.type !== 'table') return;
        const rowElement = target.parentElement;
        const sectionElement = rowElement?.parentElement;
        const column = rowElement ? Array.from(rowElement.children).indexOf(target) : -1;
        const row = sectionElement?.tagName === 'TBODY' && rowElement
          ? Array.from(sectionElement.children).indexOf(rowElement)
          : 0;
        const cells = sectionElement?.tagName === 'THEAD' ? location.block.header : location.block.rows[row];
        if (!cells?.[column]) return;
        cells[column] = update(cells[column]);
      } else {
        const location = blockLocationAtPath(next, path);
        if (!location || !['paragraph', 'heading'].includes(location.block.type)) return;
        location.block.inlines = update(location.block.inlines);
      }
      commitBlocks(next, { selection: selectionAt(path, start + text.length) });
    },
  };
}
