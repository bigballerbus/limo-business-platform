import type { CollectionConfig } from 'payload';
import { hasRole, publishedOrRole } from './access';

/**
 * Legal pages (privacy, terms, booking terms, safeguarding). Ungated content;
 * solicitor-reviewed before launch (Definition of Done).
 */
export const LegalPages: CollectionConfig = {
  slug: 'legal-pages',
  versions: { drafts: true },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status'] },
  access: {
    read: publishedOrRole(['admin', 'content_editor']),
    create: hasRole(['admin', 'content_editor']),
    update: hasRole(['admin', 'content_editor']),
    delete: hasRole(['admin']),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'metaDescription', type: 'textarea', maxLength: 160 },
    { name: 'body', type: 'richText', required: true },
  ],
};
