import { OPENING_BUCKET, WHAT_IS_POSSIBLE, type WorkoutQueueId } from '../../../views/workoutQueueView.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { V2QueuePage } from './V2QueuePage.js';

/**
 * Disputes, Legal and Deceased Review: the queue opened on that process, with V1's own statement of
 * what is and is not possible there — one wording for both workspaces, never a second copy.
 */
function workoutQueue(id: WorkoutQueueId) {
  return function WorkoutQueue({ request }: { request: ViewRequest }) {
    return <V2QueuePage request={request} fixedBucket={OPENING_BUCKET[id]} intro={WHAT_IS_POSSIBLE[id]} />;
  };
}

export const V2DisputesPage = workoutQueue('disputes');
export const V2LegalPage = workoutQueue('legal');
export const V2DeceasedPage = workoutQueue('claims');
