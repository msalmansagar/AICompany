/**
 * A one-slot channel from anything that says "open the step panel on THIS
 * tab" to the panel itself (CWFD-018).
 *
 * The panel owns its active tab as local state — deliberately, so tab choice
 * survives step switches. The floating step toolbar needs to steer it from
 * outside without moving that state into the store (where zundo would put
 * every tab click into the undo history). A request made while the panel is
 * not mounted yet — selecting a step and asking for its Assignment tab in
 * the same click — is buffered and consumed on subscribe.
 */

export type RequestablePanelTab = 'overview' | 'general' | 'assignment' | 'sla' | 'automation';

type TabListener = (tab: RequestablePanelTab) => void;

let listener: TabListener | null = null;
let pending: RequestablePanelTab | null = null;

/** Ask the step panel to show a tab; buffered if the panel is not mounted yet. */
export function requestStepPanelTab(tab: RequestablePanelTab): void {
  if (listener) listener(tab);
  else pending = tab;
}

/**
 * The panel's side: receive tab requests, including one made just before
 * mounting. Returns the unsubscribe.
 */
export function onStepPanelTabRequest(nextListener: TabListener): () => void {
  listener = nextListener;
  if (pending !== null) {
    nextListener(pending);
    pending = null;
  }
  return () => {
    if (listener === nextListener) listener = null;
  };
}

/** Test hook: forget any buffered request. */
export function resetStepPanelBus(): void {
  listener = null;
  pending = null;
}
