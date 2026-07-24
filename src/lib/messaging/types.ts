export type Channel = 'email' | 'sms' | 'whatsapp' | 'push';
export type MessageClass = 'transactional' | 'marketing';

export interface OutboundMessage {
  customerId: string;
  bookingId?: string | null;
  channel: Channel;
  /**
   * BC6 — every message declares its class. Transactional (contract
   * performance) always sends; marketing is gated by consent and suppression.
   */
  messageClass: MessageClass;
  templateKey: string;
  payload?: Record<string, unknown>;
}

export type SendResult =
  | { status: 'sent'; providerMessageId: string }
  | { status: 'suppressed'; reason: string }
  | { status: 'deferred'; reason: string };
