/**
 * Smoke test for static page payload validation (no DB).
 * Usage: node backend/scripts/test-static-page-validation.js
 */
const { validateStaticPagePayload } = require('../utils/staticPageValidation');

const validPayload = {
  pageKey: 'cookies',
  status: 'published',
  seo: { title: 'Cookie Policy | Anbazar', metaDescription: 'Cookie policy description.' },
  zones: {
    heroSubtitle: 'We use cookies.',
    lastUpdated: 'December 31, 2025',
    mainContent: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Managing cookies text.' }],
        },
      ],
    }),
    cookieSupportCta: {
      heading: 'Managing Cookies',
      description: '',
      buttonLabel: 'Contact Support',
      buttonHref: 'mailto:support@anbazar.in',
    },
  },
};

async function run() {
  const ok = await validateStaticPagePayload(validPayload);
  if (!ok.ok) {
    console.error('Expected valid payload to pass:', ok);
    process.exit(1);
  }
  console.log('✓ valid cookies payload');

  const badKey = await validateStaticPagePayload({ ...validPayload, pageKey: 'not-a-page' });
  if (badKey.ok) {
    console.error('Expected invalid pageKey to fail');
    process.exit(1);
  }
  console.log('✓ rejects unknown pageKey');

  const badHtml = await validateStaticPagePayload({
    ...validPayload,
    zones: { ...validPayload.zones, mainContent: '<p>not json</p>' },
  });
  if (badHtml.ok) {
    console.error('Expected invalid rich text to fail');
    process.exit(1);
  }
  console.log('✓ rejects non-structured richText');

  const privacyPayload = {
    pageKey: 'privacy-policy',
    status: 'published',
    seo: {
      title: 'Privacy Policy | Anbazar',
      metaDescription: 'Privacy policy description.',
    },
    zones: {
      heroSubtitle: 'Hero text',
      lastUpdated: 'January 2025',
      sections: [
        {
          title: 'Information We Collect',
          bodyRichText: JSON.stringify({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'We collect basic account data.' }],
              },
            ],
          }),
        },
      ],
      primaryContactCard: {
        heading: 'Need to contact us?',
        intro: 'Privacy queries.',
        organizationName: 'ANBAZAR',
        phone: '(+91) 9153561076',
        email: 'support@anbazar.in',
        addressLines: ['India'],
        buttonLabel: 'Email Us',
        buttonHref: 'mailto:support@anbazar.in',
      },
      secondarySupportCard: {
        heading: 'Need More Help?',
        description: 'Reach out for privacy questions.',
        buttonLabel: 'Contact Support',
        buttonHref: 'mailto:support@anbazar.in',
      },
    },
  };
  const privacyOk = await validateStaticPagePayload(privacyPayload);
  if (!privacyOk.ok) {
    console.error('Expected valid privacy-policy sectionList payload to pass:', privacyOk);
    process.exit(1);
  }
  console.log('✓ valid privacy-policy sectionList payload');

  const termsContactPayload = {
    pageKey: 'terms-condition',
    status: 'published',
    seo: { title: 'Terms & Conditions | Anbazar', metaDescription: 'Terms description.' },
    zones: {
      heroSubtitle: 'Please read these terms carefully.',
      lastUpdated: 'January 2025',
      sections: [
        {
          title: 'Use of Website',
          bodyRichText: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lawful use only.' }] }],
          }),
        },
      ],
      primaryContactCard: {
        heading: 'Need to contact us?',
        intro: 'Contact us for queries.',
        organizationName: 'ANBAZAR',
        phone: '(+91) 9153561076',
        email: 'support@anbazar.in',
        addressLines: ['Purba Bardhaman, WB, India'],
        buttonLabel: 'Email Us',
        buttonHref: 'mailto:support@anbazar.in',
      },
      secondarySupportCard: {
        heading: 'Need Assistance?',
        description: 'Reach out to support.',
        buttonLabel: 'Contact Support',
        buttonHref: 'mailto:support@anbazar.in',
      },
    },
  };
  const termsOk = await validateStaticPagePayload(termsContactPayload);
  if (!termsOk.ok) {
    console.error('Expected valid terms-condition structured UI payload:', termsOk);
    process.exit(1);
  }
  console.log('✓ valid terms-condition contactCard + ctaCard payload');

  const faqPayload = {
    pageKey: 'faq',
    status: 'published',
    seo: { title: 'FAQ | Anbazar', metaDescription: 'FAQ description.' },
    zones: {
      heroSubtitle: 'Find quick answers.',
      faqItems: [
        {
          category: 'Orders',
          q: 'How can I track my order?',
          a: 'Go to My Account → My Orders and click on Track Order.',
        },
      ],
      supportPanel: {
        heading: 'Still need help?',
        description: 'Our support team is ready.',
        actions: [{ label: 'Contact', href: '/contact' }],
      },
    },
  };
  const faqOk = await validateStaticPagePayload(faqPayload);
  if (!faqOk.ok) {
    console.error('Expected valid faq faqList payload to pass:', faqOk);
    process.exit(1);
  }
  console.log('✓ valid faq faqList payload');

  const sellerFaqRichAnswer = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Visit the ' },
          {
            type: 'text',
            text: 'Seller Registration page',
            marks: [{ type: 'link', attrs: { href: '/seller/register' } }],
          },
          { type: 'text', text: ' to get started.' },
        ],
      },
    ],
  });

  const sellerFaqPayload = {
    pageKey: 'seller-faq',
    status: 'published',
    seo: { title: 'Seller FAQ | Anbazar', metaDescription: 'Seller FAQ description.' },
    zones: {
      heroSubtitle: 'Everything you need to know to sell successfully on Anbazar',
      faqItems: [
        {
          category: 'Getting Started',
          q: 'How can I register as a seller on Anbazar?',
          a: 'Visit the Seller Registration page to get started.',
          aRichText: sellerFaqRichAnswer,
        },
      ],
      supportPanel: {
        heading: 'Need seller support?',
        description: 'Our seller success team is here to help you grow.',
        actions: [{ label: 'Seller Support', href: '/seller-help-center' }],
      },
    },
  };
  const sellerFaqOk = await validateStaticPagePayload(sellerFaqPayload);
  if (!sellerFaqOk.ok) {
    console.error('Expected valid seller-faq rich FAQ payload to pass:', sellerFaqOk);
    process.exit(1);
  }
  console.log('✓ valid seller-faq rich FAQ payload');

  const sellerFaqPlainOnly = await validateStaticPagePayload({
    ...sellerFaqPayload,
    zones: {
      ...sellerFaqPayload.zones,
      faqItems: [
        {
          category: 'Commission',
          q: 'What commission does Anbazar charge?',
          a: 'Commission varies by product category.',
        },
      ],
    },
  });
  if (!sellerFaqPlainOnly.ok) {
    console.error('Expected seller-faq plain-only FAQ to pass:', sellerFaqPlainOnly);
    process.exit(1);
  }
  console.log('✓ valid seller-faq plain-only FAQ payload');

  const sellerFaqBadRich = await validateStaticPagePayload({
    ...sellerFaqPayload,
    zones: {
      ...sellerFaqPayload.zones,
      faqItems: [
        {
          category: '',
          q: 'Bad rich answer?',
          a: '',
          aRichText: '<p>not valid json</p>',
        },
      ],
    },
  });
  if (sellerFaqBadRich.ok) {
    console.error('Expected seller-faq to reject invalid aRichText');
    process.exit(1);
  }
  console.log('✓ rejects seller-faq invalid aRichText');

  const sellerHelpPayload = {
    pageKey: 'seller-help-center',
    status: 'published',
    seo: {
      title: 'Seller Help Center | Anbazar',
      metaDescription: 'Seller help center description.',
    },
    zones: {
      heroSubtitle: 'We are here to help you succeed on Anbazar',
      helpLinkCards: [
        { title: 'Seller FAQ', description: 'Answers', href: '/seller-faq' },
      ],
      sellerNotice: {
        heading: 'Important for Sellers',
        description: 'Raise issues through the Seller Dashboard with order ID and screenshots.',
      },
      videoTutorials: [
        { title: 'Seller Dashboard Overview', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
        { title: 'How to Create Product Listings', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
      ],
    },
  };
  const sellerHelpOk = await validateStaticPagePayload(sellerHelpPayload);
  if (!sellerHelpOk.ok) {
    console.error('Expected valid seller-help-center payload to pass:', sellerHelpOk);
    process.exit(1);
  }
  console.log('✓ valid seller-help-center payload');

  const sellerHelpBadVideo = await validateStaticPagePayload({
    ...sellerHelpPayload,
    zones: {
      ...sellerHelpPayload.zones,
      videoTutorials: [{ title: 'Bad URL', url: 'http://example.com/video' }],
    },
  });
  if (sellerHelpBadVideo.ok) {
    console.error('Expected seller-help-center to reject non-https video URL');
    process.exit(1);
  }
  console.log('✓ rejects seller-help-center non-https video URL');

  const helpCenterPayload = {
    pageKey: 'help-center',
    status: 'published',
    seo: { title: 'Help Center | AnBazar', metaDescription: 'Help center.' },
    zones: {
      heroSubtitle: 'Find answers quickly.',
      helpTopics: [
        { title: 'Orders', description: 'Track orders', href: '/help/orders' },
      ],
      videoTutorials: [
        { title: 'Track orders', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
      ],
      faqItems: [{ category: '', q: 'How to track?', a: 'Use My Orders.' }],
      supportPanel: {
        heading: 'Need More Help?',
        description: '',
        actions: [{ label: 'Contact', href: '/contact' }],
      },
      testimonials: [{ name: 'Rina', role: 'Seller', comment: 'Great platform!' }],
    },
  };
  const helpOk = await validateStaticPagePayload(helpCenterPayload);
  if (!helpOk.ok) {
    console.error('Expected valid help-center payload:', helpOk);
    process.exit(1);
  }
  console.log('✓ valid help-center structured UI payload');

  const becomeSellerPayload = {
    pageKey: 'become-seller',
    status: 'published',
    seo: { title: 'Become a Seller | Anbazar', metaDescription: 'Sell on Anbazar.' },
    zones: {
      heroSubtitle: 'Join and start selling.',
      intro: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      whySellTopics: [{ title: 'Fast Onboarding', description: 'Quick start', href: '#' }],
      faqItems: [{ q: 'Is registration free?', a: 'Yes.' }],
      sellerActions: {
        heading: 'Seller account',
        description: '',
        actions: [{ label: 'Login', href: '/seller/login' }],
      },
    },
  };
  const becomeOk = await validateStaticPagePayload(becomeSellerPayload);
  if (!becomeOk.ok) {
    console.error('Expected valid become-seller payload:', becomeOk);
    process.exit(1);
  }
  console.log('✓ valid become-seller structured UI payload');

  const aboutPayload = {
    pageKey: 'about',
    status: 'published',
    seo: { title: 'About Us | Anbazar', metaDescription: 'About Anbazar.' },
    zones: {
      heroSubtitle: 'Subtitle',
      intro: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      mainContent: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      coreValues: [
        { title: 'A', description: 'a', href: '#' },
        { title: 'B', description: 'b', href: '#' },
        { title: 'C', description: 'c', href: '#' },
        { title: 'D', description: 'd', href: '#' },
      ],
      testimonials: [
        { name: 'One', role: 'R1', comment: 'c1' },
        { name: 'Two', role: 'R2', comment: 'c2' },
        { name: 'Three', role: 'R3', comment: 'c3' },
        { name: 'Four', role: 'R4', comment: 'c4' },
        { name: 'Five', role: 'R5', comment: 'c5' },
      ],
      offerCta: { heading: 'CTA', description: '', buttonLabel: '', buttonHref: '' },
    },
  };
  const aboutOk = await validateStaticPagePayload(aboutPayload);
  if (!aboutOk.ok) {
    console.error('Expected valid about fixed-slot payload:', aboutOk);
    process.exit(1);
  }
  console.log('✓ valid about fixed-slot structured payload');

  const aboutBadCount = {
    ...aboutPayload,
    zones: { ...aboutPayload.zones, coreValues: [{ title: 'Only', description: '', href: '#' }] },
  };
  const aboutBadOk = await validateStaticPagePayload(aboutBadCount);
  if (aboutBadOk.ok) {
    console.error('Expected about to reject wrong coreValues count');
    process.exit(1);
  }
  console.log('✓ rejects about coreValues with wrong fixed count');

  const accessibilityPayload = {
    pageKey: 'accessibility',
    status: 'published',
    seo: { title: 'Accessibility | Anbazar', metaDescription: 'Accessibility.' },
    zones: {
      heroSubtitle: 'Inclusive shopping for all.',
      lastUpdated: 'December 31, 2025',
      featureCards: [
        { title: 'Keyboard Navigation', description: 'Navigate with keyboard.', href: '#' },
      ],
      assistanceCta: {
        heading: 'Need Assistance?',
        description: 'Contact us.',
        buttonLabel: 'Contact',
        buttonHref: 'mailto:support@anbazar.in',
      },
      mainContent: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
    },
  };
  const accessibilityOk = await validateStaticPagePayload(accessibilityPayload);
  if (!accessibilityOk.ok) {
    console.error('Expected valid accessibility payload with legacy zone ignored:', accessibilityOk);
    process.exit(1);
  }
  if (accessibilityOk.normalized.zones.mainContent !== undefined) {
    console.error('Legacy mainContent should be stripped from normalized zones');
    process.exit(1);
  }
  console.log('✓ accessibility ignores legacy unknown zone keys');

  console.log('All static page validation checks passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
