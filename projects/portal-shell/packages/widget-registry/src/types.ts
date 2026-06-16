import type { ComponentType } from 'react';
import type { ZodSchema } from 'zod';

/**
 * The configuration payload stored in qdb_portal_widget_config.config_json.
 * Each widget defines its own shape via configSchema.
 *
 * Locked by ADR-PORT-004. Immutable without ADR-PORT-004-revision-N.
 */
export type WidgetConfig = Record<string, unknown>;

/**
 * Props injected into every widget component by the dashboard shell.
 *
 * Locked by ADR-PORT-004. Immutable without ADR-PORT-004-revision-N.
 */
export interface WidgetComponentProps<TConfig extends WidgetConfig = WidgetConfig> {
  /** The instance-specific config from qdb_portal_widget_config.config_json */
  config: TConfig;
  /** The dashboard column span allocated to this widget instance */
  columnSpan: number;
  /** Locale string for widget-level formatting (e.g. 'ar', 'en') */
  locale: string;
  /** Widget instance ID (qdb_portal_widget_config record ID) */
  instanceId: string;
  /** Display title — from title_override or widget default */
  title: string;
}

/**
 * The complete widget definition contract.
 *
 * Locked by ADR-PORT-004. Immutable without ADR-PORT-004-revision-N.
 */
export interface WidgetDefinition<TConfig extends WidgetConfig = WidgetConfig> {
  /**
   * Unique machine-readable identifier for this widget type.
   * Key in qdb_portal_widget_config.widget_type.
   * Convention: kebab-case, e.g. 'my-requests-summary'.
   */
  readonly name: string;

  /**
   * Human-readable display name shown in the admin widget picker.
   * Supports EN and AR.
   */
  readonly title: { en: string; ar: string };

  /**
   * Short description shown in the admin widget picker.
   */
  readonly description: { en: string; ar: string };

  /**
   * Fluent UI icon name for the admin widget picker (e.g. 'DataPieRegular').
   */
  readonly icon: string;

  /**
   * Default column span (1–4). Admin can override per instance.
   */
  readonly defaultColumnSpan: 1 | 2 | 3 | 4;

  /**
   * The React component that renders this widget.
   * Must handle its own data fetching, loading skeleton, and error boundary.
   */
  readonly component: ComponentType<WidgetComponentProps<TConfig>>;

  /**
   * Zod schema that validates config_json stored in Dataverse.
   * Used by the admin config panel and the shell before rendering.
   */
  readonly configSchema: ZodSchema<TConfig>;

  /**
   * Default configuration used when a new widget instance is created.
   * Must satisfy configSchema.
   */
  readonly defaultConfig: TConfig;
}

/** Shape returned by the /api/widgets endpoint per widget instance */
export interface WidgetInstance {
  id: string;
  widgetType: string;
  titleOverride: string | null;
  titleOverrideAr: string | null;
  columnSpan: number;
  rowSpan: number;
  displayOrder: number;
  isVisible: boolean;
  configJson: WidgetConfig;
  gridLayoutJson: Record<string, unknown> | null;
}
