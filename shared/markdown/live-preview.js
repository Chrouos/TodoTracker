import { cloneBlocks } from './ast.js';
import { parseMarkdown } from './parser.js';
import { serializeInlines, serializeMarkdown } from './serializer.js';

export function readActiveBlockSource(blocks, path) {
  const location = locate(blocks, path);
  if (!location) return null;
  if (location.kind === 'item') return serializeItem(location.block, location.item, location.index);
  return serializeMarkdown([location.block]);
}

export function replaceActiveBlockSource(blocks, path, source) {
  const location = locate(blocks, path);
  if (!location || hasUnclosedFence(source)) return invalidReplacement(blocks, path);
  const parsed = source === '' ? [emptyParagraph()] : parseMarkdown(source);
  if (!parsed.length) return invalidReplacement(blocks, path);
  const next = cloneBlocks(blocks);
  const nextLocation = locate(next, path);

  if (nextLocation.kind === 'item') {
    if (parsed.length !== 1 || parsed[0].type !== nextLocation.block.type) {
      return invalidReplacement(blocks, path);
    }
    if (parsed[0].type === 'list' && parsed[0].ordered !== nextLocation.block.ordered) {
      return invalidReplacement(blocks, path);
    }
    const replacements = parsed[0].items;
    if (!replacements.length) return invalidReplacement(blocks, path);
    if (!replacements[0].children.length) replacements[0].children = nextLocation.item.children;
    nextLocation.container.splice(nextLocation.index, 1, ...replacements);
    const nextPath = [...path];
    nextPath[nextPath.length - 1] += replacements.length - 1;
    return { blocks: next, valid: true, nextPath };
  }

  nextLocation.container.splice(nextLocation.index, 1, ...parsed);
  const nextPath = [...path];
  nextPath[nextPath.length - 1] += parsed.length - 1;
  return { blocks: next, valid: true, nextPath };
}

export function serializeWithActiveBlockSource(blocks, path, source) {
  return blocks.map((block, index) => serializeBlockWithActive(block, [index], path, source)).join('\n\n');
}

export function toggleInlineSource(source, selectionStart, selectionEnd, command, url = 'https://example.com') {
  const text = String(source);
  const start = clampOffset(selectionStart, text.length);
  const end = clampOffset(selectionEnd, text.length, start);
  const selected = text.slice(start, end);

  if (command === 'link') {
    const selectedLink = selected.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
    if (selectedLink) return replaceSelection(text, start, end, selectedLink[1]);
    const enclosingLink = enclosingLinkRange(text, start, end);
    if (enclosingLink) {
      return replaceRange(text, enclosingLink.start, enclosingLink.end, enclosingLink.label);
    }
    const label = selected || '連結文字';
    const href = safeLinkUrl(url);
    return replaceSelection(text, start, end, `[${label}](${href})`, 1, label.length);
  }

  const format = inlineFormat(command);
  if (!format) return { source: text, selectionStart: start, selectionEnd: end };
  const wrappedSelection = unwrapSelected(selected, format.marker);
  if (wrappedSelection !== null) return replaceSelection(text, start, end, wrappedSelection);
  const enclosing = enclosingMarkerRange(text, start, end, format.marker);
  if (enclosing) {
    return replaceRange(text, enclosing.start, enclosing.end, text.slice(start, end));
  }

  const value = selected || format.placeholder;
  const normalized = value.split(format.marker).join('');
  return replaceSelection(
    text,
    start,
    end,
    `${format.marker}${normalized}${format.marker}`,
    format.marker.length,
    normalized.length,
  );
}

export function toggleBlockSource(source, command) {
  const text = String(source);
  let next = text;

  if (command === 'heading') next = /^#{1,6}\s+/.test(text) ? text.replace(/^#{1,6}\s+/, '') : `## ${text || '標題'}`;
  if (command === 'unordered-list') next = /^[-+*]\s+/.test(text) && !/^[-+*]\s+\[[ xX]\]\s+/.test(text)
    ? text.replace(/^[-+*]\s+/, '') : `- ${text || '項目'}`;
  if (command === 'ordered-list') next = /^\d+[.)]\s+/.test(text)
    ? text.replace(/^\d+[.)]\s+/, '') : `1. ${text || '項目'}`;
  if (command === 'task') next = /^[-+*]\s+\[[ xX]\]\s+/.test(text)
    ? text.replace(/^[-+*]\s+\[[ xX]\]\s+/, '') : `- [ ] ${text || '待辦事項'}`;
  if (command === 'quote') next = /^(?:> ?)/.test(text)
    ? text.split('\n').map((line) => line.replace(/^> ?/, '')).join('\n')
    : text.split('\n').map((line) => `> ${line}`).join('\n');
  if (command === 'code-block') {
    const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
    next = fenced ? fenced[1] : `\`\`\`\n${text || '程式碼'}\n\`\`\``;
  }
  if (command === 'table') next = isTableSource(text)
    ? text
    : '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |';
  if (command === 'rule') next = /^\s*(?:---|___|\*\*\*)\s*$/.test(text) ? '' : '---';

  return { source: next, selectionStart: 0, selectionEnd: next.length };
}

export function activeToolbarState(source, selectionStart, selectionEnd) {
  const text = String(source);
  const start = clampOffset(selectionStart, text.length);
  const end = clampOffset(selectionEnd, text.length, start);
  return {
    bold: Boolean(enclosingMarkerRange(text, start, end, '**')),
    italic: Boolean(enclosingMarkerRange(text, start, end, '*')),
    inlineCode: Boolean(enclosingMarkerRange(text, start, end, '`')),
    link: Boolean(enclosingLinkRange(text, start, end)),
    heading: /^#{1,6}\s+/.test(text),
    unorderedList: /^[-+*]\s+/.test(text) && !/^[-+*]\s+\[[ xX]\]\s+/.test(text),
    orderedList: /^\d+[.)]\s+/.test(text),
    task: /^[-+*]\s+\[[ xX]\]\s+/.test(text),
    quote: /^> ?/.test(text),
    codeBlock: /^```[^\n]*\n[\s\S]*\n```$/.test(text),
    table: isTableSource(text),
    rule: /^\s*(?:---|___|\*\*\*)\s*$/.test(text),
  };
}

function serializeBlockWithActive(block, path, activePath, source) {
  if (samePath(path, activePath)) return source;
  if (block.type === 'quote') {
    return block.blocks.map((child, index) => serializeBlockWithActive(child, [...path, index], activePath, source))
      .join('\n\n').split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
  }
  if (block.type === 'list' || block.type === 'taskList') {
    return block.items.map((item, index) => {
      const itemPath = [...path, index];
      if (samePath(itemPath, activePath)) return source;
      const marker = block.type === 'taskList'
        ? `- [${item.checked ? 'x' : ' '}] `
        : `${block.ordered ? `${index + 1}.` : '-'} `;
      const children = item.children.flatMap((child, childIndex) =>
        serializeBlockWithActive(child, [...itemPath, childIndex], activePath, source)
          .split('\n').map((line) => `  ${line}`));
      return [marker + serializeInlines(item.inlines), ...children].join('\n');
    }).join('\n');
  }
  return serializeMarkdown([block]);
}

function locate(blocks, path) {
  if (!validPath(path)) return null;
  const block = blocks[path[0]];
  if (!block) return null;
  return locateBlock(block, path.slice(1), blocks, path[0]);
}

function locateBlock(block, remaining, container, index) {
  if (!remaining.length) return { kind: 'block', block, container, index };
  if (block.type === 'quote') {
    const childIndex = remaining[0];
    const child = block.blocks?.[childIndex];
    return child ? locateBlock(child, remaining.slice(1), block.blocks, childIndex) : null;
  }
  if (block.type !== 'list' && block.type !== 'taskList') return null;
  const itemIndex = remaining[0];
  const item = block.items[itemIndex];
  if (!item) return null;
  if (remaining.length === 1) {
    return { kind: 'item', block, item, container: block.items, index: itemIndex };
  }
  const childIndex = remaining[1];
  const child = item.children[childIndex];
  return child ? locateBlock(child, remaining.slice(2), item.children, childIndex) : null;
}

function serializeItem(block, item, index) {
  const marker = block.type === 'taskList'
    ? `- [${item.checked ? 'x' : ' '}] `
    : `${block.ordered ? `${index + 1}.` : '-'} `;
  const children = item.children.flatMap((child) =>
    serializeMarkdown([child]).split('\n').map((line) => `  ${line}`));
  return [marker + serializeInlines(item.inlines), ...children].join('\n');
}

function hasUnclosedFence(source) {
  return String(source).split('\n').filter((line) => /^```(?:[^`]*)$/.test(line)).length % 2 === 1;
}

function invalidReplacement(blocks, path) {
  return { blocks, valid: false, nextPath: [...path] };
}

function emptyParagraph() {
  return { type: 'paragraph', inlines: [] };
}

function validPath(path) {
  return Array.isArray(path) && path.length > 0
    && path.every((index) => Number.isInteger(index) && index >= 0);
}

function samePath(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function inlineFormat(command) {
  if (command === 'bold') return { marker: '**', placeholder: '粗體文字' };
  if (command === 'italic') return { marker: '*', placeholder: '斜體文字' };
  if (command === 'inline-code') return { marker: '`', placeholder: '程式碼' };
  return null;
}

function unwrapSelected(selected, marker) {
  if (!selected.startsWith(marker) || !selected.endsWith(marker)) return null;
  if (selected.length < marker.length * 2) return null;
  return selected.slice(marker.length, -marker.length);
}

function enclosingMarkerRange(source, start, end, marker) {
  const markerStart = start - marker.length;
  if (markerStart < 0 || source.slice(markerStart, start) !== marker) return null;
  if (source.slice(end, end + marker.length) !== marker) return null;
  if (marker === '*' && (source[markerStart - 1] === '*' || source[end + 1] === '*')) return null;
  return { start: markerStart, end: end + marker.length };
}

function enclosingLinkRange(source, start, end) {
  for (const match of source.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const labelStart = match.index + 1;
    const labelEnd = labelStart + match[1].length;
    if (start >= labelStart && end <= labelEnd) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        label: match[1],
      };
    }
  }
  return null;
}

function replaceSelection(source, start, end, replacement, innerOffset = 0, innerLength = replacement.length) {
  return {
    source: source.slice(0, start) + replacement + source.slice(end),
    selectionStart: start + innerOffset,
    selectionEnd: start + innerOffset + innerLength,
  };
}

function replaceRange(source, start, end, replacement) {
  return replaceSelection(source, start, end, replacement);
}

function safeLinkUrl(url) {
  const value = String(url || '').trim();
  return /^(?:https?:\/\/|mailto:)/i.test(value) ? value : 'https://example.com';
}

function isTableSource(source) {
  const lines = source.split('\n');
  return lines.length >= 2
    && /^\s*\|.*\|\s*$/.test(lines[0])
    && /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[1]);
}

function clampOffset(value, maximum, minimum = 0) {
  const offset = Number.isInteger(value) ? value : minimum;
  return Math.max(minimum, Math.min(offset, maximum));
}

/** Format a source selection without parsing or reserializing the document. */
export function formatSourceSelection(source, selectionStart, selectionEnd, command) {
  const text = String(source ?? '');
  const start = clampOffset(selectionStart, text.length);
  const end = clampOffset(selectionEnd, text.length, start);
  if (['bold', 'italic', 'inline-code'].includes(command)) {
    return toggleInlineSource(text, start, end, command);
  }
  if (command === 'link') {
    if (activeToolbarState(text, start, end).link) return toggleInlineSource(text, start, end, command);
    const label = text.slice(start, end) || '連結文字';
    return replaceSelection(text, start, end, `[${label}](https://)`, label.length + 3, 8);
  }

  const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const lastSelected = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const followingBreak = text.indexOf('\n', lastSelected);
  const lineEnd = followingBreak === -1 ? text.length : followingBreak;
  const selected = text.slice(lineStart, lineEnd);
  if (['code-block', 'table', 'rule'].includes(command)) {
    if (start === end && selected.trim() && ['table', 'rule'].includes(command)
      && !(command === 'rule' && activeToolbarState(selected, 0, 0).rule)) {
      const inserted = toggleBlockSource('', command).source;
      const suffix = text.slice(lineEnd);
      return {
        source: text.slice(0, lineEnd) + '\n\n' + inserted + (suffix ? '\n' + suffix : ''),
        selectionStart: lineEnd + 2,
        selectionEnd: lineEnd + 2 + inserted.length,
      };
    }
    const result = toggleBlockSource(selected, command);
    return {
      source: text.slice(0, lineStart) + result.source + text.slice(lineEnd),
      selectionStart: lineStart + result.selectionStart,
      selectionEnd: lineStart + result.selectionEnd,
    };
  }
  const formats = {
    heading: [/^#{1,6}[ \t]+/, '## '],
    'unordered-list': [/^[-+*][ \t]+(?!\[[ xX]\][ \t])/, '- '],
    'ordered-list': [/^\d+[.)][ \t]+/, '1. '],
    task: [/^[-+*][ \t]+\[[ xX]\][ \t]+/, '- [ ] '],
    quote: [/^> ?/, '> '],
    paragraph: [/^(?:#{1,6}[ \t]+|[-+*][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+|> ?)/, ''],
  };
  const format = formats[command];
  if (!format) return { source: text, selectionStart: start, selectionEnd: end };
  const [pattern, prefix] = format;
  const lines = selected.split('\n');
  const remove = command === 'paragraph' || lines.every((line) => pattern.test(line));
  const replacement = lines.map((line) => {
    if (remove) return line.replace(pattern, '');
    if (pattern.test(line)) return line;
    return prefix + line;
  }).join('\n');
  return replaceSelection(text, lineStart, lineEnd, replacement);
}

/** Map a preview task to its original source marker, preserving all other bytes. */
export function toggleTaskSource(source, path) {
  const text = String(source ?? '');
  const offsets = [];
  // Temporary labels keep the parser's canonical nested paths while recording
  // source offsets. Markers inside fenced examples never become task items.
  const annotated = text.replace(
    /^((?:[ \t]*> ?)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[)([ xX])(\][ \t]+)/gm,
    (match, before, checked, after, offset) => {
      const index = offsets.push(offset + before.length) - 1;
      return `${before}${checked}${after}CODEXTASK${index} `;
    },
  );
  const location = locate(parseMarkdown(annotated), path);
  if (location?.kind !== 'item' || location.block.type !== 'taskList') return text;
  const label = location.item.inlines[0]?.value?.match(/^CODEXTASK(\d+) /);
  const offset = label ? offsets[Number(label[1])] : undefined;
  if (offset === undefined) return text;
  return text.slice(0, offset) + (location.item.checked ? ' ' : 'x') + text.slice(offset + 1);
}
