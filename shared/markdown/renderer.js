import { isSafeUrl, parseMarkdown } from './parser.js';

export function renderMarkdown(markdown, options) {
  return renderBlocks(parseMarkdown(markdown), options);
}

export function renderBlocks(blocks, options = {}) {
  return blocks.map((block, index) => renderBlock(block, options, [index])).join('');
}

function renderBlock(block, options, taskPath) {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, block.level ?? 1));
      return `<h${level}>${renderInlines(block.inlines)}</h${level}>`;
    }
    case 'paragraph':
      return `<p>${renderInlines(block.inlines)}</p>`;
    case 'quote':
      return `<blockquote>${renderQuoteBlocks(block.blocks ?? [], options, taskPath)}</blockquote>`;
    case 'codeBlock': {
      const language = block.language ? ` class="language-${escapeHtml(block.language)}"` : '';
      return `<pre><code${language}>${escapeHtml(block.value ?? '')}</code></pre>`;
    }
    case 'list':
      return renderList(block, options, taskPath);
    case 'taskList':
      return renderTaskList(block, options, taskPath);
    case 'table':
      return renderTable(block);
    case 'horizontalRule':
      return '<hr>';
    default:
      return '';
  }
}

function renderList(block, options, taskPath) {
  const tag = block.ordered ? 'ol' : 'ul';
  const items = block.items.map((item, index) => `<li>${renderInlines(item.inlines)}${renderChildBlocks(item.children, options, [...taskPath, index])}</li>`).join('');
  return `<${tag}>${items}</${tag}>`;
}

function renderTaskList(block, options, taskPath) {
  const items = block.items.map((item, index) => {
    const path = [...taskPath, index];
    return `<li>${renderTaskInput(item, options, path)}${renderInlines(item.inlines)}${renderChildBlocks(item.children, options, path)}</li>`;
  }).join('');
  return `<ul class="markdown-task-list">${items}</ul>`;
}

function renderChildBlocks(children, options, taskPath) {
  return children.map((child) => renderBlock(child, options, taskPath)).join('');
}

function renderQuoteBlocks(blocks, options, taskPath) {
  return blocks.map((block, index) => renderBlock(block, options, [...taskPath, index])).join('');
}

function renderTaskInput(item, options, path) {
  const checked = item.checked ? ' checked' : '';
  if (options.interactiveTasks) {
    return `<input type="checkbox" data-markdown-task-path="${path.join('.')}" data-markdown-task-checked="${item.checked}"${checked}>`;
  }
  return `<input type="checkbox" disabled${checked}>`;
}

function renderTable(table) {
  const header = table.header.map((cell, index) => `<th style="text-align:${table.alignments[index] ?? 'left'}">${renderInlines(cell)}</th>`).join('');
  const rows = table.rows.map((row) => `<tr>${table.header.map((_, index) => `<td style="text-align:${table.alignments[index] ?? 'left'}">${renderInlines(row[index] ?? [])}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderInlines(inlines) {
  return inlines.map((inline) => {
    if (inline.type === 'text') return escapeHtml(inline.value);
    if (inline.type === 'strong') return `<strong>${renderInlines(inline.inlines)}</strong>`;
    if (inline.type === 'emphasis') return `<em>${renderInlines(inline.inlines)}</em>`;
    if (inline.type === 'code') return `<code>${escapeHtml(typeof inline.inlines === 'string' ? inline.inlines : inlineText(inline.inlines))}</code>`;
    if (inline.type === 'link') return isSafeUrl(inline.url)
      ? `<a href="${escapeHtml(inline.url)}" target="_blank" rel="noopener noreferrer">${renderInlines(inline.inlines)}</a>`
      : renderInlines(inline.inlines);
    return '';
  }).join('');
}

function inlineText(inlines) {
  return inlines.map((inline) => {
    if (inline.type === 'text') return inline.value;
    if (inline.type === 'code') return typeof inline.inlines === 'string' ? inline.inlines : inlineText(inline.inlines);
    return inlineText(inline.inlines);
  }).join('');
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}
