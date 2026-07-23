/**
 * Media upload validation (spec §4.9). Pure rules invoked by the CMS media
 * hooks; they block the upload, not warn.
 */

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const BANNED_PREFIXES = ['img_', 'dsc', 'dscn', 'screenshot', 'photo_', 'image'];

/**
 * Descriptive, hyphenated, lowercase filenames only. Rejects camera defaults
 * (IMG_, DSC…), screenshots, names under 15 characters, or names lacking a
 * hyphen — the difference between a filename that helps SEO and one that hurts.
 */
export function validateFilename(filename: string): ValidationResult {
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  const lower = base.toLowerCase();

  if (base.length < 15) {
    return { ok: false, error: 'Filename must be at least 15 characters and descriptive.' };
  }
  if (!base.includes('-')) {
    return { ok: false, error: 'Filename must be hyphenated (e.g. wedding-car-at-leeds-castle).' };
  }
  if (base !== lower) {
    return { ok: false, error: 'Filename must be lowercase.' };
  }
  if (/\s/.test(base)) {
    return { ok: false, error: 'Filename must not contain spaces; use hyphens.' };
  }
  if (BANNED_PREFIXES.some((p) => lower.startsWith(p))) {
    return {
      ok: false,
      error: 'Filename looks like a camera/screenshot default; rename it descriptively.',
    };
  }
  return { ok: true };
}

/**
 * Alt text must be present, at least 20 characters, and must not be merely the
 * page's target keyword (spec §7.7).
 */
export function validateAltText(alt: string, primaryKeyword?: string): ValidationResult {
  const trimmed = alt.trim();
  if (trimmed.length < 20) {
    return { ok: false, error: 'Alt text is required and must be at least 20 characters.' };
  }
  if (primaryKeyword && trimmed.toLowerCase() === primaryKeyword.trim().toLowerCase()) {
    return {
      ok: false,
      error: 'Alt text must describe the image, not just repeat the target keyword.',
    };
  }
  return { ok: true };
}

export interface ConsentInput {
  containsPeople: boolean;
  containsMinors: boolean;
  consentObtained: boolean;
  consentEvidence?: string | null;
}

/**
 * Images of people require consent; images of minors require documented consent
 * evidence, without exception.
 */
export function validateConsent(input: ConsentInput): ValidationResult {
  if (input.containsPeople && !input.consentObtained) {
    return { ok: false, error: 'Images containing people require consent before upload.' };
  }
  if (input.containsMinors && !(input.consentEvidence && input.consentEvidence.trim().length > 0)) {
    return { ok: false, error: 'Images containing minors require documented consent evidence.' };
  }
  return { ok: true };
}
