import assert from 'node:assert/strict';
import test from 'node:test';
import { livePreviewFixtures } from '../../../shared/markdown/live-preview-fixtures.js';
import { parseMarkdown, serializeMarkdown } from './markdown.js';
import {
  activeToolbarState,
  readActiveBlockSource,
  replaceActiveBlockSource,
  serializeWithActiveBlockSource,
  toggleBlockSource,
  toggleInlineSource,
} from './markdown-live-preview.js';

test('Extension live preview executes every shared parity fixture', () => {
  for (const fixture of livePreviewFixtures.activeSource) {
    assert.equal(readActiveBlockSource(parseMarkdown(fixture.markdown), fixture.path), fixture.expected);
  }
  for (const fixture of livePreviewFixtures.composition) {
    assert.equal(
      serializeWithActiveBlockSource(parseMarkdown(fixture.markdown), fixture.path, fixture.source),
      fixture.expected,
    );
  }
  for (const fixture of livePreviewFixtures.replacement) {
    const result = replaceActiveBlockSource(parseMarkdown(fixture.markdown), fixture.path, fixture.source);
    assert.equal(result.valid, fixture.expected.valid);
    assert.deepEqual(result.nextPath, fixture.expected.nextPath);
    assert.equal(serializeMarkdown(result.blocks), fixture.expected.markdown);
  }
  for (const fixture of livePreviewFixtures.inlineToggle) {
    assert.deepEqual(
      toggleInlineSource(fixture.source, fixture.start, fixture.end, fixture.command),
      fixture.expected,
    );
  }
  for (const fixture of livePreviewFixtures.blockToggle) {
    assert.deepEqual(toggleBlockSource(fixture.source, fixture.command), fixture.expected);
  }
  for (const fixture of livePreviewFixtures.toolbarState) {
    const state = activeToolbarState(fixture.source, fixture.start, fixture.end);
    for (const [key, expected] of Object.entries(fixture.expected)) assert.equal(state[key], expected);
  }
});
