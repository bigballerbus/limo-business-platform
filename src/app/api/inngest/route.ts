import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { functions } from '@/inngest/functions';

/** Inngest serves and invokes the durable workflows through this route. */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
