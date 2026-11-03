import { ARREAR_BUCKET_CODES } from '@dcp/domain';

/**
 * How a delinquency bucket looks, everywhere in Workspace V2.
 *
 * One contract, so 31–60 DPD is the same dot, the same tint and the same words in the case list,
 * the matrix, the case header and the queue preview. The **rank is the bucket's position in the
 * MIS contract** (1 for the first bucket, 10 for the last), never a number of days compared
 * against a threshold: the colour distinguishes buckets, it does not grade them.
 */
export interface BucketVisual {
  label: string;
  /** 1–10 by MIS order, or 0 for a label the contract does not know (drawn neutral). */
  rank: number;
  /** For assistive technology: "61 to 90 days past due". */
  description: string;
}

export const BUCKET_RANKS = ARREAR_BUCKET_CODES.length;

export function bucketVisual(bucket: string | undefined): BucketVisual {
  if (!bucket) return { label: '—', rank: 0, description: 'Bucket not recorded' };
  const position = (ARREAR_BUCKET_CODES as readonly string[]).indexOf(bucket);
  return { label: bucket, rank: position + 1, description: describeBucket(bucket) };
}

function describeBucket(bucket: string): string {
  if (bucket.startsWith('>')) return `over ${bucket.slice(1)} days past due`;
  return `${bucket.replace('-', ' to ')} days past due`;
}
