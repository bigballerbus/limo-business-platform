import type { CollectionConfig } from 'payload';
import { hasRole, publishedOrRole } from './access';
import { enforceProofGate } from './hooks/proofGate';
import { enforceUniqueKeyword, recordKeyword } from './hooks/pageKeyword';
import { faqFields, publishingFields, seoFields } from './fields/shared';

/**
 * Guides — the reference implementation for a proof-gated content collection.
 * Publish is blocked by BC8 (getThreshold('guides'): 2 photos, 1,200 words) and
 * by the doorway-page similarity check; the primary keyword is unique sitewide.
 * Image uploads use a placeholder URL until the Media collection lands with the
 * reference-entity step.
 */
export const Guides: CollectionConfig = {
  slug: 'guides',
  versions: { drafts: true },
  admin: { useAsTitle: 'title', defaultColumns: ['title', '_status', 'primaryKeyword'] },
  access: {
    read: publishedOrRole(['admin', 'content_editor', 'marketing', 'seo']),
    create: hasRole(['admin', 'content_editor', 'marketing']),
    update: hasRole(['admin', 'content_editor', 'marketing']),
    delete: hasRole(['admin']),
  },
  hooks: {
    beforeValidate: [enforceUniqueKeyword('guides'), enforceProofGate('guides')],
    afterChange: [recordKeyword('guides')],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'excerpt', type: 'textarea' },
    {
      name: 'images',
      type: 'array',
      labels: { singular: 'Image', plural: 'Images' },
      fields: [
        { name: 'url', type: 'text', required: true },
        { name: 'alt', type: 'text', required: true },
      ],
    },
    { name: 'facts', type: 'array', fields: [{ name: 'fact', type: 'text', required: true }] },
    { name: 'faqs', type: 'array', fields: faqFields },
    { name: 'body', type: 'richText', required: true },
    ...seoFields,
    ...publishingFields,
  ],
};
