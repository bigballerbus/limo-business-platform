/**
 * Proof-gate thresholds (BC8).
 *
 * The minimum evidence a page must carry before it may publish. These are the
 * difference between a 1,000-page asset and a 1,000-page liability; they are not
 * tunable by editors (spec §4.2). Every collection whose CMS inventory shows a
 * publish gate MUST have an entry here — the gate fails closed otherwise
 * (decision T-007).
 */
export interface GateThreshold {
  entityType: string;
  photos: number;
  facts: number;
  faqs: number;
  reviews: number;
  jobs: number;
  minWords: number;
  /** Max share of body text allowed to overlap any peer page (doorway control). */
  maxSimilarity: number;
}

export const GATE_THRESHOLDS = {
  services: {
    entityType: 'service',
    photos: 8,
    facts: 15,
    faqs: 10,
    reviews: 5,
    jobs: 0,
    minWords: 1500,
    maxSimilarity: 0.3,
  },
  locations: {
    entityType: 'location',
    photos: 3,
    facts: 10,
    faqs: 5,
    reviews: 2,
    jobs: 1,
    minWords: 600,
    maxSimilarity: 0.3,
  },
  venues: {
    entityType: 'venue',
    photos: 3,
    facts: 12,
    faqs: 5,
    reviews: 1,
    jobs: 1,
    minWords: 600,
    maxSimilarity: 0.3,
  },
  routes: {
    entityType: 'route',
    photos: 1,
    facts: 8,
    faqs: 4,
    reviews: 1,
    jobs: 1,
    minWords: 450,
    maxSimilarity: 0.3,
  },
  vehicles: {
    entityType: 'vehicle',
    photos: 12,
    facts: 20,
    faqs: 6,
    reviews: 3,
    jobs: 0,
    minWords: 700,
    maxSimilarity: 0.3,
  },
  'service-locations': {
    entityType: 'service_location',
    photos: 2,
    facts: 8,
    faqs: 4,
    reviews: 1,
    jobs: 1,
    minWords: 500,
    maxSimilarity: 0.3,
  },
  guides: {
    entityType: 'guide',
    photos: 2,
    facts: 0,
    faqs: 0,
    reviews: 0,
    jobs: 0,
    minWords: 1200,
    maxSimilarity: 0.3,
  },
  // Collections marked gated in §4.1 that §4.2 omitted — defined here (T-007).
  airports: {
    entityType: 'airport',
    photos: 2,
    facts: 10,
    faqs: 5,
    reviews: 1,
    jobs: 1,
    minWords: 600,
    maxSimilarity: 0.3,
  },
  occasions: {
    entityType: 'occasion',
    photos: 3,
    facts: 8,
    faqs: 4,
    reviews: 2,
    jobs: 0,
    minWords: 700,
    maxSimilarity: 0.3,
  },
  comparisons: {
    entityType: 'comparison',
    photos: 1,
    facts: 6,
    faqs: 3,
    reviews: 0,
    jobs: 0,
    minWords: 700,
    maxSimilarity: 0.3,
  },
  'case-studies': {
    entityType: 'case_study',
    photos: 3,
    facts: 3,
    faqs: 0,
    reviews: 1,
    jobs: 1,
    minWords: 600,
    maxSimilarity: 0.3,
  },
} as const satisfies Record<string, GateThreshold>;

export type GatedCollection = keyof typeof GATE_THRESHOLDS;

/**
 * Look up a collection's threshold. Throws if a gated collection has no entry —
 * the publish gate must fail closed, never silently pass (T-007).
 */
export function getThreshold(collection: string): GateThreshold {
  const threshold = (GATE_THRESHOLDS as Record<string, GateThreshold>)[collection];
  if (!threshold) {
    throw new Error(
      `No proof-gate threshold defined for "${collection}". Publish is blocked (fail closed).`,
    );
  }
  return threshold;
}
