import type { FastifyInstance } from 'fastify';
import type { DataverseClient } from '@portal/dataverse-client';
import type { WidgetInstanceConfig } from '@portal/types';

interface WidgetRouteOptions {
  dataverse: DataverseClient;
}

const WIDGET_CONFIG_ENTITY = 'qdb_portal_widget_configs';

interface DataverseWidgetConfig {
  qdb_portal_widget_configid: string;
  qdb_widget_type: string;
  qdb_title: string;
  qdb_display_order: number;
  qdb_column_span: number;
  qdb_config: string; // JSON blob
}

/**
 * GET /api/widgets — authenticated.
 *
 * Returns the widget configuration for the authenticated user's dashboard.
 * Widget configs are currently shared across all users (role-based in the future).
 */
export async function widgetRoutes(
  app: FastifyInstance,
  { dataverse }: WidgetRouteOptions,
): Promise<void> {
  app.get<{ Reply: { data: WidgetInstanceConfig[] } }>(
    '/api/widgets',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Widgets'], summary: 'Get widget configuration for the dashboard' },
    },
    async (request, reply) => {
      const result = await dataverse.getList<DataverseWidgetConfig>(
        WIDGET_CONFIG_ENTITY,
        {
          select: [
            'qdb_portal_widget_configid',
            'qdb_widget_type',
            'qdb_title',
            'qdb_display_order',
            'qdb_column_span',
            'qdb_config',
          ],
          filter: 'statecode eq 0',
          orderBy: 'qdb_display_order asc',
        },
        { correlationId: request.correlationId },
      );

      const widgets: WidgetInstanceConfig[] = result.value.map((w) => ({
        id: w.qdb_portal_widget_configid,
        widgetType: w.qdb_widget_type,
        title: w.qdb_title,
        displayOrder: w.qdb_display_order,
        columnSpan: w.qdb_column_span,
        config: w.qdb_config ? (JSON.parse(w.qdb_config) as Record<string, unknown>) : {},
      }));

      return reply.status(200).send({ data: widgets });
    },
  );
}
