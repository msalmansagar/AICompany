import { z } from 'zod';

// ---------------------------------------------------------------------------
// My Requests domain types
// ---------------------------------------------------------------------------

export type RequestStatus =
  | 'submitted'
  | 'under-review'
  | 'approved'
  | 'rejected'
  | 'pending-docs';

export interface UserRequest {
  id: string;
  serviceCode: string;
  serviceTitle: string;
  status: RequestStatus;
  /** ISO 8601 date string */
  submittedOn: string;
  /** ISO 8601 date string */
  lastUpdatedOn: string;
  referenceNumber: string;
}

export interface RequestTimelineEntry {
  id: string;
  status: string;
  note: string | null;
  /** ISO 8601 date string */
  changedOn: string;
  changedBy: string;
}

export interface RequestDocument {
  id: string;
  name: string;
  /** ISO 8601 date string */
  uploadedOn: string;
  url: string;
}

export interface RequestDetail extends UserRequest {
  formData: Record<string, unknown>;
  timeline: RequestTimelineEntry[];
  documents: RequestDocument[];
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const RequestIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type RequestIdParam = z.infer<typeof RequestIdParamSchema>;
