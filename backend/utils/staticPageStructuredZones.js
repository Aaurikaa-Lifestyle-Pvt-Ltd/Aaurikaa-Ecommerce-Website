const MAX = {
  heading: 200,
  body: 500,
  org: 100,
  phone: 50,
  email: 120,
  addressLine: 200,
  buttonLabel: 80,
  href: 500,
  actions: 4,
  linkCards: 8,
  testimonials: 6,
  videos: 4,
  cardTitle: 200,
  cardDesc: 400,
  comment: 600,
  name: 120,
  role: 80,
  videoTitle: 200,
  videoUrl: 500,
  mediaId: 64,
  alt: 200,
  caption: 400,
  subcopy: 500,
  title: 200,
  cards: 12,
  orderedSections: 24,
};

/** Allowlisted section types for orderedSections (and first-class zone types). */
const AAURIKAA_SECTION_TYPES = new Set([
  'heroBanner',
  'richText',
  'image',
  'imageText',
  'faqList',
  'cta',
  'ctaCard',
  'cardGrid',
  'contactCard',
  'supportPanel',
]);

const trim = (v, max) => String(v ?? '').trim().slice(0, max);

const sanitizeHref = (href = '') => {
  const value = trim(href, MAX.href);
  if (!value) return '';
  if (value.startsWith('/')) return value;
  if (value.startsWith('#')) return value;
  try {
    const u = new URL(value);
    const p = u.protocol.toLowerCase();
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(p)) return value;
    return '';
  } catch {
    return '';
  }
};

const sanitizeMediaUrl = (url = '') => {
  const value = trim(url, MAX.href);
  if (!value) return '';
  if (value.startsWith('/')) return value;
  try {
    const u = new URL(value);
    const p = u.protocol.toLowerCase();
    if (p === 'http:' || p === 'https:') return value;
    return '';
  } catch {
    return '';
  }
};

const normalizeStringArray = (arr, maxItems, maxLen) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((line) => trim(line, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
};

const emptyMediaRef = (withCaption = false) => {
  const media = { mediaId: '', url: '', alt: '' };
  if (withCaption) media.caption = '';
  return media;
};

/**
 * Media DAM-friendly shape for Admin MediaPicker:
 * { mediaId?, url, alt, caption? }
 * Accepts aliases imageUrl / imageAlt from older payloads.
 */
const normalizeMediaRef = (value, { requireUrl = true, allowCaption = false, label = 'media' } = {}) => {
  if (value == null || value === '') {
    if (requireUrl) {
      return { ok: false, message: `${label} is required` };
    }
    return { ok: true, normalized: emptyMediaRef(allowCaption) };
  }
  if (typeof value !== 'object') {
    return { ok: false, message: `${label} must be an object` };
  }
  const mediaId = trim(value.mediaId ?? value._id ?? '', MAX.mediaId);
  const url = sanitizeMediaUrl(value.url || value.imageUrl || '');
  const alt = trim(value.alt ?? value.imageAlt ?? value.alt_text ?? '', MAX.alt);
  if (requireUrl && !url) {
    return { ok: false, message: `${label}.url is required` };
  }
  const normalized = { mediaId, url, alt };
  if (allowCaption) {
    normalized.caption = trim(value.caption ?? '', MAX.caption);
  }
  return { ok: true, normalized };
};

const isBlankRichText = (value) => {
  if (value == null || value === '') return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return true;
    try {
      const parsed = JSON.parse(trimmed);
      return isBlankRichText(parsed);
    } catch {
      return false;
    }
  }
  if (typeof value !== 'object' || value.type !== 'doc') return false;
  const content = value.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  if (
    content.length === 1 &&
    content[0]?.type === 'paragraph' &&
    (!content[0].content || content[0].content.length === 0)
  ) {
    return true;
  }
  return false;
};

const validateContactCard = (value) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'contactCard must be an object' };
  }
  const heading = trim(value.heading, MAX.heading);
  const buttonHref = sanitizeHref(value.buttonHref);
  const buttonLabel = trim(value.buttonLabel, MAX.buttonLabel);
  const normalized = {
    heading,
    intro: trim(value.intro, MAX.body),
    organizationName: trim(value.organizationName, MAX.org),
    phone: trim(value.phone, MAX.phone),
    email: trim(value.email, MAX.email),
    addressLines: normalizeStringArray(value.addressLines, 8, MAX.addressLine),
    buttonLabel,
    buttonHref,
  };
  const isEmpty =
    !heading &&
    !normalized.intro &&
    !normalized.organizationName &&
    !normalized.phone &&
    !normalized.email &&
    normalized.addressLines.length === 0 &&
    !buttonLabel &&
    !buttonHref;
  if (isEmpty) {
    return { ok: true, normalized };
  }
  if (!heading) {
    return { ok: false, message: 'contactCard requires heading' };
  }
  if (buttonHref && !buttonLabel) {
    return { ok: false, message: 'contactCard buttonLabel required when buttonHref is set' };
  }
  return { ok: true, normalized };
};

const validateCtaCard = (value) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'ctaCard must be an object' };
  }
  const heading = trim(value.heading, MAX.heading);
  const buttonHref = sanitizeHref(value.buttonHref);
  const buttonLabel = trim(value.buttonLabel, MAX.buttonLabel);
  const normalized = {
    heading,
    description: trim(value.description, MAX.body),
    buttonLabel,
    buttonHref,
  };
  const isEmpty =
    !heading && !normalized.description && !buttonLabel && !buttonHref;
  if (isEmpty) {
    return { ok: true, normalized };
  }
  if (!heading) {
    return { ok: false, message: 'ctaCard requires heading' };
  }
  if (buttonHref && !buttonLabel) {
    return { ok: false, message: 'ctaCard buttonLabel required when buttonHref is set' };
  }
  return { ok: true, normalized };
};

const validateSupportPanel = (value) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'supportPanel must be an object' };
  }
  const heading = trim(value.heading, MAX.heading);
  const description = trim(value.description, MAX.body);
  const rawActions = Array.isArray(value.actions) ? value.actions : [];
  const actions = [];
  for (let i = 0; i < rawActions.length; i += 1) {
    const item = rawActions[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `supportPanel action ${i} is invalid` };
    }
    const label = trim(item.label, MAX.buttonLabel);
    const href = sanitizeHref(item.href);
    if (!label && !href) continue;
    if (!label || !href) {
      return { ok: false, message: `supportPanel action ${i} requires label and href` };
    }
    actions.push({ label, href });
  }
  const isEmpty = !heading && !description && actions.length === 0;
  if (isEmpty) {
    return {
      ok: true,
      normalized: { heading: '', description: '', actions: [{ label: '', href: '' }] },
    };
  }
  if (!heading) {
    return { ok: false, message: 'supportPanel requires heading' };
  }
  if (actions.length === 0 || actions.length > MAX.actions) {
    return {
      ok: false,
      message: `supportPanel requires 1–${MAX.actions} actions`,
    };
  }
  return {
    ok: true,
    normalized: { heading, description, actions },
  };
};

const validateLinkCardList = (value) => {
  if (!Array.isArray(value)) {
    return { ok: false, message: 'linkCardList must be an array' };
  }
  if (value.length === 0) {
    return { ok: true, normalized: [] };
  }
  if (value.length > MAX.linkCards) {
    return { ok: false, message: `linkCardList requires at most ${MAX.linkCards} items` };
  }
  const normalized = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `linkCardList item ${i} is invalid` };
    }
    const title = trim(item.title, MAX.cardTitle);
    const href = sanitizeHref(item.href);
    if (!title || !href) {
      return { ok: false, message: `linkCardList item ${i} requires title and href` };
    }
    normalized.push({
      title,
      description: trim(item.description, MAX.cardDesc),
      href,
    });
  }
  return { ok: true, normalized };
};

const validateTestimonialList = (value) => {
  if (!Array.isArray(value)) {
    return { ok: false, message: 'testimonialList must be an array' };
  }
  if (value.length === 0) {
    return { ok: true, normalized: [] };
  }
  if (value.length > MAX.testimonials) {
    return { ok: false, message: `testimonialList requires at most ${MAX.testimonials} items` };
  }
  const normalized = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `testimonialList item ${i} is invalid` };
    }
    const name = trim(item.name, MAX.name);
    const comment = trim(item.comment, MAX.comment);
    if (!name || !comment) {
      return { ok: false, message: `testimonialList item ${i} requires name and comment` };
    }
    normalized.push({
      name,
      role: trim(item.role, MAX.role),
      comment,
    });
  }
  return { ok: true, normalized };
};

const validateVideoTutorialList = (value) => {
  if (!Array.isArray(value)) {
    return { ok: false, message: 'videoTutorialList must be an array' };
  }
  if (value.length === 0) {
    return { ok: true, normalized: [] };
  }
  if (value.length > MAX.videos) {
    return { ok: false, message: `videoTutorialList requires at most ${MAX.videos} items` };
  }
  const normalized = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `videoTutorialList item ${i} is invalid` };
    }
    const title = trim(item.title, MAX.videoTitle);
    const url = sanitizeHref(item.url);
    if (!title || !url) {
      return { ok: false, message: `videoTutorialList item ${i} requires title and url` };
    }
    if (!url.startsWith('https://')) {
      return { ok: false, message: `videoTutorialList item ${i} url must use https://` };
    }
    normalized.push({ title, url });
  }
  return { ok: true, normalized };
};

const validateNoticeBanner = (value) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'noticeBanner must be an object' };
  }
  const heading = trim(value.heading, MAX.heading);
  const description = trim(value.description, MAX.body);
  if (!heading && !description) {
    return { ok: true, normalized: { heading: '', description: '' } };
  }
  if (!heading) {
    return { ok: false, message: 'noticeBanner requires heading' };
  }
  return {
    ok: true,
    normalized: { heading, description },
  };
};

const validateHeroBanner = (value) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'heroBanner must be an object' };
  }
  const title = trim(value.title ?? value.heading ?? '', MAX.title);
  const subcopy = trim(value.subcopy ?? value.description ?? '', MAX.subcopy);
  const ctaLabel = trim(value.ctaLabel ?? value.buttonLabel ?? '', MAX.buttonLabel);
  const ctaHref = sanitizeHref(value.ctaHref ?? value.buttonHref ?? '');
  const mediaInput = value.media || {
    mediaId: value.mediaId,
    url: value.url || value.imageUrl,
    alt: value.alt || value.imageAlt,
  };
  const hasContent = Boolean(title || subcopy || ctaLabel || ctaHref);
  const hasAnyMediaHint = Boolean(
    mediaInput &&
      typeof mediaInput === 'object' &&
      (mediaInput.url || mediaInput.imageUrl || mediaInput.mediaId)
  );
  if (!hasContent && !hasAnyMediaHint) {
    return {
      ok: true,
      normalized: {
        media: emptyMediaRef(false),
        title: '',
        subcopy: '',
        ctaLabel: '',
        ctaHref: '',
      },
    };
  }
  const mediaResult = normalizeMediaRef(mediaInput, {
    requireUrl: true,
    allowCaption: false,
    label: 'heroBanner.media',
  });
  if (!mediaResult.ok) return mediaResult;
  if (ctaHref && !ctaLabel) {
    return { ok: false, message: 'heroBanner ctaLabel required when ctaHref is set' };
  }
  return {
    ok: true,
    normalized: {
      media: mediaResult.normalized,
      title,
      subcopy,
      ctaLabel,
      ctaHref,
    },
  };
};

const validateImageBlock = (value) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'image must be an object' };
  }
  const mediaInput = value.media || {
    mediaId: value.mediaId,
    url: value.url || value.imageUrl,
    alt: value.alt || value.imageAlt,
    caption: value.caption,
  };
  const hasAnyMediaHint = Boolean(
    mediaInput &&
      typeof mediaInput === 'object' &&
      (mediaInput.url ||
        mediaInput.imageUrl ||
        mediaInput.mediaId ||
        mediaInput.caption ||
        mediaInput.alt ||
        mediaInput.imageAlt ||
        mediaInput.alt_text)
  );
  if (!hasAnyMediaHint) {
    return {
      ok: true,
      normalized: { media: emptyMediaRef(true) },
    };
  }
  const mediaResult = normalizeMediaRef(mediaInput, {
    requireUrl: true,
    allowCaption: true,
    label: 'image.media',
  });
  if (!mediaResult.ok) return mediaResult;
  return { ok: true, normalized: { media: mediaResult.normalized } };
};

const validateImageText = (value, { parseRichText, validateRichTextDoc } = {}) => {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: 'imageText must be an object' };
  }
  const mediaInput = value.media || {
    mediaId: value.mediaId,
    url: value.url || value.imageUrl,
    alt: value.alt || value.imageAlt,
    caption: value.caption,
  };
  const bodyRaw = value.bodyRichText ?? value.body ?? '';
  const imagePositionRaw = String(value.imagePosition || 'left').toLowerCase();
  const imagePosition = imagePositionRaw === 'right' ? 'right' : 'left';
  const blankBody = isBlankRichText(bodyRaw);
  const hasAnyMediaHint = Boolean(
    mediaInput &&
      typeof mediaInput === 'object' &&
      (mediaInput.url || mediaInput.imageUrl || mediaInput.mediaId || mediaInput.caption)
  );
  if (!hasAnyMediaHint && blankBody) {
    return {
      ok: true,
      normalized: {
        media: emptyMediaRef(true),
        bodyRichText: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
        imagePosition: 'left',
      },
    };
  }
  const mediaResult = normalizeMediaRef(mediaInput, {
    requireUrl: true,
    allowCaption: true,
    label: 'imageText.media',
  });
  if (!mediaResult.ok) return mediaResult;

  let bodyRichText = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  if (!blankBody) {
    if (!parseRichText || !validateRichTextDoc) {
      return { ok: false, message: 'imageText body validation helpers missing' };
    }
    const parsed = parseRichText(bodyRaw);
    if (!parsed) {
      return { ok: false, message: 'imageText bodyRichText must be valid structured JSON' };
    }
    const bodyValidation = validateRichTextDoc(parsed);
    if (!bodyValidation.ok) return bodyValidation;
    bodyRichText =
      typeof bodyRaw === 'string' ? bodyRaw.trim() : JSON.stringify(parsed);
  }

  return {
    ok: true,
    normalized: {
      media: mediaResult.normalized,
      bodyRichText,
      imagePosition,
    },
  };
};

const validateCardGrid = (value) => {
  if (!Array.isArray(value)) {
    if (value && typeof value === 'object' && Array.isArray(value.items)) {
      return validateCardGrid(value.items);
    }
    return { ok: false, message: 'cardGrid must be an array of cards' };
  }
  if (value.length === 0) {
    return { ok: true, normalized: [] };
  }
  if (value.length > MAX.cards) {
    return { ok: false, message: `cardGrid allows at most ${MAX.cards} cards` };
  }
  const normalized = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `cardGrid item ${i} is invalid` };
    }
    const title = trim(item.title, MAX.cardTitle);
    if (!title) {
      return { ok: false, message: `cardGrid item ${i} requires title` };
    }
    const href = sanitizeHref(item.href || '');
    let media = emptyMediaRef(false);
    if (item.media || item.imageUrl || item.url) {
      const mediaResult = normalizeMediaRef(item.media || item, {
        requireUrl: false,
        allowCaption: false,
        label: `cardGrid item ${i} media`,
      });
      if (!mediaResult.ok) return mediaResult;
      media = mediaResult.normalized;
    }
    normalized.push({
      title,
      description: trim(item.description, MAX.cardDesc),
      href,
      media,
    });
  }
  return { ok: true, normalized };
};

const validateStructuredZone = (type, value, helpers = {}) => {
  if (type === 'contactCard') return validateContactCard(value);
  if (type === 'ctaCard' || type === 'cta') return validateCtaCard(value);
  if (type === 'supportPanel') return validateSupportPanel(value);
  if (type === 'noticeBanner') return validateNoticeBanner(value);
  if (type === 'linkCardList') return validateLinkCardList(value);
  if (type === 'testimonialList') return validateTestimonialList(value);
  if (type === 'videoTutorialList') return validateVideoTutorialList(value);
  if (type === 'heroBanner') return validateHeroBanner(value);
  if (type === 'image') return validateImageBlock(value);
  if (type === 'imageText') return validateImageText(value, helpers);
  if (type === 'cardGrid') return validateCardGrid(value);
  return { ok: false, message: `Unknown structured zone type "${type}"` };
};

const defaultContactCard = (overrides = {}) => ({
  heading: 'Need to contact us?',
  intro: 'Contact us for any queries.',
  organizationName: 'ANBAZAR',
  phone: '(+91) 9153561076',
  email: 'support@anbazar.in',
  addressLines: [
    'Shambhupur, Chakshanjadi, Jamalpur',
    'Purba Bardhaman, WB, India, 713124',
  ],
  buttonLabel: 'Email Us',
  buttonHref: 'mailto:support@anbazar.in',
  ...overrides,
});

const defaultCtaCard = (overrides = {}) => ({
  heading: 'Need More Help?',
  description: 'Reach out to our support team.',
  buttonLabel: 'Contact Support',
  buttonHref: 'mailto:support@anbazar.in',
  ...overrides,
});

const defaultSupportPanel = (overrides = {}) => ({
  heading: 'Need Help?',
  description: 'Our support team is always ready to assist you.',
  actions: [
    { label: 'support@anbazar.in', href: 'mailto:support@anbazar.in' },
    { label: 'WhatsApp', href: 'https://wa.me/919999999999' },
  ],
  ...overrides,
});

const defaultNoticeBanner = (overrides = {}) => ({
  heading: 'Important',
  description: '',
  ...overrides,
});

const emptyHeroBanner = () => ({
  media: emptyMediaRef(false),
  title: '',
  subcopy: '',
  ctaLabel: '',
  ctaHref: '',
});

const emptyImageBlock = () => ({ media: emptyMediaRef(true) });

const emptyImageText = () => ({
  media: emptyMediaRef(true),
  bodyRichText: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
  imagePosition: 'left',
});

const emptyCtaCard = () => ({
  heading: '',
  description: '',
  buttonLabel: '',
  buttonHref: '',
});

const emptyContactCard = () => ({
  heading: '',
  intro: '',
  organizationName: '',
  phone: '',
  email: '',
  addressLines: [],
  buttonLabel: '',
  buttonHref: '',
});

const emptySupportPanel = () => ({
  heading: '',
  description: '',
  actions: [{ label: '', href: '' }],
});

module.exports = {
  AAURIKAA_SECTION_TYPES,
  MAX,
  validateStructuredZone,
  validateHeroBanner,
  validateImageBlock,
  validateImageText,
  validateCardGrid,
  validateContactCard,
  validateCtaCard,
  validateSupportPanel,
  normalizeMediaRef,
  emptyMediaRef,
  emptyHeroBanner,
  emptyImageBlock,
  emptyImageText,
  emptyCtaCard,
  emptyContactCard,
  emptySupportPanel,
  defaultContactCard,
  defaultCtaCard,
  defaultSupportPanel,
  defaultNoticeBanner,
  sanitizeHref,
  sanitizeMediaUrl,
  isBlankRichText,
};
