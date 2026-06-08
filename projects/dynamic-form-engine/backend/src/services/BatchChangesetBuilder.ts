// ── Dataverse $batch changeset builder ────────────────────────
// Builds an OData $batch multipart MIME body containing a single changeset.
// All requests within the changeset succeed or fail together (atomicity).
// Content-ID references allow child records to reference the parent GUID
// created within the same changeset without needing a pre-existing parent GUID.

export type OperationSource =
  | { sourceType: 'parent' }
  | { sourceType: 'standard-child'; fieldKey: string }
  | { sourceType: 'grid-row'; fieldKey: string; rowIndex: number };

export interface BatchOperation {
  contentId: number;
  entitySetName: string;
  payload: Record<string, unknown>;
  source: OperationSource;
}

export interface BatchPartResult {
  contentId: number;
  statusCode: number;
  body: string;
}

export interface BatchChangesetResult {
  success: boolean;
  parentRecordId?: string;
  failingContentId?: number;
  failingSource?: OperationSource;
  errorMessage?: string;
  rawResponse?: string;
}

const BATCH_BOUNDARY = 'batch_dfe_boundary';
const CHANGESET_BOUNDARY = 'changeset_dfe_boundary';

export class BatchChangesetBuilder {
  private readonly operations: BatchOperation[] = [];
  private nextContentId = 1;

  addParentRecord(entitySetName: string, payload: Record<string, unknown>): number {
    const contentId = this.nextContentId++;
    this.operations.push({
      contentId,
      entitySetName,
      payload,
      source: { sourceType: 'parent' },
    });
    return contentId;
  }

  addStandardChildRecord(
    entitySetName: string,
    payload: Record<string, unknown>,
    fieldKey: string,
  ): number {
    const contentId = this.nextContentId++;
    this.operations.push({
      contentId,
      entitySetName,
      payload,
      source: { sourceType: 'standard-child', fieldKey },
    });
    return contentId;
  }

  addGridRowRecord(
    entitySetName: string,
    payload: Record<string, unknown>,
    fieldKey: string,
    rowIndex: number,
  ): number {
    const contentId = this.nextContentId++;
    this.operations.push({
      contentId,
      entitySetName,
      payload,
      source: { sourceType: 'grid-row', fieldKey, rowIndex },
    });
    return contentId;
  }

  get operationCount(): number {
    return this.operations.length;
  }

  buildMultipartBody(dataverseBaseUrl: string): string {
    const changesetParts = this.operations.map((op) =>
      buildChangesetPart(op, dataverseBaseUrl),
    );

    const changeset = [
      `--${CHANGESET_BOUNDARY}`,
      ...changesetParts.flatMap((part) => [part, `--${CHANGESET_BOUNDARY}`]),
    ]
      .join('\r\n')
      .replace(new RegExp(`--${CHANGESET_BOUNDARY}\r\n$`), `--${CHANGESET_BOUNDARY}--`);

    return [
      `--${BATCH_BOUNDARY}`,
      `Content-Type: multipart/mixed; boundary=${CHANGESET_BOUNDARY}`,
      '',
      changeset,
      `--${BATCH_BOUNDARY}--`,
    ].join('\r\n');
  }

  get batchContentType(): string {
    return `multipart/mixed; boundary=${BATCH_BOUNDARY}`;
  }

  buildContentIdToSourceMap(): Map<number, OperationSource> {
    const map = new Map<number, OperationSource>();
    for (const op of this.operations) {
      map.set(op.contentId, op.source);
    }
    return map;
  }
}

export function parseBatchResponse(
  rawBody: string,
  contentIdToSource: Map<number, OperationSource>,
): BatchChangesetResult {
  const parts = splitMultipartBody(rawBody);

  let parentRecordId: string | undefined;
  let failingContentId: number | undefined;
  let failingSource: OperationSource | undefined;
  let errorMessage: string | undefined;

  for (const part of parts) {
    const contentId = extractContentId(part);
    const statusCode = extractStatusCode(part);
    const body = extractPartBody(part);

    if (isSuccessStatus(statusCode)) {
      if (contentId === 1) {
        parentRecordId = extractEntityIdFromResponseBody(body);
      }
      continue;
    }

    // Any non-2xx means the entire changeset was rolled back by Dataverse.
    failingContentId = contentId ?? undefined;
    failingSource = contentId !== null ? contentIdToSource.get(contentId) : undefined;
    errorMessage = extractErrorMessage(body);
    break;
  }

  if (failingContentId !== undefined) {
    return {
      success: false,
      failingContentId,
      failingSource,
      errorMessage,
      rawResponse: rawBody,
    };
  }

  return { success: true, parentRecordId };
}

// ── Private helpers ────────────────────────────────────────────

function buildChangesetPart(op: BatchOperation, dataverseBaseUrl: string): string {
  const bodyJson = JSON.stringify(op.payload);
  return [
    `Content-Type: application/http`,
    `Content-Transfer-Encoding: binary`,
    `Content-ID: ${op.contentId}`,
    '',
    `POST ${dataverseBaseUrl}/${op.entitySetName} HTTP/1.1`,
    `Content-Type: application/json; charset=utf-8`,
    `OData-Version: 4.0`,
    '',
    bodyJson,
    '',
  ].join('\r\n');
}

function splitMultipartBody(body: string): string[] {
  // Split the multipart batch response on changeset boundary delimiters.
  // Dataverse may use either \r\n or \n line endings in responses.
  const lines = body.split(/\r\n|\r|\n/);
  const parts: string[] = [];
  let currentPart: string[] = [];
  let inPart = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Boundary lines: --changeset_... or --batch_...
    if (trimmed.startsWith('--changeset_') || trimmed.startsWith('--batch_')) {
      if (inPart && currentPart.length > 0) {
        parts.push(currentPart.join('\r\n'));
        currentPart = [];
      }
      inPart = !trimmed.endsWith('--'); // closing boundary ends multipart
    } else if (inPart) {
      currentPart.push(line);
    }
  }

  if (inPart && currentPart.length > 0) {
    parts.push(currentPart.join('\r\n'));
  }

  return parts.filter((p) => p.trim().length > 0);
}

function extractContentId(part: string): number | null {
  const match = /Content-ID:\s*(\d+)/i.exec(part);
  return match ? parseInt(match[1], 10) : null;
}

function extractStatusCode(part: string): number {
  // Matches "HTTP/1.1 201 Created" or similar in the part body
  const match = /HTTP\/1\.\d\s+(\d{3})/i.exec(part);
  return match ? parseInt(match[1], 10) : 500;
}

function extractPartBody(part: string): string {
  const doubleNewline = part.indexOf('\r\n\r\n');
  if (doubleNewline === -1) return '';
  return part.slice(doubleNewline + 4).trim();
}

function isSuccessStatus(code: number): boolean {
  return code >= 200 && code < 300;
}

function extractEntityIdFromResponseBody(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    // Dataverse returns the ID in the entity-specific ID attribute or @odata.entityId
    const odataId = parsed['@odata.entityId'] as string | undefined;
    if (odataId) {
      const guidMatch = /\(([0-9a-f-]{36})\)/i.exec(odataId);
      return guidMatch?.[1];
    }
    // Fallback: find any GUID-valued attribute ending in 'id'
    for (const [key, value] of Object.entries(parsed)) {
      if (key.endsWith('id') && typeof value === 'string' && isGuid(value)) {
        return value;
      }
    }
  } catch {
    // Non-JSON response body — ignore
  }
  return undefined;
}

function extractErrorMessage(body: string): string {
  if (!body) return 'Unknown Dataverse error';
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? 'Dataverse operation failed';
  } catch {
    return body.slice(0, 500);
  }
}

function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
