import type { CollectionConfig } from 'payload';
import { hasRole } from './access';

/**
 * Redirects (spec §7.5). Served at build via next.config plus a middleware
 * fallback for entries created after deploy. A slug change on a published page
 * creates a 301 automatically (wired with the page templates sprint).
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: { useAsTitle: 'source', defaultColumns: ['source', 'destination', 'type'] },
  access: {
    read: hasRole(['admin', 'content_editor', 'seo']),
    create: hasRole(['admin', 'seo']),
    update: hasRole(['admin', 'seo']),
    delete: hasRole(['admin']),
  },
  fields: [
    { name: 'source', type: 'text', required: true, unique: true, index: true },
    { name: 'destination', type: 'text', required: true },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: '301',
      options: [
        { label: '301 (permanent)', value: '301' },
        { label: '302 (temporary)', value: '302' },
      ],
    },
    { name: 'hits', type: 'number', defaultValue: 0, admin: { readOnly: true } },
  ],
};
