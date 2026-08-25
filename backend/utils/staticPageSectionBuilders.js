/** Build sectionList items for StaticPageContent zoneDefaults. */
function paragraphSection(title, text) {
  return {
    title,
    bodyRichText: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }),
  };
}

function bulletSection(title, items) {
  return {
    title,
    bodyRichText: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: items.map((text) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
      ],
    }),
  };
}

function bulletListItemWithVideoLink(text, videoUrl, linkLabel = '▶ Watch Video') {
  return {
    type: 'listItem',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `${text} ` },
          {
            type: 'text',
            text: linkLabel,
            marks: [{ type: 'link', attrs: { href: videoUrl, target: '_blank' } }],
          },
        ],
      },
    ],
  };
}

function bulletSectionWithVideoLinks(title, items) {
  return {
    title,
    bodyRichText: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: items.map((item) =>
            bulletListItemWithVideoLink(item.text, item.videoUrl)
          ),
        },
      ],
    }),
  };
}

module.exports = {
  paragraphSection,
  bulletSection,
  bulletSectionWithVideoLinks,
};
