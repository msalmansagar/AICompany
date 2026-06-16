import { z } from 'zod';

// ---------------------------------------------------------------------------
// Widget config domain types
// ---------------------------------------------------------------------------

export interface WidgetInstanceConfig {
  id: string;
  widgetType: string;
  title: string;
  displayOrder: number;
  columnSpan: number;
  /** Widget-specific JSON configuration blob */
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Zod schemas for admin widget mutations
// ---------------------------------------------------------------------------

export const WidgetCreateSchema = z.object({
  widgetType: z.string().min(1),
  title: z.string().min(1),
  displayOrder: z.number().int().min(0),
  columnSpan: z.number().int().min(1).max(12),
  config: z.record(z.unknown()),
});

export const WidgetPatchSchema = WidgetCreateSchema.partial();

export const WidgetIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type WidgetCreate = z.infer<typeof WidgetCreateSchema>;
export type WidgetPatch = z.infer<typeof WidgetPatchSchema>;
export type WidgetIdParam = z.infer<typeof WidgetIdParamSchema>;
