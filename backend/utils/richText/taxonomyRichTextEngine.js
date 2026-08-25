/**
 * Headless TipTap engine for taxonomy description conversion (import/export).
 */
const { Editor } = require('@tiptap/core');
const { JSDOM } = require('jsdom');
const { getTiptapExtensionsForServer } = require('./tiptapExtensionsServer');
const { safeJsonParse } = require('./richTextSanitizeUtils');

const HTML_TAG_RE = /<[a-z][\s\S]*>/i;

let editorInstance = null;
let domInstalled = false;

function installDom() {
  if (domInstalled) return;
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.HTMLElement = window.HTMLElement;
  global.getComputedStyle = window.getComputedStyle.bind(window);
  if (typeof global.navigator === 'undefined') {
    global.navigator = window.navigator;
  }
  domInstalled = true;
}

function getEditor() {
  if (!editorInstance) {
    installDom();
    editorInstance = new Editor({
      extensions: getTiptapExtensionsForServer(),
      content: '',
    });
  }
  return editorInstance;
}

function hasHtmlTags(value) {
  return HTML_TAG_RE.test(String(value || ''));
}

function htmlToTiptapDoc(html) {
  const editor = getEditor();
  editor.commands.setContent(String(html || ''), false);
  return editor.getJSON();
}

function tiptapDocToHtml(doc) {
  const editor = getEditor();
  const parsed = typeof doc === 'string' ? safeJsonParse(doc) : doc;
  editor.commands.setContent(parsed || { type: 'doc', content: [{ type: 'paragraph' }] }, false);
  return editor.getHTML();
}

function plainTextToTiptapDoc(text) {
  const paragraphs = String(text || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph.replace(/\n/g, ' ') }],
    })),
  };
}

function resetTaxonomyRichTextEngineForTests() {
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }
  domInstalled = false;
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.Node;
  delete global.HTMLElement;
  delete global.getComputedStyle;
}

module.exports = {
  hasHtmlTags,
  htmlToTiptapDoc,
  tiptapDocToHtml,
  plainTextToTiptapDoc,
  resetTaxonomyRichTextEngineForTests,
};
