const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'TABLE', 'HR']);
const inlineTags = new Set(['STRONG', 'EM', 'CODE', 'A', 'INPUT']);

export function renderEditableBlocks(root, blocks) {
  root.contentEditable = 'true';
  root.textContent = '';
  root.append(...blocks.map((block, index) => renderBlock(root.ownerDocument, block, [index])));
}

export function readEditableBlocks(root, fallback) {
  const children = elementChildren(root);
  if (!children.length) {
    const inlines = inlineChildren(root);
    return inlines.length ? [{ type: 'paragraph', inlines }] : fallback;
  }
  return children.map(readBlock).filter((block) => block !== null);
}

export function readEditorSelection(root) {
  const selection = root.ownerDocument?.getSelection?.() ?? globalThis.window?.getSelection?.();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const anchor = pointFromBoundary(root, selection.anchorNode ?? range.startContainer, selection.anchorOffset ?? range.startOffset);
  const focus = pointFromBoundary(root, selection.focusNode ?? range.endContainer, selection.focusOffset ?? range.endOffset);
  return anchor && focus ? { anchor, focus } : null;
}

export function restoreEditorSelection(root, selection) {
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

export function blockPathForNode(node) {
  const element = node.nodeType === 1 ? node : node.parentElement;
  const block = element?.closest?.('[data-block-path]');
  return parsePath(block?.dataset.blockPath);
}

export function inlineValueFromDom(node) {
  if (node.nodeType === 3) return textInlines(node.textContent ?? '');
  if (node.nodeType !== 1) return [];

  const element = node;
  const inlines = inlineChildren(element);
  if (element.tagName === 'STRONG') return [{ type: 'strong', inlines }];
  if (element.tagName === 'EM') return [{ type: 'emphasis', inlines }];
  if (element.tagName === 'CODE') return [{ type: 'code', inlines: element.textContent ?? '' }];
  if (element.tagName === 'A') {
    const href = element.href;
    const markdownUrl = element.dataset.markdownUrl ?? href;
    if (isSafeUrl(markdownUrl) && isSafeUrl(href)) return [{ type: 'link', url: markdownUrl, inlines }];
  }
  return inlines;
}

function renderBlock(ownerDocument, block, path) {
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

function renderList(ownerDocument, block, path) {
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

function renderTaskList(ownerDocument, block, path) {
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

function renderTable(ownerDocument, block, path) {
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

function renderTableCell(ownerDocument, tagName, inlines, alignment, path) {
  const cell = blockElement(ownerDocument, tagName, path);
  cell.dataset.tableAlignment = alignment;
  appendInlines(ownerDocument, cell, inlines);
  return cell;
}

function appendInlines(ownerDocument, parent, inlines) {
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
      element.href = inline.url;
      element.dataset.markdownUrl = inline.url;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    }
    if (inline.type === 'code' && typeof inline.inlines === 'string') element.textContent = inline.inlines;
    else appendInlines(ownerDocument, element, inline.inlines);
    parent.append(element);
  });
}

function readBlock(element) {
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

function readList(element) {
  const task = element.dataset.blockType === 'task-list';
  const listItems = elementChildren(element).filter((child) => child.tagName === 'LI').map((item) => {
    const children = readChildBlocks(item);
    const inlines = inlineChildren(item, true);
    return { inlines, children };
  });
  if (task) {
    const items = listItems.map((item, index) => {
      const checkbox = elementChildren(element)[index]?.querySelector('input');
      return { ...item, checked: Boolean(checkbox?.checked) };
    });
    return { type: 'taskList', items };
  }
  return { type: 'list', ordered: element.tagName === 'OL', items: listItems };
}

function readTable(table) {
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

function readTableCell(cell) {
  return singleLineInlines(inlineValueFromDom(cell));
}

function readChildBlocks(element) {
  return elementChildren(element)
    .filter((child) => !inlineTags.has(child.tagName))
    .map(readBlock)
    .filter((block) => block !== null);
}

function inlineChildren(element, skipInputs = false) {
  const result = [];
  Array.from(element.childNodes).forEach((child) => {
    if (skipInputs && child.nodeType === 1 && child.tagName === 'INPUT') return;
    if (child.nodeType === 1 && (blockTags.has(child.tagName) || (skipInputs && !inlineTags.has(child.tagName)))) return;
    result.push(...inlineValueFromDom(child));
  });
  return mergeTextInlines(result);
}

function pointFromBoundary(root, node, offset) {
  if (!isWithin(root, node)) return null;
  const path = blockPathForNode(node);
  if (!path) return null;
  const block = findBlockElement(root, path);
  if (!block) return null;
  const counted = textOffsetAtBoundary(block, node, offset);
  return counted === null ? null : { path, offset: counted };
}

function textOffsetAtBoundary(root, boundary, offset) {
  let total = 0;
  const visit = (node) => {
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

function textBoundary(root, offset) {
  const nodes = textNodes(root);
  if (!nodes.length) return { node: root, offset: 0 };
  let remaining = Math.max(0, offset);
  for (const node of nodes) {
    const length = (node.textContent ?? '').length;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  const last = nodes.at(-1);
  return { node: last, offset: (last.textContent ?? '').length };
}

function findBlockElement(root, path) {
  return root.querySelector(`[data-block-path="${formatPath(path)}"]`);
}

function findNearestParagraph(root, path) {
  const paragraphs = allElements(root).filter((element) => element.tagName === 'P' && parsePath(element.dataset.blockPath));
  if (!paragraphs.length) return null;
  return paragraphs.reduce((nearest, candidate) => {
    const nearestPath = parsePath(nearest.dataset.blockPath);
    const candidatePath = parsePath(candidate.dataset.blockPath);
    return pathDistance(candidatePath, path) < pathDistance(nearestPath, path) ? candidate : nearest;
  });
}

function blockElement(ownerDocument, tagName, path) {
  const element = ownerDocument.createElement(tagName);
  element.className = 'markdown-editor-block';
  element.dataset.blockPath = formatPath(path);
  return element;
}

function elementChildren(element) {
  return Array.from(element.children);
}

function allElements(root) {
  const elements = [];
  const visit = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 1) {
        elements.push(child);
        visit(child);
      }
    });
  };
  visit(root);
  return elements;
}

function textNodes(root) {
  const nodes = [];
  const visit = (node) => {
    if (node.nodeType === 3) {
      nodes.push(node);
      return;
    }
    Array.from(node.childNodes).forEach(visit);
  };
  visit(root);
  return nodes;
}

function textLength(node) {
  return textNodes(node).reduce((total, child) => total + (child.textContent ?? '').length, 0);
}

function textInlines(value) {
  return value ? [{ type: 'text', value }] : [];
}

function mergeTextInlines(inlines) {
  return inlines.reduce((merged, inline) => {
    const previous = merged.at(-1);
    if (inline.type === 'text' && previous?.type === 'text') previous.value += inline.value;
    else merged.push(inline);
    return merged;
  }, []);
}

function singleLineInlines(inlines) {
  return mergeTextInlines(inlines.map((inline) => {
    if (inline.type === 'text') return { ...inline, value: inline.value.replace(/[\r\n]+/g, ' ') };
    if (inline.type === 'code' && typeof inline.inlines === 'string') return { ...inline, inlines: inline.inlines.replace(/[\r\n]+/g, ' ') };
    return { ...inline, inlines: singleLineInlines(inline.inlines) };
  }));
}

function inlineText(inlines) {
  return inlines.map((inline) => inline.type === 'text'
    ? inline.value
    : typeof inline.inlines === 'string'
      ? inline.inlines
      : inlineText(inline.inlines)).join('');
}

function normalizeAlignment(value) {
  return value === 'center' || value === 'right' ? value : 'left';
}

function parsePath(value) {
  if (!value || !/^\d+(?:\.\d+)*$/.test(value)) return null;
  return value.split('.').map(Number);
}

function formatPath(path) {
  return path.join('.');
}

function pathDistance(first, second) {
  const longest = Math.max(first.length, second.length);
  let distance = 0;
  for (let index = 0; index < longest; index += 1) distance += Math.abs((first[index] ?? -1) - (second[index] ?? -1));
  return distance;
}

function isWithin(root, node) {
  let current = node.nodeType === 1 ? node : node.parentElement;
  while (current) {
    if (current === root) return true;
    current = current.parentElement;
  }
  return false;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(Number.isFinite(value) ? value : 0, maximum));
}

function isSafeUrl(url) {
  return /^https:\/\/[^\s]+$/i.test(url);
}
