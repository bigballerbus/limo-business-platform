import type { SERVICE_TYPES } from '@/lib/schemas/quote';

/**
 * Editorial content for the service hub pages. This is documented placeholder
 * copy (like the placeholder rate card, D-004): production-shaped and indexable,
 * to be superseded by CMS-managed content when the reference-entity collections
 * transition to Payload. The slugs are permanent URL taxonomy (D-003) and must
 * not change once indexed.
 */
export interface ServiceContent {
  slug: string;
  serviceType: (typeof SERVICE_TYPES)[number];
  name: string;
  /** ≤ 160 chars — used verbatim as the meta description. */
  metaDescription: string;
  h1: string;
  intro: string;
  faqs: { question: string; answer: string }[];
}

export const SERVICES: Record<string, ServiceContent> = {
  weddings: {
    slug: 'weddings',
    serviceType: 'wedding',
    name: 'Wedding Car Hire',
    metaDescription:
      'Luxury wedding car and limousine hire across Kent. Chauffeur-driven arrivals with a guaranteed backup vehicle for complete peace of mind.',
    h1: 'Wedding Car & Limousine Hire in Kent',
    intro:
      'Arrive in effortless style. Our chauffeur-driven wedding cars come with a guaranteed backup vehicle, so your day is never left to chance.',
    faqs: [
      {
        question: 'Do you provide a backup vehicle for weddings?',
        answer:
          'Yes. Every wedding booking is confirmed with a dedicated backup vehicle at no extra cost, so a mechanical issue can never disrupt your day.',
      },
      {
        question: 'How far in advance should we book?',
        answer:
          'Popular dates book up to two years ahead. We can hold a quote for you and confirm once your date and venue are set.',
      },
    ],
  },
  proms: {
    slug: 'proms',
    serviceType: 'prom',
    name: 'Prom Car Hire',
    metaDescription:
      'Stretch limousine and executive prom car hire across Kent. Fully licensed, insured and safeguarding-compliant for under-18 passengers.',
    h1: 'Prom Limousine Hire in Kent',
    intro:
      'Make an entrance to remember. Our licensed chauffeurs and immaculate vehicles make prom night safe, memorable and effortless for parents and students alike.',
    faqs: [
      {
        question: 'Is a parent or guardian required to book?',
        answer:
          'For any booking carrying passengers under 18, a parent or guardian must make and verify the booking. It is a safeguarding requirement we take seriously.',
      },
    ],
  },
  'airport-transfers': {
    slug: 'airport-transfers',
    serviceType: 'airport_transfer',
    name: 'Airport Transfers',
    metaDescription:
      'Chauffeur-driven airport transfers from Kent to Heathrow, Gatwick, Stansted and London City. Flight tracking and a fixed, all-inclusive price.',
    h1: 'Kent Airport Transfers',
    intro:
      'Relax from door to departure. We track your flight, meet you on arrival and keep the price fixed — no surge, no surprises.',
    faqs: [
      {
        question: 'Do you track flights for delays?',
        answer:
          'Yes. We monitor your flight and adjust the pickup automatically, so a delayed or early landing is handled without a phone call.',
      },
    ],
  },
  corporate: {
    slug: 'corporate',
    serviceType: 'corporate',
    name: 'Corporate Travel',
    metaDescription:
      'Executive corporate chauffeur hire across Kent and London. Accounts, discreet professional drivers and reliable arrivals for business travel.',
    h1: 'Corporate Chauffeur Hire',
    intro:
      'Discreet, punctual and professional. Executive travel for meetings, roadshows and client hospitality, with account billing available.',
    faqs: [
      {
        question: 'Do you offer business accounts?',
        answer:
          'Yes. We can set up a company account with consolidated monthly billing and priority booking for your team.',
      },
    ],
  },
  celebrations: {
    slug: 'celebrations',
    serviceType: 'celebration',
    name: 'Celebration Hire',
    metaDescription:
      'Limousine hire for birthdays, anniversaries and special occasions across Kent. Red carpet, champagne and a chauffeur for the night.',
    h1: 'Celebration & Special Occasion Hire',
    intro:
      'Turn any occasion into an event. Birthdays, anniversaries and nights out, delivered with red-carpet touches and a professional chauffeur.',
    faqs: [
      {
        question: 'What add-ons are available?',
        answer:
          'Red carpet, champagne, decorations and extra stops can all be added to your quote — just select them when you request your price.',
      },
    ],
  },
};

export const SERVICE_SLUGS = Object.keys(SERVICES);
