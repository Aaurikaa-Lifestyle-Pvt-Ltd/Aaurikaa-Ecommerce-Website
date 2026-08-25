const {
  defaultCtaCard,
  defaultSupportPanel,
  defaultNoticeBanner,
} = require('../utils/staticPageStructuredZones');
const { phase4Manifests } = require('./phase4Manifests');

const EMPTY_TIPTAP_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** Zone field definitions per pageKey */
const MANIFESTS = {
  cookies: {
    pageKey: 'cookies',
    label: 'Cookies Policy',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'mainContent', type: 'richText', label: 'Main content (managing cookies & notes)' },
      { id: 'cookieSupportCta', type: 'ctaCard', label: 'Managing cookies CTA button' },
    ],
    seoDefaults: {
      title: 'Cookie Policy | Anbazar',
      metaDescription:
        "Learn about Anbazar's Cookie Policy, how we use cookies, and manage your preferences for a better shopping experience.",
    },
    zoneDefaults: {
      heroSubtitle:
        'We use cookies to enhance your experience, understand preferences, and provide personalized content.',
      lastUpdated: 'December 31, 2025',
      mainContent: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'You can manage your cookie preferences through your browser settings. Disabling certain cookies may affect website functionality.',
              },
            ],
          },
        ],
      }),
      cookieSupportCta: defaultCtaCard({
        heading: 'Managing Cookies',
        description: '',
        buttonLabel: 'Contact Support',
        buttonHref: 'mailto:support@anbazar.in',
      }),
    },
  },
  'security-policy': {
    pageKey: 'security-policy',
    label: 'Security Policy',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'mainContent', type: 'richText', label: 'Main content (overview & user responsibility)' },
      {
        id: 'securityReportBanner',
        type: 'ctaCard',
        label: 'Report security concern banner',
      },
    ],
    seoDefaults: {
      title: 'Security Policy | Anbazar',
      metaDescription:
        'Learn how Anbazar protects your data, payments, and account with industry-standard security practices.',
    },
    zoneDefaults: {
      heroSubtitle: 'Your trust & safety are our top priority',
      lastUpdated: 'January 2025',
      mainContent: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'At AnBazar.com, security is built into every layer of our platform. We are committed to protecting customer data, seller information, and all financial transactions with robust security technologies and strict internal policies.',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'We encourage users to use strong passwords, enable additional security features when available, and stay alert against phishing or fraudulent communications. Never share your login credentials with anyone.',
              },
            ],
          },
        ],
      }),
      securityReportBanner: defaultCtaCard({
        heading: 'Report a Security Concern',
        description:
          'If you notice any suspicious activity or potential security issues, please report them immediately.',
        buttonLabel: 'Report Security Issue',
        buttonHref: '/contact',
      }),
    },
  },
  'warranty-guarantee': {
    pageKey: 'warranty-guarantee',
    label: 'Warranty & Guarantee',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'mainContent', type: 'richText', label: 'Intro / overview (sections below stay in layout)' },
      { id: 'assistanceCta', type: 'ctaCard', label: 'Warranty assistance CTA' },
    ],
    seoDefaults: {
      title: 'Warranty & Guarantee | Anbazar',
      metaDescription:
        'Learn about warranty and guarantee policies, coverage details, exclusions, and how to claim warranty for products.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Understand our warranty and guarantee policies for all products. Ensure hassle-free support for your purchases.',
      lastUpdated: 'January 2025',
      mainContent: JSON.stringify(EMPTY_TIPTAP_DOC),
      assistanceCta: defaultCtaCard({
        heading: 'Need Assistance?',
        description: 'Reach out to our support team for any warranty or guarantee queries.',
        buttonLabel: 'Contact Support',
        buttonHref: '/contact',
      }),
    },
  },
  'privacy-policy': {
    pageKey: 'privacy-policy',
    label: 'Privacy Policy',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'sections', type: 'sectionList', label: 'Policy sections' },
      { id: 'primaryContactCard', type: 'contactCard', label: 'Contact card' },
      { id: 'secondarySupportCard', type: 'ctaCard', label: 'Support CTA' },
    ],
    seoDefaults: {
      title: 'Privacy Policy | AAURIKAA',
      metaDescription: '',
    },
    // Structure only — do not invent AAURIKAA privacy substance.
    zoneDefaults: {
      heroSubtitle: '',
      lastUpdated: '',
      sections: [],
      primaryContactCard: {
        heading: '',
        intro: '',
        organizationName: '',
        phone: '',
        email: '',
        addressLines: [],
        buttonLabel: '',
        buttonHref: '',
      },
      secondarySupportCard: {
        heading: '',
        description: '',
        buttonLabel: '',
        buttonHref: '',
      },
    },
  },
  'terms-condition': {
    pageKey: 'terms-condition',
    label: 'Terms & Conditions',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'sections', type: 'sectionList', label: 'Policy sections' },
      { id: 'primaryContactCard', type: 'contactCard', label: 'Contact card' },
      { id: 'secondarySupportCard', type: 'ctaCard', label: 'Support CTA' },
    ],
    seoDefaults: {
      title: 'Terms & Conditions | AAURIKAA',
      metaDescription: '',
    },
    // Structure only — do not invent AAURIKAA legal substance.
    zoneDefaults: {
      heroSubtitle: '',
      lastUpdated: '',
      sections: [],
      primaryContactCard: {
        heading: '',
        intro: '',
        organizationName: '',
        phone: '',
        email: '',
        addressLines: [],
        buttonLabel: '',
        buttonHref: '',
      },
      secondarySupportCard: {
        heading: '',
        description: '',
        buttonLabel: '',
        buttonHref: '',
      },
    },
  },
  'returns-refund-policy': {
    pageKey: 'returns-refund-policy',
    label: 'Returns & Refund Policy',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'sections', type: 'sectionList', label: 'Policy sections' },
      { id: 'faqItems', type: 'faqList', label: 'FAQ items' },
      { id: 'supportPanel', type: 'supportPanel', label: 'Support panel' },
    ],
    seoDefaults: {
      title: 'Returns & Refund Policy | AAURIKAA',
      metaDescription: '',
    },
    // HOLD — structure only; never invent refund/return substance.
    zoneDefaults: {
      heroSubtitle: '',
      lastUpdated: '',
      sections: [],
      faqItems: [],
      supportPanel: {
        heading: '',
        description: '',
        actions: [{ label: '', href: '' }],
      },
    },
  },
  'shipping-policy': {
    pageKey: 'shipping-policy',
    label: 'Shipping & Delivery',
    zones: [
      { id: 'hero', type: 'heroBanner', label: 'Hero banner' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      {
        id: 'sections',
        type: 'orderedSections',
        label: 'Shipping sections',
        allowedSectionTypes: ['richText', 'image', 'imageText', 'cardGrid', 'faqList', 'ctaCard'],
      },
      { id: 'supportCta', type: 'ctaCard', label: 'Shipping support CTA' },
    ],
    seoDefaults: {
      title: 'Shipping & Delivery | AAURIKAA',
      metaDescription: '',
    },
    zoneDefaults: {
      hero: {
        media: { mediaId: '', url: '', alt: '' },
        title: '',
        subcopy: '',
        ctaLabel: '',
        ctaHref: '',
      },
      lastUpdated: '',
      sections: [],
      supportCta: {
        heading: '',
        description: '',
        buttonLabel: '',
        buttonHref: '',
      },
    },
  },
  faq: {
    pageKey: 'faq',
    label: 'FAQ',
    zones: [
      { id: 'hero', type: 'heroBanner', label: 'Hero banner' },
      { id: 'faqItems', type: 'faqList', label: 'FAQ items' },
      { id: 'supportPanel', type: 'supportPanel', label: 'Support CTA panel' },
    ],
    seoDefaults: {
      title: 'FAQ | AAURIKAA',
      metaDescription: '',
    },
    zoneDefaults: {
      hero: {
        media: { mediaId: '', url: '', alt: '' },
        title: '',
        subcopy: '',
        ctaLabel: '',
        ctaHref: '',
      },
      faqItems: [],
      supportPanel: {
        heading: '',
        description: '',
        actions: [{ label: '', href: '' }],
      },
    },
  },
  'seller-faq': {
    pageKey: 'seller-faq',
    label: 'Seller FAQ',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'faqItems', type: 'faqList', label: 'FAQ items' },
      { id: 'supportPanel', type: 'supportPanel', label: 'Support CTA panel' },
    ],
    seoDefaults: {
      title: 'Seller FAQ | Anbazar',
      metaDescription:
        'Seller FAQ for Anbazar. Find answers related to registration, commission, payouts, offline sales, returns, and seller policies.',
    },
    zoneDefaults: {
      heroSubtitle: 'Everything you need to know to sell successfully on Anbazar',
      faqItems: [
        {
          category: 'Getting Started',
          q: 'How can I register as a seller on Anbazar?',
          a: 'You can register by visiting the Seller Registration page and submitting your business details, bank information, and required documents for verification.',
        },
        {
          category: 'Getting Verified',
          q: 'How long does seller verification take?',
          a: 'Seller verification usually takes 24–72 business hours after successful document submission.',
        },
        {
          category: 'Commission',
          q: 'What commission does Anbazar charge?',
          a: 'Commission varies by product category. Exact commission rates are shown in your Seller Dashboard.',
        },
        {
          category: 'Payments',
          q: 'When will I receive my payouts?',
          a: 'Seller payouts are processed as per Anbazar settlement cycle after delivery confirmation and return window closure.',
        },
        {
          category: 'Orders',
          q: 'How do I process and ship orders?',
          a: 'Once you receive an order, you must pack and mark it as ready for pickup within the defined SLA. Courier pickup will be arranged or self-shipping as per your settings.',
        },
        {
          category: 'Returns & RTO',
          q: 'Who bears the cost of returns and RTO?',
          a: 'Return and RTO charges may be deducted from seller settlements based on reason codes and Anbazar return policy.',
        },
        {
          category: 'Offline Sales',
          q: 'Can I ask customers to buy offline?',
          a: 'No. Sellers are strictly prohibited from diverting customers to offline or external channels. Violations may lead to penalties or account suspension.',
        },
        {
          category: 'Pricing',
          q: 'Can I offer lower prices in my offline store?',
          a: 'No. As per Price Parity Policy, sellers must maintain equal or higher offline pricing compared to Anbazar platform prices.',
        },
        {
          category: 'Product Listing',
          q: 'What products are not allowed to sell?',
          a: 'Prohibited items include counterfeit products, illegal goods, restricted items, and products violating Indian laws or Anbazar policies.',
        },
        {
          category: 'Account',
          q: 'Can my seller account be suspended?',
          a: 'Yes. Accounts may be suspended for policy violations, high return rates, offline deal attempts, fake orders, or repeated customer complaints.',
        },
        {
          category: 'Compliance',
          q: 'Do I need GST to sell on Anbazar?',
          a: 'GST requirements depend on product category and applicable Indian tax laws. Sellers are responsible for GST compliance.',
        },
        {
          category: 'Support',
          q: 'How can I contact seller support?',
          a: 'You can raise a ticket from Seller Dashboard or email us at support@anbazar.in for seller-related queries.',
        },
      ],
      supportPanel: defaultSupportPanel({
        heading: 'Need seller support?',
        description: 'Our seller success team is here to help you grow.',
        actions: [
          { label: 'Seller Support', href: '/seller-help-center' },
          { label: 'WhatsApp', href: 'https://wa.me/919999999999' },
        ],
      }),
    },
  },
  'help-center': {
    pageKey: 'help-center',
    label: 'Help Center',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'helpTopics', type: 'linkCardList', label: 'Help topic cards' },
      { id: 'videoTutorials', type: 'videoTutorialList', label: 'Video tutorials' },
      { id: 'faqItems', type: 'faqList', label: 'FAQ items' },
      { id: 'supportPanel', type: 'supportPanel', label: 'Support actions' },
      { id: 'testimonials', type: 'testimonialList', label: 'Testimonials' },
    ],
    seoDefaults: {
      title: 'Help Center | AnBazar',
      metaDescription:
        'Find answers to your questions, get support, and resolve issues quickly with AnBazar Help Center.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Find answers quickly and get support whenever you need it / দ্রুত উত্তর পান এবং সাহায্য পান।',
      faqItems: [
        {
          category: '',
          q: 'How can I track my order? / আমার অর্ডার কিভাবে ট্র্যাক করব?',
          a: 'You can track your order from the My Orders section in your account. / আপনার অ্যাকাউন্টের My Orders সেকশন থেকে অর্ডার ট্র্যাক করতে পারেন।',
        },
        {
          category: '',
          q: 'How do I request a return or refund? / রিটার্ন বা রিফান্ড কিভাবে চাইব?',
          a: 'Go to My Orders, open your delivered order, and click Request a return in the Return & Refund section. Read our Returns & Refund Policy for full details. / My Orders-এ গিয়ে ডেলিভার্ড অর্ডার খুলে Return & Refund সেকশনে Request a return ক্লিক করুন। বিস্তারিত জানতে Returns & Refund Policy দেখুন।',
        },
        {
          category: '',
          q: 'How can I contact customer support? / কাস্টমার সাপোর্টে কিভাবে যোগাযোগ করব?',
          a: 'You can contact us via Live Chat, WhatsApp, or Contact Us page. / Live Chat, WhatsApp অথবা Contact Us পেজ ব্যবহার করে যোগাযোগ করতে পারেন।',
        },
        {
          category: '',
          q: 'How long does delivery take? / ডেলিভারি কত সময়ে হবে?',
          a: 'Delivery typically takes 3-7 business days. / সাধারণত ডেলিভারি হয় ৩–৭ কর্মদিবসের মধ্যে।',
        },
        {
          category: '',
          q: 'How do I update my account information? / আমার অ্যাকাউন্ট তথ্য কিভাবে আপডেট করব?',
          a: 'Go to Account Settings in your profile to update details. / প্রোফাইলে Account Settings থেকে তথ্য আপডেট করুন।',
        },
      ],
      helpTopics: [
        {
          title: 'Orders & Delivery / অর্ডার ও ডেলিভারি',
          description: 'Track orders, shipping & delivery info',
          href: '/help/orders',
        },
        {
          title: 'Returns & Refunds / রিটার্ন ও রিফান্ড',
          description: 'Return policy & refund timelines',
          href: '/returns-refund-policy',
        },
        {
          title: 'Payments & Billing / পেমেন্ট ও বিলিং',
          description: 'Payment methods & billing issues',
          href: '/help/payments',
        },
        {
          title: 'Account & Security / অ্যাকাউন্ট ও সিকিউরিটি',
          description: 'Login, password & account safety',
          href: '/help/account',
        },
      ],
      videoTutorials: [
        {
          title: 'How to Track Orders / অর্ডার ট্র্যাকিং',
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        },
        {
          title: 'How to Request Returns / রিটার্ন আবেদন',
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        },
      ],
      supportPanel: defaultSupportPanel({
        heading: 'Need More Help? / আরও সাহায্য দরকার?',
        description: '',
        actions: [
          { label: '💬 Live Chat', href: '/contact' },
          { label: '📱 WhatsApp Support', href: 'https://wa.me/919999999999' },
          { label: '✉️ Contact Us', href: '/contact' },
        ],
      }),
      testimonials: [
        {
          name: 'Rina Das',
          role: 'Seller',
          comment: 'AnBazar helped me reach thousands of customers effortlessly!',
        },
        {
          name: 'Anik Roy',
          role: 'Customer',
          comment: 'I found all my answers quickly. Support is amazing!',
        },
      ],
    },
  },
  'seller-help-center': {
    pageKey: 'seller-help-center',
    label: 'Seller Help Center',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'helpLinkCards', type: 'linkCardList', label: 'Help option cards' },
      { id: 'videoTutorials', type: 'videoTutorialList', label: 'Video tutorials' },
      { id: 'sellerNotice', type: 'noticeBanner', label: 'Important notice (yellow box)' },
    ],
    seoDefaults: {
      title: 'Seller Help Center | Anbazar',
      metaDescription:
        'Seller Help Center for Anbazar. Get support, raise tickets, access seller resources, and contact seller success team.',
    },
    zoneDefaults: {
      heroSubtitle: 'We are here to help you succeed on Anbazar',
      helpLinkCards: [
        {
          title: 'Raise a Support Ticket',
          description: 'Create a ticket for order, payment, return, or technical issues.',
          href: '/seller/support',
        },
        {
          title: 'Email Seller Support',
          description: 'Contact our seller support team via email.',
          href: 'mailto:support@anbazar.in',
        },
        {
          title: 'WhatsApp Support',
          description: 'Chat with our seller success team on WhatsApp.',
          href: 'https://wa.me/919999999999',
        },
        {
          title: 'Seller FAQ',
          description: 'Find quick answers to common seller questions.',
          href: '/seller-faq',
        },
        {
          title: 'Technical Help',
          description: 'Get help with dashboard, listings, and integrations.',
          href: '/seller/support',
        },
        {
          title: 'Report Policy Violation',
          description: 'Report fraud, abuse, or serious policy concerns.',
          href: '/seller/support',
        },
      ],
      videoTutorials: [
        {
          title: 'Seller Dashboard Overview',
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        },
        {
          title: 'How to Create Product Listings',
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        },
      ],
      sellerNotice: defaultNoticeBanner({
        heading: 'Important for Sellers',
        description:
          'For faster resolution, always raise issues through the Seller Dashboard with proper order ID, screenshots, and clear description. This helps us resolve your issue quickly and accurately.',
      }),
    },
  },
  ...phase4Manifests,
};

const ZONE_TYPES = new Set([
  'plainText',
  'richText',
  'sectionList',
  'orderedSections',
  'faqList',
  'contactCard',
  'ctaCard',
  'cta',
  'supportPanel',
  'noticeBanner',
  'linkCardList',
  'testimonialList',
  'videoTutorialList',
  'heroBanner',
  'image',
  'imageText',
  'cardGrid',
]);

function getManifest(pageKey) {
  return MANIFESTS[pageKey] || null;
}

function getManifestOrThrow(pageKey) {
  const manifest = getManifest(pageKey);
  if (!manifest) {
    const err = new Error(`No manifest for pageKey: ${pageKey}`);
    err.code = 'MANIFEST_NOT_FOUND';
    throw err;
  }
  return manifest;
}

module.exports = {
  MANIFESTS,
  ZONE_TYPES,
  EMPTY_TIPTAP_DOC,
  getManifest,
  getManifestOrThrow,
};
