// ─────────────────────────────────────────────────────────────
// Design system type contracts — shared between frontend and backend
// ─────────────────────────────────────────────────────────────

export type LayoutType =
  | 'SingleColumn'
  | 'TwoColumn'
  | 'Grid'
  | 'Stepper'
  | 'Wizard'
  | 'Accordion'
  | 'TabBased'
  | 'InlineCompact';

export type LabelPosition = 'Top' | 'Left' | 'Floating';

export type SectionStyleType = 'Card' | 'Flat' | 'Outlined';

export type TabStyleType = 'Tabs' | 'Stepper' | 'Accordion' | 'Sidebar';

export type ButtonStyleType = 'Primary' | 'Outline' | 'Text';

export type InputStyleType = 'Outlined' | 'Filled' | 'Standard';

export type FieldWidthType = 'Full' | 'Half' | 'Custom';

export type ButtonSizeType = 'Small' | 'Medium' | 'Large';

export type CollapseStyleType = 'None' | 'Animated' | 'Instant';

export type AnimationStyleType = 'None' | 'Fade' | 'Slide';

export type HoverEffectType = 'None' | 'Elevate' | 'ColorShift';

export type LoadingStyleType = 'Spinner' | 'Dots' | 'Pulse';

export type ButtonType = 'Submit' | 'SaveDraft' | 'Cancel';

export type ShadowStyle = 'None' | 'Subtle' | 'Strong';

export type SpacingScale = 'Compact' | 'Normal' | 'Comfortable';

export type AlignmentType = 'Left' | 'Center' | 'Right';

export type CardStyleType = 'Flat' | 'Elevated' | 'Outlined';

export interface ThemeDefinition {
  id: string;
  themeCode: string;
  themeName: string;
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textPrimaryColor?: string;
  textSecondaryColor?: string;
  borderColor?: string;
  errorColor?: string;
  successColor?: string;
  warningColor?: string;
  fontFamily?: string;
  fontUrl?: string;
  baseFontSize?: string;
  headingFontSize?: string;
  labelFontSize?: string;
  inputFontSize?: string;
  borderRadius?: string;
  shadowStyle?: ShadowStyle;
  spacingScale?: SpacingScale;
  isDarkMode: boolean;
  isActive: boolean;
}

export interface FormDesign {
  id: string;
  formDefinitionId?: string;
  themeId?: string;
  layoutType: LayoutType;
  labelPosition: LabelPosition;
  sectionStyle: SectionStyleType;
  tabStyle: TabStyleType;
  buttonStyle: ButtonStyleType;
  animationEnabled: boolean;
  responsiveBehavior?: Record<string, unknown>;
  maxWidth?: string;
  alignment: AlignmentType;
  customCss?: string;
  stickyActionBar: boolean;
  skeletonLoaderEnabled: boolean;
  isActive: boolean;
}

export interface SectionDesign {
  id: string;
  sectionId: string;
  backgroundColor?: string;
  borderStyle?: string;
  padding?: string;
  margin?: string;
  columnLayout: 1 | 2 | 3 | 4;
  cardStyle: CardStyleType;
  collapsibleStyle: CollapseStyleType;
  headerStyle?: Record<string, string>;
  visibilityAnimation: AnimationStyleType;
  isActive: boolean;
}

export interface FieldDesign {
  id: string;
  fieldId: string;
  labelStyle?: Record<string, string>;
  inputStyle: InputStyleType;
  width: FieldWidthType;
  customWidth?: string;
  height?: string;
  placeholderStyle?: Record<string, string>;
  iconPrefix?: string;
  iconSuffix?: string;
  tooltipStyle?: Record<string, string>;
  errorStyle?: Record<string, string>;
  focusStyle?: Record<string, string>;
  disabledStyle?: Record<string, string>;
  isActive: boolean;
}

export interface ButtonDesign {
  id: string;
  formDefinitionId: string;
  buttonType: ButtonType;
  color?: string;
  size: ButtonSizeType;
  borderRadius?: string;
  alignment: AlignmentType;
  icon?: string;
  hoverEffect: HoverEffectType;
  loadingStyle: LoadingStyleType;
  isActive: boolean;
}

export interface LayoutGrid {
  id: string;
  formDesignId: string;
  fieldId: string;
  columnsTotal: number;
  spanMobile: number;
  spanTablet: number;
  spanDesktop: number;
}

export interface DesignPayload {
  theme: ThemeDefinition;
  formDesign: FormDesign;
  sectionDesigns: Record<string, SectionDesign>;
  fieldDesigns: Record<string, FieldDesign>;
  buttonDesigns: Record<ButtonType, ButtonDesign | undefined>;
  layoutGrid: LayoutGrid[];
}
