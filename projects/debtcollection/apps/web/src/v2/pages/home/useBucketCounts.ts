import { useEffect, useState } from 'react';
import { unknownCount, type OperationalBucket, type WorkCount } from '@dcp/domain';
import { bucketIsAvailable, countBucket, loadTypeIds, type TypeIds } from '../../../data/operationalQueue.js';
import { useCrmSession } from '../../../shell/context.js';

/**
 * The operational buckets V2 shows, and each one's count — asked of the platform as a count, exactly as
 * the work queue asks it. A count that cannot be read is *unknown*, never zero (KI-96), and a bucket the
 * configuration cannot serve (no due dates, KI-101) is reported unavailable rather than empty.
 */
export const HOME_BUCKETS: readonly OperationalBucket[] = [
  'MyAssigned', 'AwaitingAssignment', 'Escalated', 'Legal', 'Disputes', 'Complaints', 'DeceasedReview',
];

export interface BucketCounts {
  isReady: boolean;
  counts: Partial<Record<OperationalBucket, WorkCount>>;
  isAvailable: (bucket: OperationalBucket) => boolean;
}

export function useBucketCounts(buckets: readonly OperationalBucket[] = HOME_BUCKETS): BucketCounts {
  const { adapter, context } = useCrmSession();
  const userId = context.userId;
  const [typeIds, setTypeIds] = useState<TypeIds | null>(null);
  const [counts, setCounts] = useState<Partial<Record<OperationalBucket, WorkCount>>>({});

  useEffect(() => {
    let cancelled = false;
    loadTypeIds(adapter)
      .then(result => { if (!cancelled) setTypeIds(result); })
      .catch(() => { if (!cancelled) setTypeIds({ legal: [], concern: [], deceased: [], restructuring: [] }); });
    return () => { cancelled = true; };
  }, [adapter]);

  useEffect(() => {
    if (!typeIds) return undefined;
    let cancelled = false;
    const bucketContext = { ...(userId ? { currentUserId: userId } : {}), typeIds };
    void Promise.all(buckets.map(async bucket => {
      // One bucket per promise, so one failing count leaves the others standing.
      const count = await countBucket(adapter, bucket, bucketContext).catch(() => unknownCount());
      return [bucket, count] as const;
    })).then(entries => { if (!cancelled) setCounts(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [adapter, typeIds, userId, buckets]);

  const isAvailable = (bucket: OperationalBucket) =>
    typeIds !== null && bucketIsAvailable(bucket, { ...(userId ? { currentUserId: userId } : {}), typeIds });

  return { isReady: typeIds !== null && Object.keys(counts).length > 0, counts, isAvailable };
}
