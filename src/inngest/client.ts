import { EventSchemas, Inngest } from 'inngest';
import type { DomainEvent } from '@/lib/events/types';

/** Map the DomainEvent union to Inngest's per-event schema record. */
type EventRecord = {
  [E in DomainEvent as E['name']]: { data: E['data'] };
};

/**
 * The durable workflow engine (decision D1 / §1.14). Every deferred or scheduled
 * side-effect runs here (decision T-010 note: one scheduler). Functions survive
 * deployments and are replayable — the CRM's failure-visibility requirement.
 */
export const inngest = new Inngest({
  id: 'kent-limousines',
  schemas: new EventSchemas().fromRecord<EventRecord>(),
});
