export function parseMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const fence = lines[index].match(/^```([^`]*)\s*$/);
    if (fence) {
      const language = fence[1].trim();
      const content = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        content.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'codeBlock', value: content.join('\n'), ...(language ? { language } : {}) });
      continue;
    }

    const heading = lines[index].match(/^(#{1,6})[ \t]+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, inlines: parseInlines(heading[2]) });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index);
      blocks.push(table.block);
      index = table.next;
      continue;
    }

    if (isHorizontalRule(lines[index])) {
      blocks.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    if (lines[index].startsWith('>')) {
      const quoteLines = [];
      while (index < lines.length && lines[index].startsWith('>')) {
        quoteLines.push(lines[index].replace(/^> ?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', blocks: parseMarkdown(quoteLines.join('\n')) });
      continue;
    }

    const listMatch = matchListItem(lines[index]);
    if (listMatch) {
      const list = parseList(lines, index, listMatch.indent);
      blocks.push(list.block);
      index = list.next;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', inlines: parseInlines(paragraph.join('\n')) });
  }

  return blocks;
}

function startsBlock(lines, index) {
  return /^```([^`]*)\s*$/.test(lines[index])
    || /^(#{1,6})[ \t]+/.test(lines[index])
    || isTableStart(lines, index)
    || isHorizontalRule(lines[index])
    || lines[index].startsWith('>')
    || Boolean(matchListItem(lines[index]));
}

function parseList(lines, start, indent) {
  const first = matchListItem(lines[start]);
  const ordered = first.ordered;
  const task = parseTaskMarker(first.content);
  const items = [];
  let index = start;

  while (index < lines.length) {
    let current = matchListItem(lines[index]);
    if (!current) {
      let next = index;
      while (next < lines.length && !lines[next].trim()) next += 1;
      const candidate = matchListItem(lines[next]);
      if (!candidate || candidate.indent !== indent || candidate.ordered !== ordered) break;
      index = next;
      current = candidate;
    }
    if (!current || current.indent !== indent || current.ordered !== ordered) break;
    const taskItem = parseTaskMarker(current.content);
    if (Boolean(taskItem) !== Boolean(task)) break;

    const item = task
      ? { checked: taskItem.checked, inlines: parseInlines(taskItem.content), children: [] }
      : { inlines: parseInlines(current.content), children: [] };
    items.push(item);
    index += 1;

    while (index < lines.length) {
      let childIndex = index;
      while (childIndex < lines.length && !lines[childIndex].trim()) childIndex += 1;
      const child = matchListItem(lines[childIndex]);
      if (!child || child.indent <= indent) break;
      const nested = parseList(lines, childIndex, child.indent);
      item.children.push(nested.block);
      index = nested.next;
    }
  }

  return { block: task ? { type: 'taskList', items } : { type: 'list', ordered, items }, next: index };
}

function matchListItem(line) {
  if (typeof line !== 'string') return null;
  const match = line.match(/^( *)([-+*]|\d+[.)])\s+(.*)$/);
  if (!match || match[1].length % 2) return null;
  return { indent: match[1].length, ordered: /^\d/.test(match[2]), content: match[3] };
}

function parseTaskMarker(content) {
  const match = content.match(/^\[([ xX])\]\s+(.*)$/);
  return match ? { checked: match[1].toLowerCase() === 'x', content: match[2] } : null;
}

function isTableStart(lines, index) {
  return Boolean(lines[index]?.includes('|') && isTableSeparator(lines[index + 1]));
}

function parseTable(lines, start) {
  const header = splitTableRow(lines[start]).map(parseInlines);
  const separator = splitTableRow(lines[start + 1]);
  const alignments = separator.map(tableAlignment);
  const rows = [];
  let index = start + 2;

  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    const cells = splitTableRow(lines[index]).slice(0, header.length);
    while (cells.length < header.length) cells.push('');
    rows.push(cells.map(parseInlines));
    index += 1;
  }

  return { block: { type: 'table', header, alignments, rows }, next: index };
}

function splitTableRow(line) {
  const trimmed = line.trim();
  const start = trimmed.startsWith('|') ? 1 : 0;
  const end = trimmed.endsWith('|') && !isEscapedPipe(trimmed, trimmed.length - 1)
    ? trimmed.length - 1
    : trimmed.length;
  const cells = [];
  let cell = '';

  for (let index = start; index < end; index += 1) {
    if (trimmed[index] === '|' && !isEscapedPipe(trimmed, index)) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    if (trimmed[index] === '|') cell = `${cell.slice(0, -1)}|`;
    else cell += trimmed[index];
  }
  cells.push(cell.trim());
  return cells;
}

function isEscapedPipe(value, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function isTableSeparator(line) {
  if (!line || !line.includes('|')) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableAlignment(cell) {
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
  if (cell.endsWith(':')) return 'right';
  if (cell.startsWith(':')) return 'left';
  return 'left';
}

function isHorizontalRule(line) {
  return /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line);
}

export function parseInlines(value) {
  const inlines = [];
  let index = 0;

  const pushText = (text) => {
    if (!text) return;
    const previous = inlines.at(-1);
    if (previous?.type === 'text') previous.value += text;
    else inlines.push({ type: 'text', value: text });
  };

  while (index < value.length) {
    if (value.startsWith('**', index)) {
      const end = value.indexOf('**', index + 2);
      if (end > index + 2) {
        inlines.push({ type: 'strong', inlines: parseInlines(value.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }

    if (value[index] === '*') {
      const end = value.indexOf('*', index + 1);
      if (end > index + 1) {
        inlines.push({ type: 'emphasis', inlines: parseInlines(value.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }

    if (value[index] === '`') {
      const end = value.indexOf('`', index + 1);
      if (end > index + 1) {
        inlines.push({ type: 'code', inlines: value.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (value[index] === '[') {
      const match = value.slice(index).match(/^\[([^\]]+)\]\(([^\s)]+)\)/);
      if (match && isSafeUrl(match[2])) {
        inlines.push({ type: 'link', url: match[2], inlines: parseInlines(match[1]) });
        index += match[0].length;
        continue;
      }
    }

    pushText(value[index]);
    index += 1;
  }

  return inlines;
}

export function isSafeUrl(url) {
  return /^https:\/\/[^\s]+$/i.test(url);
}
