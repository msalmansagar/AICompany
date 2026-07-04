/**
 * @deprecated Use DesignPayload from @qdb/shared instead. See FR-099–101.
 * This model is retained for backward compatibility during the DFE-STYLE-001 migration.
 * All new code should import from '@qdb/shared'.
 */
export type LabelPosition = 'above' | 'beside';

/**
 * @deprecated Use ButtonStyleType from '@qdb/shared' instead.
 */
export type ButtonStyle = 'filled' | 'outline' | 'subtle';

/**
 * @deprecated Use TabStyleType from '@qdb/shared' instead.
 */
export type NavStyle = 'tabs' | 'stepper' | 'accordion' | 'sidebar';

/**
 * @deprecated Use DesignPayload from '@qdb/shared' instead. See FR-099–101.
 * Preserved for legacy use in VersionService snapshot deserialization and PreviewScreen
 * compatibility adapter until those are fully migrated.
 */
export interface DesignerStyleModel {
  themeId: string | null;
  themeName: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  fontSizeBase: number;
  borderRadius: number;
  fieldSpacing: number;
  labelPosition: LabelPosition;
  buttonStyle: ButtonStyle;
  navStyle?: NavStyle;
  customCss: string;
}

/**
 * @deprecated Use DEFAULT_DESIGN_PAYLOAD from '@/state/designerStore' instead.
 */
export const DEFAULT_STYLE: DesignerStyleModel = {
  themeId: null,
  themeName: 'Default',
  primaryColor: '#0078d4',
  accentColor: '#005a9e',
  backgroundColor: '#ffffff',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  fontSizeBase: 14,
  borderRadius: 4,
  fieldSpacing: 16,
  labelPosition: 'above',
  buttonStyle: 'filled',
  navStyle: 'tabs',
  customCss: '',
};
