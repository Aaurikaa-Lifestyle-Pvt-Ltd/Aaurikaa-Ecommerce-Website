const { paragraphSection, bulletSection, bulletSectionWithVideoLinks } = require('../utils/staticPageSectionBuilders');
const {
  defaultCtaCard,
  defaultSupportPanel,
  defaultNoticeBanner,
} = require('../utils/staticPageStructuredZones');

const EMPTY_TIPTAP_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const tiptapParagraph = (text) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

const phase4Manifests = {
  about: {
    pageKey: 'about',
    label: 'About AAURIKAA',
    zones: [
      { id: 'hero', type: 'heroBanner', label: 'Hero banner' },
      {
        id: 'sections',
        type: 'orderedSections',
        label: 'Ordered page sections',
        allowedSectionTypes: [
          'richText',
          'image',
          'imageText',
          'cardGrid',
          'faqList',
          'ctaCard',
          'contactCard',
          'supportPanel',
        ],
      },
      { id: 'closingCta', type: 'ctaCard', label: 'Closing CTA' },
    ],
    seoDefaults: {
      title: 'About AAURIKAA',
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
      sections: [],
      closingCta: {
        heading: '',
        description: '',
        buttonLabel: '',
        buttonHref: '',
      },
    },
  },
  'jewellery-care': {
    pageKey: 'jewellery-care',
    label: 'Jewellery Care',
    zones: [
      { id: 'hero', type: 'heroBanner', label: 'Hero banner' },
      {
        id: 'sections',
        type: 'orderedSections',
        label: 'Care guidance sections',
        allowedSectionTypes: [
          'richText',
          'image',
          'imageText',
          'cardGrid',
          'faqList',
          'ctaCard',
        ],
      },
      { id: 'supportPanel', type: 'supportPanel', label: 'Support panel' },
    ],
    seoDefaults: {
      title: 'Jewellery Care | AAURIKAA',
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
      sections: [],
      supportPanel: {
        heading: '',
        description: '',
        actions: [{ label: '', href: '' }],
      },
    },
  },
  contact: {
    pageKey: 'contact',
    label: 'Contact Us',
    zones: [
      { id: 'hero', type: 'heroBanner', label: 'Hero banner' },
      { id: 'intro', type: 'richText', label: 'Intro copy' },
      { id: 'contactCard', type: 'contactCard', label: 'Contact card' },
      { id: 'supportPanel', type: 'supportPanel', label: 'Support panel' },
    ],
    seoDefaults: {
      title: 'Contact Us | AAURIKAA',
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
      intro: JSON.stringify(EMPTY_TIPTAP_DOC),
      contactCard: {
        heading: '',
        intro: '',
        organizationName: '',
        phone: '',
        email: '',
        addressLines: [],
        buttonLabel: '',
        buttonHref: '',
      },
      supportPanel: {
        heading: '',
        description: '',
        actions: [{ label: '', href: '' }],
      },
    },
  },
  careers: {
    pageKey: 'careers',
    label: 'Careers',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'intro', type: 'richText', label: 'Intro copy' },
      { id: 'perks', type: 'linkCardList', label: 'Why work with us perks' },
      { id: 'jobSections', type: 'sectionList', label: 'Job openings' },
      { id: 'resumeCta', type: 'ctaCard', label: 'General applications CTA' },
    ],
    seoDefaults: {
      title: 'Careers | Anbazar',
      metaDescription:
        'Join Anbazar and help build the future of ecommerce. Explore career opportunities across tech, marketing, and support.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Be part of a next-generation ecommerce platform that empowers sellers and delights customers.',
      intro: JSON.stringify(EMPTY_TIPTAP_DOC),
      perks: [
        { title: 'Fast-growing startup', description: '', href: '#' },
        { title: 'Remote-friendly & flexible', description: '', href: '#' },
        { title: 'Real impact & ownership', description: '', href: '#' },
        { title: 'Collaborative & inclusive team', description: '', href: '#' },
      ],
      jobSections: [
        paragraphSection(
          'Frontend Developer — Remote / India — Full-Time',
          'Work with React, Next.js, Tailwind CSS to build scalable ecommerce features.'
        ),
        paragraphSection(
          'Customer Support Executive — West Bengal — Full-Time',
          'Assist customers, resolve queries, and ensure great shopping experience.'
        ),
        paragraphSection(
          'Marketing Intern — Remote — Internship',
          'Support digital campaigns, social media & growth initiatives.'
        ),
      ],
      resumeCta: defaultCtaCard({
        heading: 'Didn’t find a suitable role?',
        description:
          'We’re always happy to connect with talented people. Send your resume to careers@anbazar.in',
        buttonLabel: 'Send Resume',
        buttonHref: 'mailto:careers@anbazar.in',
      }),
    },
  },
  'become-seller': {
    pageKey: 'become-seller',
    label: 'Become a Seller',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'intro', type: 'richText', label: 'Intro copy' },
      { id: 'whySellTopics', type: 'linkCardList', label: 'Why sell with us cards' },
      { id: 'faqItems', type: 'faqList', label: 'FAQ items' },
      { id: 'sellerActions', type: 'supportPanel', label: 'Seller login / register actions' },
    ],
    seoDefaults: {
      title: 'Become a Seller | Anbazar',
      metaDescription:
        'Join Anbazar as a seller. Easy registration, secure payments, and full support to grow your business online.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Join our platform and start selling to thousands of customers. / আমাদের প্ল্যাটফর্মে যোগ দিন এবং হাজার হাজার গ্রাহকের কাছে বিক্রি শুরু করুন।',
      intro: JSON.stringify(EMPTY_TIPTAP_DOC),
      whySellTopics: [
        {
          title: 'Fast Onboarding',
          description: 'Quick registration and start selling immediately.',
          href: '#',
        },
        {
          title: 'Secure Payments',
          description: 'Safe and timely payments.',
          href: '#',
        },
        {
          title: 'Grow Your Business',
          description: 'Reach more customers online.',
          href: '#',
        },
        {
          title: 'Seller Dashboard',
          description: 'Manage products & orders easily.',
          href: '#',
        },
        {
          title: 'Marketing Support',
          description: 'Promotions to boost sales.',
          href: '#',
        },
        {
          title: 'Customer Insights',
          description: 'Understand your customers and sales trends.',
          href: '#',
        },
      ],
      faqItems: [
        {
          q: 'What documents are required?',
          a: 'ID proof, business proof, address proof, and bank details are required.',
        },
        {
          q: 'How long to get approved?',
          a: 'Usually 24-48 hours after submission.',
        },
        {
          q: 'Is registration free?',
          a: 'Yes, registration is completely free.',
        },
        {
          q: 'What support is provided?',
          a: 'Dedicated seller support and resources.',
        },
        {
          q: 'How to manage orders?',
          a: 'Use the Seller Dashboard to track and manage orders.',
        },
      ],
      sellerActions: defaultSupportPanel({
        heading: 'Already have a seller account?',
        description: '',
        actions: [
          { label: 'Seller Login', href: '/seller/login' },
          { label: 'Register as Seller', href: '/seller/register' },
        ],
      }),
    },
  },
  'delivery-info': {
    pageKey: 'delivery-info',
    label: 'Delivery Info',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'mainContent', type: 'richText', label: 'Intro / overview' },
      { id: 'sections', type: 'sectionList', label: 'Delivery sections' },
      { id: 'deliverySupport', type: 'supportPanel', label: 'Delivery support actions' },
    ],
    seoDefaults: {
      title: 'Delivery Information | Anbazar',
      metaDescription:
        'Learn about delivery timelines, shipping charges, service locations, and order tracking on Anbazar.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Everything you need to know about shipping, delivery timelines, and order tracking.',
      lastUpdated: 'January 2025',
      mainContent: tiptapParagraph(
        'At Anbazar, we are committed to delivering your orders safely and on time. Below you will find all important information related to shipping and delivery.'
      ),
      sections: [
        bulletSection('Delivery Time', [
          'Orders are usually delivered within 3–7 business days.',
          'Remote or rural areas may take additional time.',
          'Delivery timelines may vary during sales or holidays.',
        ]),
        bulletSection('Shipping Charges', [
          'Shipping charges (if any) are shown clearly at checkout.',
          'Free delivery may apply on selected products or minimum order value.',
        ]),
        paragraphSection(
          'Serviceable Locations',
          'We currently deliver to most locations across India. Delivery availability depends on your pin code and courier partner coverage.'
        ),
        paragraphSection(
          'Order Tracking',
          'Once your order is shipped, you will receive a tracking ID via SMS or email. You can also track your order from the My Account section.'
        ),
        paragraphSection(
          'Delivery Delays',
          'In rare cases, delivery may be delayed due to weather conditions, logistical challenges, or unforeseen circumstances. We appreciate your patience and understanding.'
        ),
      ],
      deliverySupport: defaultSupportPanel({
        heading: 'Need Help With Delivery?',
        description: 'Our support team is always here to assist you.',
        actions: [
          { label: 'Help Center', href: '/help-center' },
          { label: 'Contact Support', href: '/contact' },
        ],
      }),
    },
  },
  'payment-options': {
    pageKey: 'payment-options',
    label: 'Payment Options',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'paymentMethods', type: 'linkCardList', label: 'Payment method cards' },
      { id: 'securityCta', type: 'ctaCard', label: 'Safe payments CTA' },
    ],
    seoDefaults: {
      title: 'Payment Options | Anbazar',
      metaDescription:
        'Learn about all available payment options on Anbazar including cards, UPI, wallets, net banking, and COD.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Choose the payment method that is most convenient for you. All payments are secure and safe.',
      lastUpdated: 'January 2025',
      paymentMethods: [
        {
          title: 'Credit / Debit Cards',
          description:
            'We accept all major cards including Visa, Mastercard, and American Express for secure online payments.',
          href: '#',
        },
        {
          title: 'UPI & Digital Wallets',
          description: 'Pay quickly and safely using UPI apps and popular digital wallets.',
          href: '#',
        },
        {
          title: 'Cash on Delivery (COD)',
          description:
            'Pay with cash when your order is delivered to your doorstep. Available for select locations and products.',
          href: '#',
        },
        {
          title: 'Net Banking / Bank Transfer',
          description:
            'Secure payments via net banking from all major banks in India. Transaction is encrypted and safe.',
          href: '#',
        },
      ],
      securityCta: defaultCtaCard({
        heading: 'Safe & Secure Payments',
        description:
          'All transactions are encrypted using the latest SSL technology, ensuring your payment information is protected.',
        buttonLabel: 'Contact Support',
        buttonHref: '/contact',
      }),
    },
  },
  accessibility: {
    pageKey: 'accessibility',
    label: 'Accessibility',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'featureCards', type: 'linkCardList', label: 'Accessibility feature cards' },
      { id: 'assistanceCta', type: 'ctaCard', label: 'Need assistance CTA' },
    ],
    seoDefaults: {
      title: 'Accessibility | Anbazar',
      metaDescription:
        'Anbazar is committed to ensuring accessibility for all users. Learn about our accessibility features and support.',
    },
    zoneDefaults: {
      heroSubtitle:
        'At Anbazar, we are committed to providing an inclusive online shopping experience for all users.',
      lastUpdated: 'December 31, 2025',
      featureCards: [
        {
          title: 'Keyboard Navigation',
          description: 'Easily navigate our website using your keyboard without requiring a mouse.',
          href: '#',
        },
        {
          title: 'Screen Reader Compatible',
          description: 'All content is accessible via screen readers for visually impaired users.',
          href: '#',
        },
        {
          title: 'Clear Fonts & Contrast',
          description: 'High-contrast colors and readable fonts enhance visibility for all users.',
          href: '#',
        },
        {
          title: 'Alt Text for Images',
          description: 'All images and icons include descriptive alt text for better accessibility.',
          href: '#',
        },
      ],
      assistanceCta: defaultCtaCard({
        heading: 'Need Assistance?',
        description: 'If you encounter any accessibility barriers, contact us so we can assist you.',
        buttonLabel: 'Contact Support',
        buttonHref: 'mailto:support@anbazar.in',
      }),
    },
  },
  sitemap: {
    pageKey: 'sitemap',
    label: 'Sitemap',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'sitemapNote', type: 'richText', label: 'SEO note (bottom)' },
    ],
    seoDefaults: {
      title: 'Sitemap | Anbazar',
      metaDescription:
        'Interactive premium sitemap of Anbazar website with hover animations, animated icons, and gradient glow.',
    },
    zoneDefaults: {
      heroSubtitle: 'Explore all pages interactively',
      sitemapNote: tiptapParagraph(
        'This sitemap provides an interactive way for users to explore Anbazar pages. It includes visually appealing gradient glow cards, animated icons, and engaging hover effects to enhance the browsing experience.'
      ),
    },
  },
  forum: {
    pageKey: 'forum',
    label: 'Forum',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'overview', type: 'richText', label: 'Overview' },
      { id: 'pressTopics', type: 'linkCardList', label: 'Press / forum topic cards' },
      { id: 'communityContent', type: 'richText', label: 'Community section' },
      { id: 'mediaCta', type: 'ctaCard', label: 'Media inquiries CTA' },
    ],
    seoDefaults: {
      title: 'Forum | Anbazar',
      metaDescription:
        'Community forums and discussions on Anbazar — e-commerce insights, seller groups, and platform updates.',
    },
    zoneDefaults: {
      heroSubtitle: 'Media presence, community discussions & official announcements',
      overview: tiptapParagraph(
        "The Forum & Press section keeps our community, partners, and media informed about AnBazar.com's growth, achievements, and industry participation."
      ),
      pressTopics: [
        {
          title: 'Media Coverage',
          description: 'Featured articles and news coverage about AnBazar.com across digital media platforms.',
          href: '#',
        },
        {
          title: 'Press Releases',
          description: 'Official announcements, platform updates, and major milestones.',
          href: '#',
        },
        {
          title: 'Industry Forums',
          description: 'Participation in e-commerce, startup, and digital business forums.',
          href: '#',
        },
        {
          title: 'Partner News',
          description: 'Updates from our strategic partners and brand collaborations.',
          href: '#',
        },
      ],
      communityContent: tiptapParagraph(
        'We actively engage with digital entrepreneur communities, startup forums, and seller groups to exchange insights, gather feedback, and improve our platform.'
      ),
      mediaCta: defaultCtaCard({
        heading: 'Media & Partnership Inquiries',
        description:
          'For press, media, or partnership opportunities, feel free to connect with our communications team.',
        buttonLabel: 'Contact Us',
        buttonHref: '/contact',
      }),
    },
  },
  press: {
    pageKey: 'press',
    label: 'Press',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'overview', type: 'richText', label: 'Overview' },
      { id: 'pressTopics', type: 'linkCardList', label: 'Press topic cards' },
      { id: 'communityContent', type: 'richText', label: 'Community section' },
      { id: 'mediaCta', type: 'ctaCard', label: 'Media inquiries CTA' },
    ],
    seoDefaults: {
      title: 'Press | Anbazar',
      metaDescription:
        'Press releases, media coverage, and official announcements from Anbazar.',
    },
    zoneDefaults: {
      heroSubtitle: 'Media presence, community discussions & official announcements',
      overview: tiptapParagraph(
        "The Forum & Press section keeps our community, partners, and media informed about AnBazar.com's growth, achievements, and industry participation."
      ),
      pressTopics: [
        {
          title: 'Media Coverage',
          description: 'Featured articles and news coverage about AnBazar.com across digital media platforms.',
          href: '#',
        },
        {
          title: 'Press Releases',
          description: 'Official announcements, platform updates, and major milestones.',
          href: '#',
        },
        {
          title: 'Industry Forums',
          description: 'Participation in e-commerce, startup, and digital business forums.',
          href: '#',
        },
        {
          title: 'Partner News',
          description: 'Updates from our strategic partners and brand collaborations.',
          href: '#',
        },
      ],
      communityContent: tiptapParagraph(
        'We actively engage with digital entrepreneur communities, startup forums, and seller groups to exchange insights, gather feedback, and improve our platform.'
      ),
      mediaCta: defaultCtaCard({
        heading: 'Media & Partnership Inquiries',
        description:
          'For press, media, or partnership opportunities, feel free to connect with our communications team.',
        buttonLabel: 'Contact Us',
        buttonHref: '/contact',
      }),
    },
  },
  'seller-training': {
    pageKey: 'seller-training',
    label: 'Seller Training',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'trainingSections', type: 'sectionList', label: 'Training modules' },
      { id: 'successTip', type: 'noticeBanner', label: 'Seller success tip' },
    ],
    seoDefaults: {
      title: 'Seller Training & Best Practices | Anbazar',
      metaDescription:
        'Seller training and best practices for Anbazar. Learn how to grow your business, improve listings, and increase sales.',
    },
    zoneDefaults: {
      heroSubtitle: 'Learn how to grow faster and succeed on Anbazar',
      trainingSections: [
        bulletSectionWithVideoLinks('Product Listing Best Practices', [
          { text: 'Use clear and accurate product titles', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235338413_31cbcaf751e376bdba48cb0fad277091_Untitled_Project-ytr.mp4' },
          { text: 'Add high-quality product images', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235338413_31cbcaf751e376bdba48cb0fad277091_Untitled_Project-ytr.mp4' },
          { text: 'Write detailed product descriptions', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235338413_31cbcaf751e376bdba48cb0fad277091_Untitled_Project-ytr.mp4' },
          { text: 'Select correct category and attributes', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235338413_31cbcaf751e376bdba48cb0fad277091_Untitled_Project-ytr.mp4' },
        ]),
        bulletSectionWithVideoLinks('Product Photography Tips', [
          { text: 'Use white or clean background', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235283184_2311d14fd42074e2864836c7bf5f91b7_Untitled_design.mp4' },
          { text: 'Show multiple angles of the product', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235283184_2311d14fd42074e2864836c7bf5f91b7_Untitled_design.mp4' },
          { text: 'Avoid watermarks or text on images', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235283184_2311d14fd42074e2864836c7bf5f91b7_Untitled_design.mp4' },
          { text: 'Use natural lighting where possible', videoUrl: 'https://pub-0e53393359964a14bf62f5621f5f9565.r2.dev/admin/gallery/1769235283184_2311d14fd42074e2864836c7bf5f91b7_Untitled_design.mp4' },
        ]),
        bulletSectionWithVideoLinks('Shipping & Fulfillment', [
          { text: 'Pack products securely', videoUrl: 'https://shorturl.at/E7nEd' },
          { text: 'Ship orders within SLA', videoUrl: 'https://shorturl.at/E7nEd' },
          { text: 'Use proper labels and invoices', videoUrl: 'https://shorturl.at/E7nEd' },
          { text: 'Avoid delayed dispatch', videoUrl: 'https://shorturl.at/E7nEd' },
        ]),
      ],
      successTip: defaultNoticeBanner({
        heading: 'Seller Success Tip',
        description:
          'Sellers who follow best practices consistently see higher order volumes, better ratings, fewer returns, and long-term business growth on Anbazar.',
      }),
    },
  },
  'well-wisher-suggestions': {
    pageKey: 'well-wisher-suggestions',
    label: 'Well Wisher Suggestions',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'intro', type: 'richText', label: 'Intro below hero' },
    ],
    seoDefaults: {
      title: 'Well-Wisher Suggestions & Feedback | Anbazar',
      metaDescription:
        'Share your well-wisher suggestions and feedback to help improve Anbazar. Your ideas and opinions matter.',
    },
    zoneDefaults: {
      heroSubtitle:
        'Help us improve AnBazar by sharing your valuable ideas, experiences, mistakes, and feedback.',
      intro: JSON.stringify(EMPTY_TIPTAP_DOC),
    },
  },
  'seller-terms-condition': {
    pageKey: 'seller-terms-condition',
    label: 'Seller Terms & Conditions',
    zones: [
      { id: 'heroSubtitle', type: 'plainText', label: 'Hero subtitle' },
      { id: 'lastUpdated', type: 'plainText', label: 'Last updated' },
      { id: 'sections', type: 'sectionList', label: 'Policy sections' },
      { id: 'importantNotice', type: 'noticeBanner', label: 'Important notice for sellers' },
    ],
    seoDefaults: {
      title: 'Seller Terms & Conditions | Anbazar',
      metaDescription:
        'Read Seller Terms & Conditions for selling on Anbazar. Includes offline deal restrictions, lead protection, price parity, penalties, and seller responsibilities.',
    },
    zoneDefaults: {
      heroSubtitle:
        'These terms govern your relationship as a seller on Anbazar. By selling on Anbazar, you agree to comply with these rules.',
      lastUpdated: 'January 2025',
      sections: [
        paragraphSection(
          'Seller Eligibility & Registration',
          'To sell on Anbazar, sellers must provide accurate business details, valid identity documents, bank information, and contact details.'
        ),
        paragraphSection(
          'Offline Deal Restriction (Strict Policy)',
          'Sellers are strictly prohibited from diverting Anbazar customers for offline transactions or external channels.'
        ),
        paragraphSection(
          'Lead Protection & Platform Ownership',
          'All customer leads and order-related information generated through Anbazar are the exclusive property of Anbazar.'
        ),
        paragraphSection(
          'Price Parity Policy',
          'Sellers must maintain price parity across Anbazar and other sales channels.'
        ),
        paragraphSection(
          'Commission & Payment Settlement',
          'Sellers agree to pay applicable commission and service fees on each successful order per Anbazar settlement cycles.'
        ),
        paragraphSection(
          'Customer Protection & Conduct',
          'Sellers must not share personal contact details or encourage transactions outside Anbazar.'
        ),
        paragraphSection(
          'Account Suspension & Penalties',
          'Violations may result in penalties, withheld settlements, suspension, or permanent termination.'
        ),
        paragraphSection(
          'Seller Responsibilities',
          'Sellers are responsible for product authenticity, quality, descriptions, shipping, and returns per Anbazar policies.'
        ),
        paragraphSection(
          'Legal Compliance',
          'Sellers must comply with applicable Indian laws, GST regulations, and consumer protection requirements.'
        ),
        paragraphSection(
          'Platform Integrity & Fair Usage',
          'Sellers agree not to manipulate prices, create fake orders, or engage in fraudulent activities.'
        ),
        paragraphSection(
          'Limitation of Liability',
          'Anbazar shall not be liable for indirect or consequential damages arising from seller activities.'
        ),
        paragraphSection(
          'Termination of Seller Account',
          'Anbazar may terminate or restrict seller accounts for policy violations or harmful conduct.'
        ),
        paragraphSection(
          'Governing Law',
          'These Seller Terms & Conditions shall be governed by the laws of India.'
        ),
        paragraphSection(
          'Seller Support & Contact',
          'For questions related to Seller Terms, contact support@anbazar.in'
        ),
      ],
      importantNotice: defaultNoticeBanner({
        heading: 'Important Notice for Sellers',
        description:
          'Any attempt to divert customers for offline purchases, manipulate prices, or bypass Anbazar’s platform may result in immediate account suspension, financial penalties, and permanent termination of seller privileges.',
      }),
    },
  },
};

module.exports = { phase4Manifests, EMPTY_TIPTAP_DOC, tiptapParagraph };
