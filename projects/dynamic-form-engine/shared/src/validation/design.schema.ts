import { z } from 'zod';

// ─── Primitive enums ──────────────────────────────────────────────────────────

const LayoutTypeSchema = z.enum([
  'SingleColumn', 'TwoColumn', 'Grid', 'Stepper', 'Wizard', 'Accordion', 'TabBased', 'InlineCompact',
]);

const LabelPositionSchema = z.enum(['Top', 'Left', 'Floating']);
const SectionStyleTypeSchema = z.enum(['Card', 'Flat', 'Outlined']);
const TabStyleTypeSchema = z.enum(['Tabs', 'Stepper', 'Accordion', 'Sidebar']);
const ButtonStyleTypeSchema = z.enum(['Primary', 'Outline', 'Text']);
const InputStyleTypeSchema = z.enum(['Outlined', 'Filled', 'Standard']);
const FieldWidthTypeSchema = z.enum(['Full', 'Half', 'Custom']);
const ButtonSizeTypeSchema = z.enum(['Small', 'Medium', 'Large']);
const CollapseStyleTypeSchema = z.enum(['None', 'Animated', 'Instant']);
const AnimationStyleTypeSchema = z.enum(['None', 'Fade', 'Slide']);
const HoverEffectTypeSchema = z.enum(['None', 'Elevate', 'ColorShift']);
const LoadingStyleTypeSchema = z.enum(['Spinner', 'Dots', 'Pulse']);
const ButtonTypeSchema = z.enum(['Submit', 'SaveDraft', 'Cancel']);
const ShadowStyleSchema = z.enum(['None', 'Subtle', 'Strong']);
const SpacingScaleSchema = z.enum(['Compact', 'Normal', 'Comfortable']);
const AlignmentTypeSchema = z.enum(['Left', 'Center', 'Right']);
const CardStyleTypeSchema = z.enum(['Flat', 'Elevated', 'Outlined']);

// ─── Entity schemas ───────────────────────────────────────────────────────────

export const ThemeDefinitionSchema = z.object({
  id: z.string(),
  themeCode: z.string(),
  themeName: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  surfaceColor: z.string().optional(),
  textPrimaryColor: z.string().optional(),
  textSecondaryColor: z.string().optional(),
  borderColor: z.string().optional(),
  errorColor: z.string().optional(),
  successColor: z.string().optional(),
  warningColor: z.string().optional(),
  fontFamily: z.string().optional(),
  fontUrl: z.string().optional(),
  baseFontSize: z.string().optional(),
  headingFontSize: z.string().optional(),
  labelFontSize: z.string().optional(),
  inputFontSize: z.string().optional(),
  borderRadius: z.string().optional(),
  shadowStyle: ShadowStyleSchema.optional(),
  spacingScale: SpacingScaleSchema.optional(),
  isDarkMode: z.boolean(),
  isActive: z.boolean(),
  _brand: z.literal('ThemeDefinition').optional(),
});

export const FormDesignSchema = z.object({
  id: z.string(),
  formDefinitionId: z.string().optional(),
  themeId: z.string().optional(),
  layoutType: LayoutTypeSchema,
  labelPosition: LabelPositionSchema,
  sectionStyle: SectionStyleTypeSchema,
  tabStyle: TabStyleTypeSchema,
  buttonStyle: ButtonStyleTypeSchema,
  animationEnabled: z.boolean(),
  responsiveBehavior: z.record(z.unknown()).optional(),
  maxWidth: z.string().optional(),
  alignment: AlignmentTypeSchema,
  customCss: z.string().optional(),
  stickyActionBar: z.boolean(),
  skeletonLoaderEnabled: z.boolean(),
  isActive: z.boolean(),
});

export const SectionDesignSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  backgroundColor: z.string().optional(),
  borderStyle: z.string().optional(),
  padding: z.string().optional(),
  margin: z.string().optional(),
  columnLayout: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cardStyle: CardStyleTypeSchema,
  collapsibleStyle: CollapseStyleTypeSchema,
  headerStyle: z.record(z.string()).optional(),
  visibilityAnimation: AnimationStyleTypeSchema,
  isActive: z.boolean(),
});

export const FieldDesignSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  labelStyle: z.record(z.string()).optional(),
  inputStyle: InputStyleTypeSchema,
  width: FieldWidthTypeSchema,
  customWidth: z.string().optional(),
  height: z.string().optional(),
  placeholderStyle: z.record(z.string()).optional(),
  iconPrefix: z.string().optional(),
  iconSuffix: z.string().optional(),
  tooltipStyle: z.record(z.string()).optional(),
  errorStyle: z.record(z.string()).optional(),
  focusStyle: z.record(z.string()).optional(),
  disabledStyle: z.record(z.string()).optional(),
  isActive: z.boolean(),
});

export const ButtonDesignSchema = z.object({
  id: z.string(),
  formDefinitionId: z.string(),
  buttonType: ButtonTypeSchema,
  color: z.string().optional(),
  size: ButtonSizeTypeSchema,
  borderRadius: z.string().optional(),
  alignment: AlignmentTypeSchema,
  icon: z.string().optional(),
  hoverEffect: HoverEffectTypeSchema,
  loadingStyle: LoadingStyleTypeSchema,
  isActive: z.boolean(),
});

export const LayoutGridSchema = z.object({
  id: z.string(),
  formDesignId: z.string(),
  fieldId: z.string(),
  columnsTotal: z.number(),
  spanMobile: z.number(),
  spanTablet: z.number(),
  spanDesktop: z.number(),
});

export const DesignPayloadSchema = z.object({
  theme: ThemeDefinitionSchema,
  formDesign: FormDesignSchema,
  sectionDesigns: z.record(SectionDesignSchema),
  fieldDesigns: z.record(FieldDesignSchema),
  buttonDesigns: z.object({
    Submit: ButtonDesignSchema.optional(),
    SaveDraft: ButtonDesignSchema.optional(),
    Cancel: ButtonDesignSchema.optional(),
  }),
  layoutGrid: z.array(LayoutGridSchema),
});
