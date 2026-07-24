import { attentionSweep } from './attentionSweep';
import { depositPaid } from './depositPaid';
import { enquiryCreated } from './enquiryCreated';
import { nurtureLadder } from './nurture';
import { preService } from './preService';
import { referralQualification, reviewRequest } from './postService';
import { slaEnforcement } from './slaEnforcement';

/** All registered Inngest functions, served at /api/inngest. */
export const functions = [
  enquiryCreated,
  slaEnforcement,
  depositPaid,
  preService,
  attentionSweep,
  nurtureLadder,
  reviewRequest,
  referralQualification,
];
