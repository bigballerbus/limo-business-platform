import { describe, expect, it } from 'vitest';
import { canViewPii, hasRole, isRole } from '@/lib/domain/access/roles';

describe('isRole', () => {
  it('recognises valid roles and rejects others', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('intern')).toBe(false);
    expect(isRole(123)).toBe(false);
  });
});

describe('hasRole', () => {
  it('checks membership', () => {
    expect(hasRole('sales', ['admin', 'sales'])).toBe(true);
    expect(hasRole('marketing', ['admin', 'sales'])).toBe(false);
    expect(hasRole(null, ['admin'])).toBe(false);
  });
});

describe('canViewPii', () => {
  it('permits operational roles and blocks marketing/seo', () => {
    expect(canViewPii('customer_service')).toBe(true);
    expect(canViewPii('admin')).toBe(true);
    expect(canViewPii('marketing')).toBe(false);
    expect(canViewPii('seo')).toBe(false);
    expect(canViewPii(undefined)).toBe(false);
  });
});
