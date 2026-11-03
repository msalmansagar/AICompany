/**
 * Where a Collection Case number comes from.
 *
 * QDB owns an auto-numbering mechanism (`crmi_autonumberingsetup`, with a live plugin that creates
 * and maintains the numbered attribute). DCP must use it rather than building another — and, as of
 * 2026-09-18, **it holds no configuration row on the sandbox and no other QDB table demonstrates a
 * numbering convention**, so the business-facing format is not something this platform may choose
 * (KI-49).
 *
 * The two sources below are what that leaves:
 *
 *   `Provisional`        DCP composes the number from business identity. Unique per facility and
 *                        episode by construction, readable, and obviously interim.
 *   `PlatformConfigured` DCP writes no number at all; the configured QDB mechanism fills the column.
 *
 * Which one applies is deployment configuration, so the day QDB configures the mechanism the switch
 * is a configuration change and not a code change.
 */

import { z } from 'zod';

export const CaseNumberSourceKindSchema = z.enum(['Provisional', 'PlatformConfigured']);
export type CaseNumberSourceKind = z.infer<typeof CaseNumberSourceKindSchema>;

/**
 * Composes the interim number: source system, facility number, episode. Unique by construction
 * because the facility identity is unique and an episode number never repeats for a facility — which
 * is what lets the `qdb_casenumber_uk` alternate key enforce it at the platform level.
 */
export function composeProvisionalCaseNumber(
  facility: { facilityNumber: string; sourceSystem: string },
  episodeNumber: number,
): string {
  return `${facility.sourceSystem}-${facility.facilityNumber}-E${episodeNumber}`;
}

/**
 * Returns the number to write, or `undefined` when the configured platform mechanism owns it.
 * A caller that receives `undefined` must omit the column entirely rather than writing an empty
 * string — the mechanism populates it, and a blank would collide on the alternate key.
 */
export function caseNumberFor(
  kind: CaseNumberSourceKind,
  facility: { facilityNumber: string; sourceSystem: string },
  episodeNumber: number,
): string | undefined {
  return kind === 'Provisional' ? composeProvisionalCaseNumber(facility, episodeNumber) : undefined;
}
