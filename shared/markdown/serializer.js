import { isSafeUrl } from './parser.js';

export function serializeMarkdown(blocks) {
  return blocks.map(serializeBlock).join('\n\n');
}

function serializeBlock(block) {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level ?? 1)} ${serializeInlines(block.inlines)}`;
    case 'paragraph':
      return serializeInlines(block.inlines);
    case 'quote':
      return serializeMarkdown(block.blocks ?? []).split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n');
    case 'codeBlock':
      return `\`\`\`${block.language ?? ''}\n${block.value ?? ''}\n\`\`\``;
    case 'list':
      return serializeList(block, false);
    case 'taskList':
      return serializeList(block, true);
    case 'table':
      return serializeTable(block);
    case 'horizontalRule':
      return '---';
    default:
      return '';
  }
}

function serializeList(block, task) {
  return block.items.map((item, index) => {
    const marker = task ? `- [${item.checked ? 'x' : ' '}] ` : `${block.ordered ? `${index + 1}.` : '-'} `;
    const children = item.children.flatMap((child) => serializeBlock(child).split('\n').map((line) => `  ${line}`));
    return [marker + serializeInlines(item.inlines), ...children].join('\n');
  }).join('\n');
}

function serializeTable(table) {
  const header = table.header.map((cell) => serializeInlines(cell));
  const separator = table.alignments.map(tableSeparator);
  const rows = table.rows.map((row) => row.map((cell) => serializeInlines(cell)));
  return [header, separator, ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function tableSeparator(alignment) {
  if (alignment === 'center') return ':---:';
  if (alignment === 'right') return '---:';
  if (alignment === 'left') return '---';
  return '---';
}

export function serializeInlines(inlines) {
  return inlines.map((inline) => {
    if (inline.type === 'text') return inline.value;
    if (inline.type === 'strong') return `**${serializeInlines(inline.inlines)}**`;
    if (inline.type === 'emphasis') return `*${serializeInlines(inline.inlines)}*`;
    if (inline.type === 'code') return `\`${typeof inline.inlines === 'string' ? inline.inlines : serializeInlines(inline.inlines)}\``;
    if (inline.type === 'link') return isSafeUrl(inline.url) ? `[${serializeInlines(inline.inlines)}](${inline.url})` : serializeInlines(inline.inlines);
    return '';
  }).join('');
}
