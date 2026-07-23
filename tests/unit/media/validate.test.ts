import { describe, expect, it } from 'vitest';
import { validateAltText, validateConsent, validateFilename } from '@/lib/domain/media/validate';

describe('validateFilename', () => {
  it('accepts a descriptive hyphenated lowercase name', () => {
    expect(validateFilename('wedding-car-at-leeds-castle.jpg').ok).toBe(true);
  });
  it('rejects camera and screenshot defaults', () => {
    expect(validateFilename('IMG_1234.jpg').ok).toBe(false);
    expect(validateFilename('screenshot-2026-01-01.png').ok).toBe(false);
  });
  it('rejects short names and names without a hyphen', () => {
    expect(validateFilename('car.jpg').ok).toBe(false);
    expect(validateFilename('weddingcarleedscastle.jpg').ok).toBe(false);
  });
  it('rejects uppercase and spaces', () => {
    expect(validateFilename('Wedding-Car-At-Leeds.jpg').ok).toBe(false);
    expect(validateFilename('wedding car at leeds.jpg').ok).toBe(false);
    // hyphenated + long + lowercase, but contains a space → still rejected
    expect(validateFilename('wedding-car at-leeds-castle.jpg').ok).toBe(false);
  });
});

describe('validateAltText', () => {
  it('accepts descriptive alt text', () => {
    expect(validateAltText('Silver wedding car parked outside Leeds Castle').ok).toBe(true);
  });
  it('rejects text under 20 characters', () => {
    expect(validateAltText('wedding car').ok).toBe(false);
  });
  it('rejects alt text that is only the target keyword', () => {
    expect(validateAltText('wedding cars kent maidstone', 'wedding cars kent maidstone').ok).toBe(
      false,
    );
  });
});

describe('validateConsent', () => {
  it('allows images without people', () => {
    expect(
      validateConsent({ containsPeople: false, containsMinors: false, consentObtained: false }).ok,
    ).toBe(true);
  });
  it('blocks people without consent', () => {
    expect(
      validateConsent({ containsPeople: true, containsMinors: false, consentObtained: false }).ok,
    ).toBe(false);
  });
  it('blocks minors without documented evidence', () => {
    expect(
      validateConsent({
        containsPeople: true,
        containsMinors: true,
        consentObtained: true,
        consentEvidence: '',
      }).ok,
    ).toBe(false);
    expect(
      validateConsent({
        containsPeople: true,
        containsMinors: true,
        consentObtained: true,
        consentEvidence: 'signed release on file ref 123',
      }).ok,
    ).toBe(true);
  });
});
