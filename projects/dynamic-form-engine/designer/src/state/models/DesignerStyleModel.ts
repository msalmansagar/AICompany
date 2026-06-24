export type LabelPosition = 'above' | 'beside';
export type ButtonStyle = 'filled' | 'outline' | 'subtle';
export type NavStyle = 'tabs' | 'stepper' | 'accordion' | 'sidebar';

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
