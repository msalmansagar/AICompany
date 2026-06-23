import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataverseClient } from '@portal/dataverse-client';
import type { PortalService, ServiceTab } from '@portal/types';

interface ServiceRouteOptions {
  dataverse: DataverseClient;
}

const PORTAL_SERVICE_ENTITY = 'qdb_portal_services';
const SERVICE_TAB_ENTITY = 'qdb_portal_service_tabs';

interface DataverseService {
  qdb_portal_serviceid: string;
  qdb_code: string;
  qdb_title: string;
  qdb_title_ar: string;
  qdb_short_description: string;
  qdb_short_description_ar: string;
  qdb_full_description: string;
  qdb_full_description_ar: string;
  qdb_category_tag: string;
  qdb_image_url: string;
  qdb_form_code: string;
  qdb_is_active: boolean;
  qdb_display_order: number;
}

interface DataverseServiceTab {
  qdb_portal_service_tabid: string;
  qdb_title: string;
  qdb_title_ar: string;
  qdb_content: string;
  qdb_content_ar: string;
  qdb_display_order: number;
  '_qdb_service_id_value': string;
}

const CodeParamSchema = z.object({ code: z.string().min(1) });

/**
 * Service catalog routes — /api/services/*
 * Read-only from the portal perspective; data is managed in Dataverse/CRM.
 */
export async function serviceRoutes(
  app: FastifyInstance,
  { dataverse }: ServiceRouteOptions,
): Promise<void> {
  // GET /api/services
  app.get<{ Reply: { data: PortalService[] } }>(
    '/api/services',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Services'], summary: 'Get active service catalog' },
    },
    async (request, reply) => {
      const result = await dataverse.getList<DataverseService>(
        PORTAL_SERVICE_ENTITY,
        {
          select: [
            'qdb_portal_serviceid', 'qdb_code', 'qdb_title', 'qdb_title_ar',
            'qdb_short_description', 'qdb_short_description_ar',
            'qdb_full_description', 'qdb_full_description_ar',
            'qdb_category_tag', 'qdb_image_url', 'qdb_form_code',
            'qdb_is_active', 'qdb_display_order',
          ],
          filter: 'qdb_is_active eq true',
          orderBy: 'qdb_display_order asc',
        },
        { correlationId: request.correlationId },
      );

      const services = await Promise.all(
        result.value.map(async (svc) => buildPortalService(svc, await loadTabs(dataverse, svc.qdb_portal_serviceid, request.correlationId))),
      );

      return reply.status(200).send({ data: services });
    },
  );

  // GET /api/services/:code
  app.get<{ Params: { code: string }; Reply: { data: PortalService } }>(
    '/api/services/:code',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Services'], summary: 'Get a single service by code' },
    },
    async (request, reply) => {
      const { code } = CodeParamSchema.parse(request.params);
      const result = await dataverse.getList<DataverseService>(
        PORTAL_SERVICE_ENTITY,
        {
          select: [
            'qdb_portal_serviceid', 'qdb_code', 'qdb_title', 'qdb_title_ar',
            'qdb_short_description', 'qdb_short_description_ar',
            'qdb_full_description', 'qdb_full_description_ar',
            'qdb_category_tag', 'qdb_image_url', 'qdb_form_code',
            'qdb_is_active', 'qdb_display_order',
          ],
          filter: `qdb_code eq '${code}'`,
          top: 1,
        },
        { correlationId: request.correlationId },
      );

      const record = result.value[0];
      if (!record) {
        return reply.status(404).send({
          code: 'service_not_found',
          message: `Service with code '${code}' not found`,
        });
      }

      const tabs = await loadTabs(dataverse, record.qdb_portal_serviceid, request.correlationId);
      return reply.status(200).send({ data: buildPortalService(record, tabs) });
    },
  );
}

async function loadTabs(
  dataverse: DataverseClient,
  serviceId: string,
  correlationId?: string,
): Promise<ServiceTab[]> {
  const result = await dataverse.getList<DataverseServiceTab>(
    SERVICE_TAB_ENTITY,
    {
      select: [
        'qdb_portal_service_tabid', 'qdb_title', 'qdb_title_ar',
        'qdb_content', 'qdb_content_ar', 'qdb_display_order',
      ],
      filter: `_qdb_service_id_value eq ${serviceId}`,
      orderBy: 'qdb_display_order asc',
    },
    { correlationId },
  );

  return result.value.map((tab) => ({
    id: tab.qdb_portal_service_tabid,
    title: tab.qdb_title,
    titleAr: tab.qdb_title_ar,
    content: tab.qdb_content,
    contentAr: tab.qdb_content_ar,
    displayOrder: tab.qdb_display_order,
  }));
}

function buildPortalService(record: DataverseService, tabs: ServiceTab[]): PortalService {
  return {
    id: record.qdb_portal_serviceid,
    code: record.qdb_code,
    title: record.qdb_title,
    titleAr: record.qdb_title_ar,
    shortDescription: record.qdb_short_description,
    shortDescriptionAr: record.qdb_short_description_ar,
    fullDescription: record.qdb_full_description,
    fullDescriptionAr: record.qdb_full_description_ar,
    categoryTag: record.qdb_category_tag,
    imageUrl: record.qdb_image_url,
    formCode: record.qdb_form_code,
    isActive: record.qdb_is_active,
    displayOrder: record.qdb_display_order,
    tabs,
  };
}
