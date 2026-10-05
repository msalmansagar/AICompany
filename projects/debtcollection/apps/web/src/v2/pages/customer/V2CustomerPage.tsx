import type { ViewRequest } from '../../V2Workspace.js';
import { Customer360View } from '../../../views/Customer360.js';
import { V2CustomersList } from './V2CustomersList.js';

/**
 * Customer 360 in V2.
 *
 * One shared business screen serves both workspaces (user instruction, 2026-09-28): the customer's
 * identity, position, loan accounts and facilities, collection history and channel preferences are
 * `Customer360View`, hosted here inside the V2 frame and re-skinned by the token bridge. V2 keeps
 * only what is V2's own — the customers list an officer chooses from when no customer is named.
 */
export function V2CustomerPage({ request }: { request: ViewRequest }) {
  const customerId = request.recordId;
  if (!customerId) return <V2CustomersList onOpenCustomer={request.onOpenCustomer} onOpenCase={request.onOpenCase} />;
  return (
    <div className="v2-bridged" data-testid="v2-customer">
      <Customer360View customerBusinessId={customerId} onOpenCase={request.onOpenCase} onOpenActionPlan={request.onOpenActionPlan} onOpenCustomer={request.onOpenCustomer} />
    </div>
  );
}
