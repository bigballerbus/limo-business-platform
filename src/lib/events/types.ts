/**
 * Domain events (spec §2.2). Every meaningful state change emits one; nothing
 * calls a side-effect directly. New automations subscribe to an event instead of
 * editing booking or enquiry logic. Consumers (Inngest workflows, analytics,
 * search reindex, ISR revalidation, audit) are wired from Sprint 5.
 */
export type DomainEvent =
  | { name: 'enquiry/created'; data: { enquiryId: string; tenantId: string; source: string } }
  | {
      name: 'enquiry/stage.changed';
      data: { enquiryId: string; tenantId: string; from: string; to: string };
    }
  | { name: 'quote/issued'; data: { quoteId: string; value: number } }
  | { name: 'quote/abandoned'; data: { enquiryId: string; lastStep: number } }
  | { name: 'booking/deposit.paid'; data: { bookingId: string } }
  | { name: 'booking/confirmed'; data: { bookingId: string } }
  | { name: 'booking/cancelled'; data: { bookingId: string; reason: string } }
  | { name: 'booking/refunded'; data: { bookingId: string; amountPence: number; reason: string } }
  | { name: 'review/received'; data: { reviewId: string; rating: number } }
  | { name: 'content/published'; data: { collection: string; slug: string } };

export type DomainEventName = DomainEvent['name'];
