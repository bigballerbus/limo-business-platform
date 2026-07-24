import { randomUUID } from 'node:crypto';
import type { OutboundMessage } from './types';

/**
 * Delivery boundary. Resend (email), Twilio (SMS) and WhatsApp Cloud API
 * implement this in the integrations sprint; the send gate depends only on the
 * interface. The stub records a synthetic provider id so the pipeline is fully
 * testable without a third party.
 */
export interface Notifier {
  dispatch(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}

export const stubNotifier: Notifier = {
  async dispatch(): Promise<{ providerMessageId: string }> {
    return { providerMessageId: `stub-${randomUUID()}` };
  },
};
