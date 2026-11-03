import type { ReactNode } from 'react';
import { bucketVisual } from '../data/bucketVisual.js';
import { statusTone } from './primitives.js';

/**
 * One badge for every status Customer 360 shows: case status, DPD bucket, PTP outcome,
 * communication delivery, Legal referral and Complaint referral.
 *
 * Six tones, each with readable text **and** a border, so meaning never rests on colour alone. The
 * tone is presentation of a status the platform already set; it decides nothing.
 */
export type BadgeTone = 'neutral' | 'info' | 'warn' | 'bad' | 'ok' | 'referral';

/** Whole class names, so every one can be checked against its rule. */
const TONE_CLASSES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'sb sb-neutral', info: 'sb sb-info', warn: 'sb sb-warn', bad: 'sb sb-bad', ok: 'sb sb-ok', referral: 'sb sb-referral',
};

export function StatusBadge({ tone, children, title, testId }: { tone: BadgeTone; children: ReactNode; title?: string | undefined; testId?: string | undefined }) {
  return <span className={TONE_CLASSES[tone]} title={title} data-testid={testId}>{children}</span>;
}

/** A status word from the platform, toned by the workspace's shared vocabulary. */
export function statusBadgeTone(status: string | undefined): BadgeTone {
  if (!status) return 'neutral';
  const tone = statusTone(status);
  return tone === 'muted' ? 'neutral' : tone;
}

/** A bucket, toned by its position in the MIS contract — first bucket warn, later buckets bad. */
export function BucketBadge({ bucket, testId }: { bucket: string | undefined; testId?: string | undefined }) {
  const visual = bucketVisual(bucket);
  if (visual.rank === 0) return <StatusBadge tone="neutral" testId={testId}>{bucket ?? 'No bucket'}</StatusBadge>;
  return <StatusBadge tone={visual.rank === 1 ? 'warn' : 'bad'} title={visual.description} testId={testId}>{visual.label} DPD</StatusBadge>;
}
