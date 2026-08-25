/**
 * Server-side TipTap extension config for taxonomy import/export.
 * Keep in sync with frontend/utils/tiptapExtensions.js when CMS extensions change.
 */
const { Mark, Node } = require('@tiptap/core');
const StarterKit = require('@tiptap/starter-kit').default;
const Underline = require('@tiptap/extension-underline').default;
const Link = require('@tiptap/extension-link').default;
const Image = require('@tiptap/extension-image').default;
const Table = require('@tiptap/extension-table').default;
const TableRow = require('@tiptap/extension-table-row').default;
const TableHeader = require('@tiptap/extension-table-header').default;
const TableCell = require('@tiptap/extension-table-cell').default;
const TextAlign = require('@tiptap/extension-text-align').default;
const TextStyle = require('@tiptap/extension-text-style').default;
const Color = require('@tiptap/extension-color').default;
const Highlight = require('@tiptap/extension-highlight').default;
const { sanitizeHref, sanitizeColor, sanitizeHighlightColor } = require('./richTextSanitizeUtils');

const SafeColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (el) => {
              const c = el.getAttribute('data-text-color') || el.style?.color;
              if (!c) return null;
              return sanitizeColor(c.startsWith('#') ? c : null) || null;
            },
            renderHTML: (attrs) => {
              if (!attrs.color) return {};
              const safe = sanitizeColor(attrs.color);
              return safe ? { 'data-text-color': safe, style: `color: ${safe}` } : {};
            },
          },
        },
      },
    ];
  },
});

const SafeHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: '#FEF08A',
        parseHTML: (el) => {
          const c = el.getAttribute('data-highlight-color') || el.style?.backgroundColor;
          if (!c) return '#FEF08A';
          const hex = c.startsWith('#') ? c : null;
          return sanitizeHighlightColor(hex || c) || '#FEF08A';
        },
        renderHTML: (attrs) => {
          const safe = sanitizeHighlightColor(attrs.color) || '#FEF08A';
          return { 'data-highlight-color': safe, style: `background-color: ${safe}` };
        },
      },
    };
  },
});

const FONT_SIZES = [14, 16, 20, 24];
const DEFAULT_FONT_SIZE = 16;

const FontSize = Mark.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addAttributes() {
    return {
      fontSize: {
        default: DEFAULT_FONT_SIZE,
        parseHTML: (el) => {
          const v = Number(el.getAttribute('data-font-size')) || DEFAULT_FONT_SIZE;
          return FONT_SIZES.includes(v) ? v : DEFAULT_FONT_SIZE;
        },
        renderHTML: (attrs) => {
          const v = FONT_SIZES.includes(Number(attrs.fontSize)) ? Number(attrs.fontSize) : DEFAULT_FONT_SIZE;
          return { 'data-font-size': v, style: `font-size: ${v}px` };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-font-size]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});

const SmartImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align || 'center' }),
      },
      size: {
        default: 100,
        parseHTML: (element) => Number(element.getAttribute('data-size') || 100),
        renderHTML: (attrs) => ({ 'data-size': attrs.size || 100 }),
      },
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('data-width') || '100%',
        renderHTML: (attrs) => ({ 'data-width': attrs.width || '100%' }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const align = HTMLAttributes.align || 'center';
    const size = Math.max(10, Math.min(100, Number(HTMLAttributes.size || 100)));
    const width = ['25%', '50%', '75%', '100%'].includes(HTMLAttributes.width) ? HTMLAttributes.width : '100%';
    const margin = align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto';
    return [
      'img',
      {
        ...HTMLAttributes,
        style: `display:block;width:${width};max-width:${size}%;height:auto;margin:${margin};border-radius:12px;`,
      },
    ];
  },
});

const MediaGroup = Node.create({
  name: 'mediaGroup',
  group: 'block',
  content: 'image image',
  defining: true,
  addAttributes() {
    return {};
  },
  parseHTML() {
    return [{ tag: 'div[data-media-group="true"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-media-group': 'true', 'data-type': 'mediaGroup' }, 0];
  },
});

const MediaText = Node.create({
  name: 'mediaText',
  group: 'block',
  content: 'image paragraph',
  defining: true,
  addAttributes() {
    return {
      layout: {
        default: 'imageLeft',
        parseHTML: (el) => el.getAttribute('data-layout') || 'imageLeft',
        renderHTML: (attrs) => ({ 'data-layout': attrs.layout || 'imageLeft' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-media-text="true"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-media-text': 'true', ...HTMLAttributes }, 0];
  },
});

const CTAButton = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      text: { default: 'Click here' },
      url: { default: '/' },
      variant: { default: 'primary' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-cta-button="true"]' }];
  },
  renderHTML({ node }) {
    const url = sanitizeHref(node.attrs.url || '#') || '#';
    return [
      'div',
      { 'data-cta-button': 'true', 'data-cta-text': node.attrs.text || '', 'data-cta-url': url, 'data-cta-variant': node.attrs.variant || 'primary' },
      ['a', { href: url, 'data-cta-link': 'true' }, node.attrs.text || 'Click here'],
    ];
  },
});

const CtaNode = Node.create({
  name: 'cta',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      text: { default: 'Click here' },
      href: { default: '/' },
      linkType: { default: 'internal' },
      variant: { default: 'primary' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-cta="true"]' }];
  },
  renderHTML({ node }) {
    const href = sanitizeHref(node.attrs.href || '#') || '#';
    const variant = node.attrs.variant || 'primary';
    const base = 'display:inline-block;padding:10px 18px;border-radius:10px;font-weight:700;text-decoration:none;';
    const style =
      variant === 'outline'
        ? `${base}border:2px solid #2563eb;color:#2563eb;background:#ffffff;`
        : variant === 'secondary'
          ? `${base}background:#111827;color:#ffffff;`
          : `${base}background:#2563eb;color:#ffffff;`;

    return [
      'div',
      { 'data-cta': 'true', style: 'margin:16px 0;' },
      [
        'a',
        {
          href,
          target: node.attrs.linkType === 'external' ? '_blank' : null,
          rel: node.attrs.linkType === 'external' ? 'nofollow noopener noreferrer' : null,
          style,
        },
        node.attrs.text || 'Click here',
      ],
    ];
  },
});

const VariantLink = Link.extend({
  name: 'link',
  addAttributes() {
    return {
      ...this.parent?.(),
      variant: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute('data-variant');
          if (v === 'hidden' || v === 'default') return v;
          return null;
        },
        renderHTML: (attributes) => {
          if (attributes.variant === 'hidden') {
            return { 'data-variant': 'hidden' };
          }
          return {};
        },
      },
    };
  },
});

function getTiptapExtensionsForServer() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    Underline,
    TextStyle,
    SafeColor,
    SafeHighlight,
    FontSize,
    SmartImage,
    VariantLink.configure({
      openOnClick: true,
      autolink: false,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'nofollow noopener noreferrer',
      },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    CtaNode,
    CTAButton,
    MediaGroup,
    MediaText,
  ];
}

module.exports = {
  getTiptapExtensionsForServer,
};
