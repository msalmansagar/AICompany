import { CASE_CARD_PAGE_SIZE } from '../data/collectionQueries.js';
import { Icon } from '../components/primitives.js';

/**
 * Said wherever a case card holds only its most recent page.
 *
 * A card that stops at its page size without saying so tells an officer the case has no more — the
 * silent-truncation failure. The Actions grid pages through every activity, so the notice says
 * where the rest are rather than paging inside a card.
 */
export function MoreOnActionsNotice({ testId }: { testId: string }) {
  return (
    <div className="info-banner" data-testid={testId}>
      <Icon name="info" />
      <div>
        Showing the {CASE_CARD_PAGE_SIZE} most recent. Older ones are on the Actions tab, which
        pages through every activity on the case.
      </div>
    </div>
  );
}
