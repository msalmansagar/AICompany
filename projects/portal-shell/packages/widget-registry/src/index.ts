import { z } from 'zod';
import { registerWidget } from './registry';
import { MyRequestsSummaryWidget } from './widgets/MyRequestsSummaryWidget';
import { RecentActivityWidget } from './widgets/RecentActivityWidget';
import { AnnouncementsWidget } from './widgets/AnnouncementsWidget';
import { QuickActionsWidget } from './widgets/QuickActionsWidget';
import { StatisticsWidget } from './widgets/StatisticsWidget';

// ---------------------------------------------------------------------------
// Register all five built-in widgets at module import time.
// This must run before the dashboard shell resolves any widget definitions.
// ---------------------------------------------------------------------------

registerWidget({
  name: 'my-requests-summary',
  title: { en: 'My Requests Summary', ar: 'ملخص طلباتي' },
  description: {
    en: 'Shows a summary count of your service requests by status',
    ar: 'يعرض ملخصاً لعدد طلبات الخدمة حسب الحالة',
  },
  icon: 'DocumentRegular',
  defaultColumnSpan: 2,
  component: MyRequestsSummaryWidget,
  configSchema: z.object({
    showRejected: z.boolean().default(true),
  }),
  defaultConfig: { showRejected: true },
});

registerWidget({
  name: 'recent-activity',
  title: { en: 'Recent Activity', ar: 'النشاط الأخير' },
  description: {
    en: 'Shows your most recent portal activity and notifications',
    ar: 'يعرض أحدث نشاطات البوابة والإشعارات',
  },
  icon: 'ClockRegular',
  defaultColumnSpan: 2,
  component: RecentActivityWidget,
  configSchema: z.object({
    limit: z.number().int().min(1).max(20).default(5),
  }),
  defaultConfig: { limit: 5 },
});

registerWidget({
  name: 'announcements',
  title: { en: 'Announcements', ar: 'الإعلانات' },
  description: {
    en: 'Displays the latest published announcements',
    ar: 'يعرض أحدث الإعلانات المنشورة',
  },
  icon: 'MegaphoneRegular',
  defaultColumnSpan: 2,
  component: AnnouncementsWidget,
  configSchema: z.object({
    maxItems: z.number().int().min(1).max(10).default(3),
  }),
  defaultConfig: { maxItems: 3 },
});

registerWidget({
  name: 'quick-actions',
  title: { en: 'Quick Actions', ar: 'الإجراءات السريعة' },
  description: {
    en: 'Configurable grid of shortcut buttons to key portal pages',
    ar: 'شبكة قابلة للتكوين من أزرار الاختصارات لصفحات البوابة الرئيسية',
  },
  icon: 'GridRegular',
  defaultColumnSpan: 2,
  component: QuickActionsWidget,
  configSchema: z.object({
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    actions: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          labelAr: z.string().min(1),
          url: z.string().min(1),
          icon: z.string().min(1),
        })
      )
      .default([]),
  }),
  defaultConfig: { columns: 3, actions: [] },
});

registerWidget({
  name: 'statistics-counters',
  title: { en: 'Statistics', ar: 'الإحصائيات' },
  description: {
    en: 'Displays configurable KPI counters sourced from the API',
    ar: 'يعرض مؤشرات الأداء الرئيسية القابلة للتكوين من واجهة برمجة التطبيقات',
  },
  icon: 'DataPieRegular',
  defaultColumnSpan: 4,
  component: StatisticsWidget,
  configSchema: z.object({
    kpis: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          labelAr: z.string().min(1),
          apiPath: z.string().min(1),
          unit: z.string().default(''),
          color: z.enum(['brand', 'success', 'warning', 'danger', 'neutral']).default('brand'),
        })
      )
      .default([]),
  }),
  defaultConfig: { kpis: [] },
});

// Re-export registry functions and types for consumers
export { registerWidget, resolveWidget, listRegisteredWidgets, clearRegistry } from './registry';
export type { WidgetDefinition, WidgetComponentProps, WidgetConfig, WidgetInstance } from './types';
