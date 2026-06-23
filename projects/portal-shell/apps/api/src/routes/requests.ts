import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataverseClient } from '@portal/dataverse-client';
import type { UserRequest, RequestDetail, RequestTimelineEntry, RequestDocument } from '@portal/types';
import type { RbacAuditWriter } from '../services/RbacAuditWriter.js';

interface RequestRouteOptions {
  dataverse: DataverseClient;
  rbacAuditWriter: RbacAuditWriter;
}

const REQUEST_ENTITY = 'qdb_portal_requests';
const TIMELINE_ENTITY = 'qdb_portal_request_timelines';
const DOCUMENT_ENTITY = 'qdb_portal_request_documents';

const IdParamSchema = z.object({ id: z.string().uuid() });

type RequestStatus = 'submitted' | 'under-review' | 'approved' | 'rejected' | 'pending-docs';

const STATUS_MAP: Record<number, RequestStatus> = {
  860000001: 'submitted',
  860000002: 'under-review',
  860000003: 'approved',
  860000004: 'rejected',
  860000005: 'pending-docs',
};

interface DataverseRequest {
  qdb_portal_requestid: string;
  qdb_service_code: string;
  qdb_service_title: string;
  qdb_status: number;
  createdon: string;
  modifiedon: string;
  qdb_reference_number: string;
  qdb_form_data: string;
  qdb_user_id: string;
}

/**
 * My Requests routes — /api/requests/*
 * All queries are scoped to the authenticated user.
 */
export async function requestRoutes(
  app: FastifyInstance,
  { dataverse, rbacAuditWriter }: RequestRouteOptions,
): Promise<void> {
  // GET /api/requests
  app.get<{ Reply: { data: UserRequest[] } }>(
    '/api/requests',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Requests'], summary: 'List requests submitted by the authenticated user' },
    },
    async (request, reply) => {
      const userId = request.user?.sub ?? '';
      const result = await dataverse.getList<DataverseRequest>(
        REQUEST_ENTITY,
        {
          select: [
            'qdb_portal_requestid', 'qdb_service_code', 'qdb_service_title',
            'qdb_status', 'createdon', 'modifiedon', 'qdb_reference_number',
          ],
          filter: `qdb_user_id eq '${userId}'`,
          orderBy: 'createdon desc',
          top: 100,
        },
        { correlationId: request.correlationId },
      );

      const requests = result.value.map((r) => mapToUserRequest(r));
      return reply.status(200).send({ data: requests });
    },
  );

  // GET /api/requests/:id
  app.get<{ Params: { id: string }; Reply: { data: RequestDetail } | { code: string; message: string } }>(
    '/api/requests/:id',
    {
      preHandler: [app.authenticate, app.requirePermission('read', 'CitizenPII')],
      schema: { tags: ['Requests'], summary: 'Get a request detail including timeline and documents' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const userId = request.user?.sub ?? '';
      const correlationId = request.correlationId;

      const record = await dataverse.getById<DataverseRequest>(
        REQUEST_ENTITY,
        id,
        {
          select: [
            'qdb_portal_requestid', 'qdb_service_code', 'qdb_service_title',
            'qdb_status', 'createdon', 'modifiedon', 'qdb_reference_number',
            'qdb_form_data', 'qdb_user_id',
          ],
        },
        { correlationId },
      );

      if (record.qdb_user_id !== userId) {
        return reply.status(403).send({
          code: 'forbidden',
          message: 'You do not have access to this request',
        });
      }

      const [timeline, documents] = await Promise.all([
        loadTimeline(dataverse, id, correlationId),
        loadDocuments(dataverse, id, correlationId),
      ]);

      const detail: RequestDetail = {
        ...mapToUserRequest(record),
        formData: record.qdb_form_data ? (JSON.parse(record.qdb_form_data) as Record<string, unknown>) : {},
        timeline,
        documents,
      };

      // AC-RBAC-001: every read of CitizenPII fields must be audit-logged
      rbacAuditWriter.logPiiAccessed({
        actorUserId: userId,
        resourceId: id,
        subject: 'CitizenPII',
        correlationId,
        ipAddress: request.ip,
      }).catch(() => {}); // audit failure must not break the response

      return reply.status(200).send({ data: detail });
    },
  );

  // POST /api/requests/:id/documents — document upload handled by multipart
  app.post<{ Params: { id: string } }>(
    '/api/requests/:id/documents',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Requests'], summary: 'Upload a document for a request' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      // Document upload is handled via Dataverse file column or Azure Blob Storage.
      // The multipart processing is delegated to the caller's implementation.
      // This stub validates ownership then delegates to the service layer.
      const userId = request.user?.sub ?? '';
      const record = await dataverse.getById<Pick<DataverseRequest, 'qdb_user_id'>>(
        REQUEST_ENTITY,
        id,
        { select: ['qdb_user_id'] },
        { correlationId: request.correlationId },
      );

      if (record.qdb_user_id !== userId) {
        return reply.status(403).send({
          code: 'forbidden',
          message: 'You do not have access to this request',
        });
      }

      // TODO(DFE-PORT-002): implement multipart upload to Dataverse file column
      return reply.status(501).send({
        code: 'not_implemented',
        message: 'Document upload is scheduled for DFE-PORT-002',
      });
    },
  );
}

async function loadTimeline(
  dataverse: DataverseClient,
  requestId: string,
  correlationId?: string,
): Promise<RequestTimelineEntry[]> {
  const result = await dataverse.getList<{
    qdb_portal_request_timelineid: string;
    qdb_status: string;
    qdb_note: string | null;
    createdon: string;
    qdb_changed_by: string;
  }>(
    TIMELINE_ENTITY,
    {
      select: ['qdb_portal_request_timelineid', 'qdb_status', 'qdb_note', 'createdon', 'qdb_changed_by'],
      filter: `_qdb_request_id_value eq ${requestId}`,
      orderBy: 'createdon asc',
    },
    { correlationId },
  );

  return result.value.map((entry) => ({
    id: entry.qdb_portal_request_timelineid,
    status: entry.qdb_status,
    note: entry.qdb_note,
    changedOn: entry.createdon,
    changedBy: entry.qdb_changed_by,
  }));
}

async function loadDocuments(
  dataverse: DataverseClient,
  requestId: string,
  correlationId?: string,
): Promise<RequestDocument[]> {
  const result = await dataverse.getList<{
    qdb_portal_request_documentid: string;
    qdb_name: string;
    createdon: string;
    qdb_url: string;
  }>(
    DOCUMENT_ENTITY,
    {
      select: ['qdb_portal_request_documentid', 'qdb_name', 'createdon', 'qdb_url'],
      filter: `_qdb_request_id_value eq ${requestId}`,
      orderBy: 'createdon desc',
    },
    { correlationId },
  );

  return result.value.map((doc) => ({
    id: doc.qdb_portal_request_documentid,
    name: doc.qdb_name,
    uploadedOn: doc.createdon,
    url: doc.qdb_url,
  }));
}

function mapToUserRequest(record: DataverseRequest): UserRequest {
  return {
    id: record.qdb_portal_requestid,
    serviceCode: record.qdb_service_code,
    serviceTitle: record.qdb_service_title,
    status: STATUS_MAP[record.qdb_status] ?? 'submitted',
    submittedOn: record.createdon,
    lastUpdatedOn: record.modifiedon,
    referenceNumber: record.qdb_reference_number,
  };
}
