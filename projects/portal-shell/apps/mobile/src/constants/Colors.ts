// Brand color tokens — mirrors portalConfig defaults from packages/types/src/portal-config.ts

export const Colors = {
  // Primary brand blue (Microsoft fluent blue)
  primary: '#0078D4',
  primaryDark: '#005A9E',
  primaryLight: '#C7E0F4',

  // Semantic colors
  success: '#107C10',
  successLight: '#DFF6DD',
  warning: '#F7630C',
  warningLight: '#FDEECE',
  error: '#D13438',
  errorLight: '#FDE7E9',
  info: '#0078D4',
  infoLight: '#C7E0F4',

  // Neutral palette
  white: '#FFFFFF',
  black: '#000000',
  grey10: '#FAF9F8',
  grey20: '#F3F2F1',
  grey30: '#EDEBE9',
  grey40: '#E1DFDD',
  grey50: '#D2D0CE',
  grey60: '#C8C6C4',
  grey70: '#B3B0AD',
  grey80: '#979593',
  grey90: '#797775',
  grey100: '#605E5C',
  grey110: '#484644',
  grey120: '#323130',
  grey130: '#201F1E',

  // Text
  textPrimary: '#201F1E',
  textSecondary: '#605E5C',
  textDisabled: '#A19F9D',
  textInverse: '#FFFFFF',
  textLink: '#0078D4',

  // Backgrounds
  background: '#F3F2F1',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  // Borders
  border: '#EDEBE9',
  borderStrong: '#C8C6C4',

  // Request status colors
  statusSubmitted: '#0078D4',
  statusUnderReview: '#F7630C',
  statusApproved: '#107C10',
  statusRejected: '#D13438',
  statusPendingDocs: '#8764B8',
} as const;

export type ColorKey = keyof typeof Colors;
