import { randomUUID } from 'node:crypto';

/**
 * Correlation id for the enquiry critical path (decision D-001). Threaded from
 * the Server Action → transaction → domain events → messaging so "what happened
 * to this lead and why didn't they get their text?" is answerable in seconds.
 * Structured logs carry it; PII is never logged.
 */
export function newTraceId(): string {
  return `trace_${randomUUID()}`;
}

export function traceLog(
  traceId: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  // Structured, PII-free line. A transport (Sentry breadcrumb / log drain) is
  // attached in the observability hardening step.
  console.warn(JSON.stringify({ traceId, event, ...fields }));
}
