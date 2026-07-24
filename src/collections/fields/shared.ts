import type { Field } from 'payload';

/**
 * SEO fields applied to every publishable collection (spec §4.3).
 *
 * `primaryKeyword` is unique *sitewide* (the cannibalisation control) — Payload's
 * per-collection `unique` cannot span collections, so a shared afterChange hook
 * enforces it against the `page_keywords` table (decision T-006). The ogImage
 * upload is added with the Media collection in the reference-entity step.
 */
export const seoFields: Field[] = [
  {
    name: 'metaTitle',
    type: 'text',
    maxLength: 60,
    required: true,
    admin: { description: '50–60 characters. Must be unique sitewide.' },
  },
  { name: 'metaDescription', type: 'textarea', maxLength: 160, required: true },
  { name: 'canonicalOverride', type: 'text' },
  { name: 'noindex', type: 'checkbox', defaultValue: false },
  {
    name: 'primaryKeyword',
    type: 'text',
    required: true,
    admin: { description: 'One primary keyword per page. Must not be used by any other page.' },
  },
  {
    name: 'secondaryKeywords',
    type: 'array',
    fields: [{ name: 'kw', type: 'text', required: true }],
  },
];

/**
 * Publishing workflow fields (spec §4.3). Draft status is managed by Payload
 * (`versions.drafts`), so `_status` is not declared here. `factCheckedBy` is
 * optional at the field level and enforced at the publish transition by the
 * proof gate — a human must approve before publish, but drafts stay editable.
 */
export const publishingFields: Field[] = [
  { name: 'reviewedBy', type: 'relationship', relationTo: 'users' },
  { name: 'reviewedAt', type: 'date' },
  { name: 'factCheckedBy', type: 'relationship', relationTo: 'users' },
];

export const faqFields: Field[] = [
  { name: 'question', type: 'text', required: true },
  { name: 'answer', type: 'textarea', required: true },
];
