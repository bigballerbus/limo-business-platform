import { depositPaid } from './depositPaid';
import { enquiryCreated } from './enquiryCreated';
import { preService } from './preService';
import { slaEnforcement } from './slaEnforcement';

/** All registered Inngest functions, served at /api/inngest. */
export const functions = [enquiryCreated, slaEnforcement, depositPaid, preService];
