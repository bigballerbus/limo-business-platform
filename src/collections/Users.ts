import type { CollectionConfig } from 'payload';

/**
 * Admin/staff users (Payload auth).
 *
 * Sprint 0 establishes authentication and a role field only. The full role
 * matrix, per-collection access control, field-level PII masking and Postgres
 * RLS wiring are delivered in the CMS/roles sprint (§11). The role options
 * below are the working set from the spec and will be finalised there.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // Spec §13.1: 8h idle / 24h absolute sessions; 5 attempts / 15 min lockout.
    // TOTP 2FA and progressive lockout are added in the security sprint.
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 60 * 60 * 8,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'role'],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'content_editor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Sales', value: 'sales' },
        { label: 'Customer Service', value: 'customer_service' },
        { label: 'Operations', value: 'operations' },
        { label: 'Content Editor', value: 'content_editor' },
        { label: 'Marketing', value: 'marketing' },
        { label: 'SEO', value: 'seo' },
      ],
    },
  ],
};
