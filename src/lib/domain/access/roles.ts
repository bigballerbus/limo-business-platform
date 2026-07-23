/**
 * Roles and access predicates (spec §11). Pure logic consumed by the Payload
 * access functions and Server Action guards — the client is never trusted, and
 * PII is hidden by field-level access, not by UI omission.
 */
export const ROLES = [
  'admin',
  'sales',
  'customer_service',
  'operations',
  'content_editor',
  'marketing',
  'seo',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** True if `role` is one of `allowed`. */
export function hasRole(role: Role | undefined | null, allowed: readonly Role[]): boolean {
  return role != null && allowed.includes(role);
}

/** Roles permitted to see customer personal data (names, contact, addresses). */
export const PII_ROLES: readonly Role[] = ['admin', 'sales', 'customer_service', 'operations'];

/** Marketing and SEO see aggregates and content, never raw customer PII. */
export function canViewPii(role: Role | undefined | null): boolean {
  return hasRole(role, PII_ROLES);
}
