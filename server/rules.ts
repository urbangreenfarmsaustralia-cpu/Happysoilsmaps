import type { ProductRuleSet } from '../src/intelligence-types';

/**
 * Production recommendations remain deliberately locked until Happy Soils supplies and
 * approves its authoritative product rate tables. The engine, caps, split-application
 * fields, exceptions, versioning and confidence calculation are live; invented rates are not.
 */
export const productRuleSets: ProductRuleSet[] = [
  {
    product: 'Activate',
    version: 'activate-draft-2026-08-21',
    approved: false,
    approvedBy: null,
    approvedAt: null,
    bands: [],
    exceptionRules: [],
  },
  {
    product: 'Energise',
    version: 'energise-draft-2026-08-21',
    approved: false,
    approvedBy: null,
    approvedAt: null,
    bands: [],
    exceptionRules: [],
  },
];
