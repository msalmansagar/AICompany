'use strict';

/**
 * Single source of truth for the DP-1 control-flow option-set INTEGER CODES.
 *
 * Consumed by `add-controlflow-fields.js` (provisioning) and cross-checked
 * against the TypeScript maps in `src/types/WorkflowTypes.ts` by
 * `controlFlowOptionCodes.test.ts`. Same guard as the DP-2 SLA codes: if the two
 * declarations diverge, Dataverse stores an integer that reads back as a
 * different control-flow semantic — silent, and exactly the class of corruption
 * the DP-2 audit raised as GA-3.
 *
 * 100000002 is deliberately unallocated in both sets. It is reserved for the
 * inclusive (OR) split and the quorum join, which DP-1 does not build (ADR-1-001).
 */
module.exports = {
  SPLIT_TYPE: { Exclusive: 100000000, Parallel: 100000001 },
  JOIN_TYPE: { None: 100000000, AndJoin: 100000001 },
};
