import { isSafeUrl } from '../../shared/markdown/parser.js';
import type { Block, EditorPoint, EditorSelection, Inline, TableAlignment } from '../../shared/markdown/index.js';

const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'TABLE', 'HR']);

export function renderEditableBlocks(root: HTMLElement, blocks: Block[]): void {
  root.contentEditable = 'true';
  root.textContent = '';
  root.append(...blocks.map((block, index) => renderBlock(root.ownerDocument, block, [index])));
}

export function readEditableBlocks(root: HTMLElement, fallback: Block[]): Block[] {
  const children = elementChildren(root);
  if (!children.length) return fallback;
  return children.map(readBlock).filter((block): block is Block => block !== null);
}

export function readEditorSelection(root: HTMLElement): EditorSelection | null {
  const selection = root.ownerDocument?.getSelection?.() ?? globalThis.window?.getSelection?.();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const anchor = pointFromBoundary(root, selection.anchorNode ?? range.startContainer, selection.anchorOffset ?? range.startOffset);
  const focus = pointFromBoundary(root, selection.focusNode ?? range.endContainer, selection.focusOffset ?? range.endOffset);
  return anchor && focus ? { anchor, focus } : null;
}

export function restoreEditorSelection(root: HTMLElement, selection: EditorSelection): void {
  const ownerDocument = root.ownerDocument;
  const browserSelection = ownerDocument?.getSelection?.() ?? globalThis.window?.getSelection?.();
  if (!ownerDocument || !browserSelection) return;

  const anchorBlock = findBlockElement(root, selection.anchor.path) ?? findNearestParagraph(root, selection.anchor.path);
  const focusBlock = findBlockElement(root, selection.focus.path) ?? findNearestParagraph(root, selection.focus.path);
  if (!anchorBlock || !focusBlock) return;

  const anchor = textBoundary(anchorBlock, selection.anchor.offset);
  const focus = textBoundary(focusBlock, selection.focus.offset);
  if (!anchor || !focus) return;

  if (typeof browserSelection.setBaseAndExtent === 'function') {
    browserSelection.removeAllRanges();
    browserSelection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return;
  }

  const range = ownerDocument.createRange();
  range.setStart(anchor.node, anchor.offset);
  range.setEnd(focus.node, focus.offset);
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
}

export function blockPathForNode(node: Node): number[] | null {
  const element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
  const block = element?.closest?.('[data-block-path]') as HTMLElement | null | undefined;
  return parsePath(block?.dataset.blockPath);
}

export function inlineValueFromDom(node: Node): Inline[] {
  if (node.nodeType === 3) return textInlines(node.textContent ?? '');
  if (node.nodeType !== 1) return [];

  const element = node as HTMLElement;
  const inlines = inlineChildren(element);
  if (element.tagName === 'STRONG') return [{ type: 'strong', inlines }];
  if (element.tagName === 'EM') return [{ type: 'emphasis', inlines }];
  if (element.tagName === 'CODE') return [{ type: 'code', inlines: element.textContent ?? '' }];
  if (element.tagName === 'A' && isSafeUrl((element as HTMLAnchorElement).href)) {
    return [{ type: 'link', url: (element as HTMLAnchorElement).href, inlines }];
  }
  return inlines;
}

function renderBlock(ownerDocument: Document, block: Block, path: number[]): HTMLElement {
  switch (block.type) {
    case 'paragraph': {
      const element = blockElement(ownerDocument, 'p', path);
      appendInlines(ownerDocument, element, block.inlines);
      return element;
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, block.level ?? 1));
      const element = blockElement(ownerDocument, `h${level}`, path);
      appendInlines(ownerDocument, element, block.inlines);
      return element;
    }
    case 'quote': {
      const element = blockElement(ownerDocument, 'blockquote', path);
      element.append(...(block.blocks ?? []).map((child, index) => renderBlock(ownerDocument, child, [...path, index])));
      return element;
    }
    case 'codeBlock': {
      const pre = blockElement(ownerDocument, 'pre', path);
      const code = ownerDocument.createElement('code');
      code.textContent = block.value ?? '';
      if (block.language) pre.dataset.markdownLanguage = block.language;
      pre.append(code);
      return pre;
    }
    case 'list':
      return renderList(ownerDocument, block, path);
    case 'taskList':
      return renderTaskList(ownerDocument, block, path);
    case 'table':
      return renderTable(ownerDocument, block, path);
    case 'horizontalRule':
      return blockElement(ownerDocument, 'hr', path);
  }
}

function renderList(ownerDocument: Document, block: Extract<Block, { type: 'list' }>, path: number[]): HTMLElement {
  const list = blockElement(ownerDocument, block.ordered ? 'ol' : 'ul', path);
  block.items.forEach((item, index) => {
    const itemPath = [...path, index];
    const element = blockElement(ownerDocument, 'li', itemPath);
    appendInlines(ownerDocument, element, item.inlines);
    element.append(...item.children.map((child, childIndex) => renderBlock(ownerDocument, child, [...itemPath, childIndex])));
    list.append(element);
  });
  return list;
}

function renderTaskList(ownerDocument: Document, block: Extract<Block, { type: 'taskList' }>, path: number[]): HTMLElement {
  const list = blockElement(ownerDocument, 'ul', path);
  list.className = 'markdown-editor-block markdown-task-list';
  list.dataset.blockType = 'task-list';
  block.items.forEach((item, index) => {
    const itemPath = [...path, index];
    const element = blockElement(ownerDocument, 'li', itemPath);
    const checkbox = ownerDocument.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.checked;
    checkbox.contentEditable = 'false';
    checkbox.dataset.markdownEditorTask = 'true';
    checkbox.dataset.markdownTaskPath = formatPath(itemPath);
    checkbox.ariaLabel = `Toggle task ${inlineText(item.inlines)} (${formatPath(itemPath)})`;
    element.append(checkbox);
    appendInlines(ownerDocument, element, item.inlines);
    element.append(...item.children.map((child, childIndex) => renderBlock(ownerDocument, child, [...itemPath, childIndex])));
    list.append(element);
  });
  return list;
}

function renderTable(ownerDocument: Document, block: Extract<Block, { type: 'table' }>, path: number[]): HTMLElement {
  const table = blockElement(ownerDocument, 'table', path);
  const head = ownerDocument.createElement('thead');
  const headerRow = ownerDocument.createElement('tr');
  block.header.forEach((cell, column) => {
    headerRow.append(renderTableCell(ownerDocument, 'th', cell, block.alignments[column] ?? 'left', path));
  });
  head.append(headerRow);

  const body = ownerDocument.createElement('tbody');
  block.rows.forEach((row) => {
    const rowElement = ownerDocument.createElement('tr');
    block.header.forEach((_, column) => {
      rowElement.append(renderTableCell(ownerDocument, 'td', row[column] ?? [], block.alignments[column] ?? 'left', path));
    });
    body.append(rowElement);
  });
  table.append(head, body);
  return table;
}

function renderTableCell(ownerDocument: Document, tagName: 'th' | 'td', inlines: Inline[], alignment: TableAlignment, path: number[]): HTMLElement {
  const cell = blockElement(ownerDocument, tagName, path);
  cell.dataset.tableAlignment = alignment;
  appendInlines(ownerDocument, cell, inlines);
  return cell;
}

function appendInlines(ownerDocument: Document, parent: HTMLElement, inlines: Inline[]): void {
  inlines.forEach((inline) => {
    if (inline.type === 'text') {
      parent.append(inline.value);
      return;
    }
    const tagName = inline.type === 'strong' ? 'strong' : inline.type === 'emphasis' ? 'em' : inline.type === 'code' ? 'code' : 'a';
    const element = ownerDocument.createElement(tagName);
    if (inline.type === 'link') {
      if (!isSafeUrl(inline.url)) {
        appendInlines(ownerDocument, parent, inline.inlines);
        return;
      }
      const link = element as HTMLAnchorElement;
      link.href = inline.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    if (inline.type === 'code' && typeof inline.inlines === 'string') element.textContent = inline.inlines;
    else appendInlines(ownerDocument, element, inline.inlines as Inline[]);
    parent.append(element);
  });
}

function readBlock(element: HTMLElement): Block | null {
  const tagName = element.tagName;
  if (tagName === 'P') return { type: 'paragraph', inlines: inlineValueFromDom(element) };
  if (/^H[1-6]$/.test(tagName)) return { type: 'heading', level: Number(tagName.slice(1)), inlines: inlineValueFromDom(element) };
  if (tagName === 'BLOCKQUOTE') return { type: 'quote', blocks: readChildBlocks(element) };
  if (tagName === 'PRE') return {
    type: 'codeBlock',
    value: element.querySelector('code')?.textContent ?? element.textContent ?? '',
    ...(element.dataset.markdownLanguage ? { language: element.dataset.markdownLanguage } : {}),
  };
  if (tagName === 'UL' || tagName === 'OL') return readList(element);
  if (tagName === 'TABLE') return readTable(element);
  if (tagName === 'HR') return { type: 'horizontalRule' };
  return { type: 'paragraph', inlines: inlineValueFromDom(element) };
}

function readList(element: HTMLElement): Extract<Block, { type: 'list' | 'taskList' }> {
  const task = element.dataset.blockType === 'task-list';
  const items = elementChildren(element).filter((child) => child.tagName === 'LI').map((item) => {
    const children = readChildBlocks(item);
    const inlines = inlineChildren(item, true);
    const checkbox = item.querySelector('input') as HTMLInputElement | null;
    return task
      ? { checked: Boolean(checkbox?.checked), inlines, children }
      : { inlines, children };
  });
  return task ? { type: 'taskList', items } : { type: 'list', ordered: element.tagName === 'OL', items };
}

function readTable(table: HTMLElement): Extract<Block, { type: 'table' }> {
  const headerRow = table.querySelector('thead')?.querySelector('tr');
  const headerCells = headerRow ? elementChildren(headerRow).filter((cell) => cell.tagName === 'TH') : [];
  const header = headerCells.map(readTableCell);
  const alignments = headerCells.map((cell) => normalizeAlignment(cell.dataset.tableAlignment));
  const body = table.querySelector('tbody');
  const rows = body ? elementChildren(body)
    .filter((row) => row.tagName === 'TR')
    .map((row) => elementChildren(row).filter((cell) => cell.tagName === 'TD').map(readTableCell)) : [];
  return { type: 'table', header, alignments, rows };
}

function readTableCell(cell: HTMLElement): Inline[] {
  return singleLineInlines(inlineValueFromDom(cell));
}

function readChildBlocks(element: HTMLElement): Block[] {
  return elementChildren(element)
    .filter((child) => blockTags.has(child.tagName))
    .map(readBlock)
    .filter((block): block is Block => block !== null);
}

function inlineChildren(element: HTMLElement, skipInputs = false): Inline[] {
  const result: Inline[] = [];
  Array.from(element.childNodes).forEach((child) => {
    if (skipInputs && child.nodeType === 1 && (child as HTMLElement).tagName === 'INPUT') return;
    if (child.nodeType === 1 && blockTags.has((child as HTMLElement).tagName)) return;
    result.push(...inlineValueFromDom(child));
  });
  return mergeTextInlines(result);
}

function pointFromBoundary(root: HTMLElement, node: Node, offset: number): EditorPoint | null {
  if (!isWithin(root, node)) return null;
  const path = blockPathForNode(node);
  if (!path) return null;
  const block = findBlockElement(root, path);
  if (!block) return null;
  const counted = textOffsetAtBoundary(block, node, offset);
  return counted === null ? null : { path, offset: counted };
}

function textOffsetAtBoundary(root: Node, boundary: Node, offset: number): number | null {
  let total = 0;
  const visit = (node: Node): boolean => {
    if (node === boundary) {
      if (node.nodeType === 3) total += clamp(offset, 0, (node.textContent ?? '').length);
      else total += Array.from(node.childNodes).slice(0, clamp(offset, 0, node.childNodes.length)).reduce((count, child) => count + textLength(child), 0);
      return true;
    }
    if (node.nodeType === 3) {
      total += (node.textContent ?? '').length;
      return false;
    }
    return Array.from(node.childNodes).some(visit);
  };
  return visit(root) ? total : null;
}

function textBoundary(root: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const nodes = textNodes(root);
  if (!nodes.length) return { node: root, offset: 0 };
  let remaining = Math.max(0, offset);
  for (const node of nodes) {
    const length = (node.textContent ?? '').length;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  const last = nodes.at(-1)!;
  return { node: last, offset: (last.textContent ?? '').length };
}

function findBlockElement(root: HTMLElement, path: number[]): HTMLElement | null {
  return root.querySelector(`[data-block-path="${formatPath(path)}"]`) as HTMLElement | null;
}

function findNearestParagraph(root: HTMLElement, path: number[]): HTMLElement | null {
  const paragraphs = allElements(root).filter((element) => element.tagName === 'P' && parsePath(element.dataset.blockPath));
  if (!paragraphs.length) return null;
  return paragraphs.reduce((nearest, candidate) => {
    const nearestPath = parsePath(nearest.dataset.blockPath)!;
    const candidatePath = parsePath(candidate.dataset.blockPath)!;
    return pathDistance(candidatePath, path) < pathDistance(nearestPath, path) ? candidate : nearest;
  });
}

function blockElement(ownerDocument: Document, tagName: string, path: number[]): HTMLElement {
  const element = ownerDocument.createElement(tagName);
  element.className = 'markdown-editor-block';
  element.dataset.blockPath = formatPath(path);
  return element;
}

function elementChildren(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children) as HTMLElement[];
}

function allElements(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const visit = (node: Node): void => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 1) {
        elements.push(child as HTMLElement);
        visit(child);
      }
    });
  };
  visit(root);
  return elements;
}

function textNodes(root: Node): Node[] {
  const nodes: Node[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      nodes.push(node);
      return;
    }
    Array.from(node.childNodes).forEach(visit);
  };
  visit(root);
  return nodes;
}

function textLength(node: Node): number {
  return textNodes(node).reduce((total, child) => total + (child.textContent ?? '').length, 0);
}

function textInlines(value: string): Inline[] {
  return value ? [{ type: 'text', value }] : [];
}

function mergeTextInlines(inlines: Inline[]): Inline[] {
  return inlines.reduce<Inline[]>((merged, inline) => {
    const previous = merged.at(-1);
    if (inline.type === 'text' && previous?.type === 'text') previous.value += inline.value;
    else merged.push(inline);
    return merged;
  }, []);
}

function singleLineInlines(inlines: Inline[]): Inline[] {
  return mergeTextInlines(inlines.map((inline) => {
    if (inline.type === 'text') return { ...inline, value: inline.value.replace(/[\r\n]+/g, ' ') };
    if (inline.type === 'code' && typeof inline.inlines === 'string') return { ...inline, inlines: inline.inlines.replace(/[\r\n]+/g, ' ') };
    return { ...inline, inlines: singleLineInlines(inline.inlines as Inline[]) } as Inline;
  }));
}

function inlineText(inlines: Inline[]): string {
  return inlines.map((inline) => inline.type === 'text'
    ? inline.value
    : typeof inline.inlines === 'string'
      ? inline.inlines
      : inlineText(inline.inlines)).join('');
}

function normalizeAlignment(value: string | undefined): TableAlignment {
  return value === 'center' || value === 'right' ? value : 'left';
}

function parsePath(value: string | undefined): number[] | null {
  if (!value || !/^\d+(?:\.\d+)*$/.test(value)) return null;
  return value.split('.').map(Number);
}

function formatPath(path: number[]): string {
  return path.join('.');
}

function pathDistance(first: number[], second: number[]): number {
  const longest = Math.max(first.length, second.length);
  let distance = 0;
  for (let index = 0; index < longest; index += 1) distance += Math.abs((first[index] ?? -1) - (second[index] ?? -1));
  return distance;
}

function isWithin(root: HTMLElement, node: Node): boolean {
  let current: HTMLElement | null = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
  while (current) {
    if (current === root) return true;
    current = current.parentElement;
  }
  return false;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(Number.isFinite(value) ? value : 0, maximum));
}
