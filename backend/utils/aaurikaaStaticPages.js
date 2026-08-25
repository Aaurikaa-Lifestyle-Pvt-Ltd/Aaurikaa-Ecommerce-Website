const {
  STATIC_PAGE_REGISTRY,
  isMarketplaceStaticPageKey,
} = require('../config/staticPageRegistry');
const { isMarketplaceSurfaceEnabled } = require('../config/aaurikaaFoundation');
const { EMPTY_TIPTAP_DOC } = require('../config/staticPageManifests');
const {
  emptyHeroBanner,
  emptyImageBlock,
  emptyImageText,
  emptyCtaCard,
  emptyContactCard,
  emptySupportPanel,
} = require('./staticPageStructuredZones');

function shouldExposeStaticPageKey(pageKey) {
  if (!isMarketplaceStaticPageKey(pageKey)) return true;
  return isMarketplaceSurfaceEnabled();
}

function listVisibleRegistryEntries() {
  return STATIC_PAGE_REGISTRY.filter((entry) => shouldExposeStaticPageKey(entry.pageKey));
}

function emptyZonesFromManifest(manifest) {
  const zones = {};
  for (const zone of manifest?.zones || []) {
    switch (zone.type) {
      case 'plainText':
        zones[zone.id] = '';
        break;
      case 'richText':
        zones[zone.id] = JSON.stringify(EMPTY_TIPTAP_DOC);
        break;
      case 'faqList':
      case 'sectionList':
      case 'linkCardList':
      case 'testimonialList':
      case 'videoTutorialList':
      case 'orderedSections':
      case 'cardGrid':
        zones[zone.id] = [];
        break;
      case 'contactCard':
        zones[zone.id] = emptyContactCard();
        break;
      case 'ctaCard':
      case 'cta':
        zones[zone.id] = emptyCtaCard();
        break;
      case 'supportPanel':
        zones[zone.id] = emptySupportPanel();
        break;
      case 'noticeBanner':
        zones[zone.id] = { heading: '', description: '' };
        break;
      case 'heroBanner':
        zones[zone.id] = emptyHeroBanner();
        break;
      case 'image':
        zones[zone.id] = emptyImageBlock();
        break;
      case 'imageText':
        zones[zone.id] = emptyImageText();
        break;
      default:
        zones[zone.id] = null;
    }
  }
  return zones;
}

module.exports = {
  shouldExposeStaticPageKey,
  listVisibleRegistryEntries,
  emptyZonesFromManifest,
};
