import type { GateThreshold } from './thresholds';

/**
 * Pure evaluation of the publish proof-gate (BC8). The CMS hook counts a page's
 * linked proof assets and word count, then calls this; if it does not pass, the
 * publish transition is rejected by the API. No UI path bypasses it.
 */
export interface ProofAssetCounts {
  photo: number;
  fact: number;
  faq: number;
  review: number;
  job: number;
}

export interface GateInput {
  assetCounts: ProofAssetCounts;
  wordCount: number;
}

export interface GateFailure {
  requirement: string;
  actual: number;
  required: number;
}

export interface GateResult {
  pass: boolean;
  failures: GateFailure[];
}

export function evaluateGate(input: GateInput, threshold: GateThreshold): GateResult {
  const checks: Array<[string, number, number]> = [
    ['photos', input.assetCounts.photo, threshold.photos],
    ['facts', input.assetCounts.fact, threshold.facts],
    ['faqs', input.assetCounts.faq, threshold.faqs],
    ['reviews', input.assetCounts.review, threshold.reviews],
    ['jobs', input.assetCounts.job, threshold.jobs],
    ['words', input.wordCount, threshold.minWords],
  ];

  const failures: GateFailure[] = [];
  for (const [requirement, actual, required] of checks) {
    if (actual < required) failures.push({ requirement, actual, required });
  }

  return { pass: failures.length === 0, failures };
}

/** Human-readable reason string for a rejected publish. */
export function formatGateFailures(failures: readonly GateFailure[]): string {
  return failures.map((f) => `  • ${f.requirement}: ${f.actual}/${f.required}`).join('\n');
}
