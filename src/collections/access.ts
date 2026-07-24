import type { Access } from 'payload';
import { hasRole as roleAllowed, type Role } from '@/lib/domain/access/roles';

/** The role stored on a Payload user (until generated types are wired in). */
function roleOf(user: unknown): Role | null {
  const role = (user as { role?: unknown } | null)?.role;
  return (typeof role === 'string' ? role : null) as Role | null;
}

/** Allow only the given roles (create/update/delete guards). */
export const hasRole =
  (roles: Role[]): Access =>
  ({ req }) =>
    roleAllowed(roleOf(req.user), roles);

/**
 * Public read of published docs; staff in the given roles also see drafts.
 * Returns a Payload `where` for anonymous/other users so only published rows
 * are exposed.
 */
export const publishedOrRole =
  (roles: Role[]): Access =>
  ({ req }) => {
    if (roleAllowed(roleOf(req.user), roles)) return true;
    return { _status: { equals: 'published' } };
  };
