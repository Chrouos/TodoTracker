# Markdown Preview Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render common Markdown structures correctly in extension records and provide an above-content expand/collapse control for long previews.

**Architecture:** Keep the existing dependency-free `markdownToHTML()` renderer and make its block parsing stateful for paragraphs, lists, blockquotes, and fenced code. Add a small shared preview helper in the options page that emits a bounded preview with a top toggle button; event delegation handles all three existing render locations.

**Tech Stack:** Chrome MV3 extension, vanilla JavaScript modules, CSS, Node test runner.

## Global Constraints

- Preserve the original Markdown text and storage schema.
- Escape user text before inserting renderer-generated HTML; do not allow raw HTML passthrough.
- Support headings, bold, italic, inline code, links, unordered lists, ordered lists, blockquotes, and fenced code blocks.
- Long previews default to collapsed and expose the toggle above the content; short previews have no toggle.
- Do not add external Markdown dependencies.

---

### Task 1: Cover Markdown block structures with tests

**Files:**
- Create: `extension/src/lib/markdown.test.js`
- Modify: none

**Interfaces:**
- Consumes: `markdownToHTML(markdown: string)` from `extension/src/lib/markdown.js`.
- Produces: executable regression tests for block output and escaping.

- [ ] **Step 1: Write failing tests for lists, blockquotes, fenced code, and escaping**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToHTML } from './markdown.js';

test('renders common markdown blocks', () => {
  const html = markdownToHTML([
    '# Title',
    '',
    '- one',
    '- **two**',
    '',
    '1. first',
    '2. second',
    '',
    '> quoted text',
    '',
    '```js',
    'const value = <tag>;',
    '```',
  ].join('\n'));

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li><strong>two<\/strong><\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<ol>[\s\S]*<li>first<\/li>[\s\S]*<li>second<\/li>[\s\S]*<\/ol>/);
  assert.match(html, /<blockquote>quoted text<\/blockquote>/);
  assert.match(html, /<pre><code>const value = &lt;tag&gt;;<\/code><\/pre>/);
});

test('escapes raw html in inline and block content', () => {
  const html = markdownToHTML('<script>alert(1)</script>\n\n`<img>`');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<code>&lt;img&gt;<\/code>/);
});
```

- [ ] **Step 2: Run the focused tests and verify the new block assertions fail**

Run: `node --experimental-default-type=module --test extension/src/lib/markdown.test.js`

Expected: FAIL until the renderer produces the requested list, quote, and fenced-code structure.

- [ ] **Step 3: Commit the regression tests**

```bash
git add extension/src/lib/markdown.test.js
git commit -m "test: cover extension markdown blocks"
```

### Task 2: Improve the dependency-free Markdown renderer

**Files:**
- Modify: `extension/src/lib/markdown.js`
- Test: `extension/src/lib/markdown.test.js`

**Interfaces:**
- Consumes: Markdown strings from Todo, entry, and workspace notes.
- Produces: HTML from `markdownToHTML()` using only escaped source text and renderer-owned tags.

- [ ] **Step 1: Implement explicit block-state flushing**

Use separate `flushParagraph`, `flushList`, `flushQuote`, and `flushCode` operations. Keep one list open for consecutive items of the same type, close it when the type changes or a non-list block begins, and treat a fenced line such as `````js`` as an opening fence while ignoring the optional language label.

- [ ] **Step 2: Preserve inline formatting only in normal text blocks**

Run `inline()` for headings, paragraphs, list items, and quote lines. Run only `escapeHTML()` for fenced code contents so backticks and angle brackets remain literal code.

- [ ] **Step 3: Run the focused tests and verify they pass**

Run: `node --experimental-default-type=module --test extension/src/lib/markdown.test.js`

Expected: PASS for all Markdown renderer tests.

- [ ] **Step 4: Commit the renderer change**

```bash
git add extension/src/lib/markdown.js extension/src/lib/markdown.test.js
git commit -m "feat: render extension notes as markdown blocks"
```

### Task 3: Add shared long-preview markup and top toggle

**Files:**
- Modify: `extension/src/options/options.js`
- Modify: `extension/src/options/options.css`

**Interfaces:**
- Consumes: `markdownToHTML()` output and note strings already rendered in `renderTodos()`, `renderEntries()`, and `renderProjectWorkspace()`.
- Produces: `markdown-preview-wrap` markup with a top `[+] 展開全文` / `[-] 收闔全文` button and delegated click behavior.

- [ ] **Step 1: Add a preview helper that emits consistent markup**

Create a helper such as:

```js
function markdownPreview(markdown) {
  const html = markdownToHTML(markdown);
  return `<div class="markdown-preview-wrap">
    <button class="btn-sm markdown-toggle" type="button" data-markdown-toggle hidden>[+] 展開全文</button>
    <div class="markdown-preview" data-markdown-content>${html}</div>
    <button class="btn-sm markdown-toggle markdown-toggle-bottom" type="button" data-markdown-toggle hidden>[+] 展開全文</button>
  </div>`;
}
```

Use the helper for Todo notes, entry notes, workspace task notes, and workspace entry notes. Keep the original conditional that omits the preview when notes are empty.

- [ ] **Step 2: Initialize long-preview state after rendering**

Add a function that checks each `[data-markdown-content]` element after `innerHTML` updates. If `scrollHeight` is greater than the CSS collapsed height, mark its wrapper as long, keep it collapsed, and reveal both controls; otherwise leave controls hidden. The top control must remain visible while expanded so the user can collapse without scrolling to the bottom.

- [ ] **Step 3: Add delegated toggle handling**

Register one `document` click handler near the other options-page event handlers. On `[data-markdown-toggle]`, toggle a wrapper class such as `is-expanded`, update both button labels together, and set `aria-expanded` on the controls. Do not persist this transient state.

- [ ] **Step 4: Style the preview and collapsed state**

Add CSS for a bounded `.markdown-preview` with `max-height`, `overflow: hidden`, and a fade/neutral boundary if appropriate. Ensure lists have visible indentation, `pre` scrolls horizontally, code uses a monospace font, and the top toggle has spacing above the content. Expanded previews remove the height limit while keeping the top button visible.

- [ ] **Step 5: Run focused tests and inspect the generated diff**

Run: `node --experimental-default-type=module --test extension/src/lib/markdown.test.js`

Run: `git diff --check`

Expected: Markdown tests pass and no whitespace errors are reported.

- [ ] **Step 6: Commit the preview interaction**

```bash
git add extension/src/options/options.js extension/src/options/options.css
git commit -m "feat: add collapsible markdown previews"
```

### Task 4: Verify the extension behavior end to end

**Files:**
- Modify: none unless verification finds a defect in the files above.

**Interfaces:**
- Consumes: the completed extension options page and Markdown tests.
- Produces: verified renderer and interaction behavior.

- [ ] **Step 1: Run the focused automated test**

Run: `node --experimental-default-type=module --test extension/src/lib/markdown.test.js`

Expected: PASS.

- [ ] **Step 2: Validate the extension source syntax**

Run: `node --experimental-default-type=module --check extension/src/lib/markdown.js`

Run: `node --experimental-default-type=module --check extension/src/options/options.js`

Expected: both commands exit successfully.

- [ ] **Step 3: Manually inspect the options page**

Load or reload the unpacked extension in Chrome and inspect records containing headings, unordered/ordered lists, quotes, inline code, and fenced code. Confirm short notes show no toggle; long notes start collapsed; the upper button expands and then immediately collapses the content; the lower button remains available as a secondary control.

- [ ] **Step 4: Review final changes**

Run: `git diff HEAD~3 --check`

Expected: clean diff check and only the Markdown preview feature files changed after the spec/plan commits.

