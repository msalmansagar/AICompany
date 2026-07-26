// DFE-SUBMITCONFIRM-002: the acknowledgement a tab can require before the user moves on.
//
// A tab gate is enforced twice, and both are needed. Blocking forward navigation surfaces
// the requirement where the content is, while re-checking at submit covers the tab a
// jump-to-tab button or a resumed draft skipped past — otherwise a user could reach the
// submit button having never seen the gate.
//
// A plain function, not a hook: the renderer computes its visible tabs after several early
// returns, so anything called there must be safe to call conditionally.
import type { TabDefinition } from '@qdb/shared';

export interface TabConfirmationState {
  /** Tabs that require an acknowledgement the user has not given yet. */
  unacknowledgedTabs: TabDefinition[];
  /** True when at least one tab gate is unsatisfied, so submit must stay blocked. */
  isSubmitBlocked: boolean;
  /** Whether the user may move forward off this tab. */
  canLeaveTab: (tab: TabDefinition | undefined) => boolean;
}

/** Pass visible tabs only — a hidden tab's gate would be unsatisfiable. */
export function evaluateTabConfirmation(
  tabs: TabDefinition[],
  tabAcknowledgements: Record<string, boolean>,
): TabConfirmationState {
  const unacknowledgedTabs = tabs.filter(
    (tab) => tab.submitConfirmation && !tabAcknowledgements[tab.id],
  );

  return {
    unacknowledgedTabs,
    isSubmitBlocked: unacknowledgedTabs.length > 0,
    canLeaveTab: (tab) => !tab?.submitConfirmation || tabAcknowledgements[tab.id] === true,
  };
}
