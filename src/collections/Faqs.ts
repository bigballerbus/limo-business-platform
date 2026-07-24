import type { CollectionConfig } from 'payload';
import { hasRole, publishedOrRole } from './access';
import { revalidateContent } from './hooks/revalidate';

/**
 * FAQs — ungated reusable Q&A, surfaced on templates and indexed for search.
 * Site-search query logs feed new FAQ content (spec §1.9).
 */
export const Faqs: CollectionConfig = {
  slug: 'faqs',
  versions: { drafts: true },
  admin: { useAsTitle: 'question', defaultColumns: ['question', 'topic', '_status'] },
  access: {
    read: publishedOrRole(['admin', 'content_editor', 'marketing', 'seo', 'customer_service']),
    create: hasRole(['admin', 'content_editor', 'marketing']),
    update: hasRole(['admin', 'content_editor', 'marketing']),
    delete: hasRole(['admin']),
  },
  hooks: { afterChange: [revalidateContent] },
  fields: [
    { name: 'question', type: 'text', required: true },
    { name: 'answer', type: 'textarea', required: true },
    {
      name: 'topic',
      type: 'select',
      options: ['weddings', 'proms', 'airports', 'corporate', 'pricing', 'booking', 'general'],
      defaultValue: 'general',
    },
  ],
};
