import type { ComponentType } from 'react';
import type { FluentIconsProps } from '@fluentui/react-icons';
import {
  AppsList24Regular,
  Attach24Regular,
  Box24Regular,
  Briefcase24Regular,
  BuildingBank24Regular,
  CalendarLtr24Regular,
  Checkmark24Regular,
  CheckmarkCircle24Regular,
  CheckboxChecked24Regular,
  Clock24Regular,
  Delete24Regular,
  DismissCircle24Regular,
  Document24Regular,
  DocumentBulletList24Regular,
  Edit24Regular,
  ErrorCircle24Regular,
  Globe24Regular,
  Home24Regular,
  Info24Regular,
  Link24Regular,
  Location24Regular,
  LockClosed24Regular,
  Mail24Regular,
  Money24Regular,
  Person24Regular,
  Phone24Regular,
  Search24Regular,
  Settings24Regular,
  Star24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';

/**
 * The icons the runtime can draw, keyed by every name a maker might have stored.
 *
 * This exists because the previous approach could not work in a bundle. DynamicIcon did
 * `import('@fluentui/react-icons').then(mod => mod[computedName])`, and Rollup cannot see
 * which exports a computed key touches — so the single-file runtime web resource shipped
 * with ZERO icon exports in it and every icon on every form silently rendered nothing.
 * A static map is analysable, so exactly these icons ship and they actually appear.
 *
 * Names are stored free-text by makers and arrive in three conventions, all of which are
 * accepted here:
 *   - Fluent v9 bare      "Person"
 *   - Fluent v9 suffixed  "PersonRegular"
 *   - legacy Fabric       "Contact", "CheckMark", "ProductList"
 * The legacy names are not Fluent icons at all and would never have resolved; they are
 * mapped onto their nearest v9 equivalent rather than left broken.
 *
 * One size is imported and scaled at render time. Importing 16/20/24 of each would triple
 * the icon payload for a difference the eye does not register at these sizes.
 */
const ICONS: Record<string, ComponentType<FluentIconsProps>> = {
  AppsList: AppsList24Regular,
  Attach: Attach24Regular,
  Box: Box24Regular,
  Briefcase: Briefcase24Regular,
  BuildingBank: BuildingBank24Regular,
  CalendarLtr: CalendarLtr24Regular,
  Checkbox: CheckboxChecked24Regular,
  CheckboxChecked: CheckboxChecked24Regular,
  Checkmark: Checkmark24Regular,
  CheckmarkCircle: CheckmarkCircle24Regular,
  Clock: Clock24Regular,
  Delete: Delete24Regular,
  DismissCircle: DismissCircle24Regular,
  Document: Document24Regular,
  DocumentBulletList: DocumentBulletList24Regular,
  Edit: Edit24Regular,
  ErrorCircle: ErrorCircle24Regular,
  Globe: Globe24Regular,
  Home: Home24Regular,
  Info: Info24Regular,
  Link: Link24Regular,
  Location: Location24Regular,
  LockClosed: LockClosed24Regular,
  Mail: Mail24Regular,
  Money: Money24Regular,
  Person: Person24Regular,
  Phone: Phone24Regular,
  Search: Search24Regular,
  Settings: Settings24Regular,
  Star: Star24Regular,
  Warning: Warning24Regular,
};

/** Legacy Fabric names found in existing org data, mapped to their v9 equivalent. */
const LEGACY_ALIASES: Record<string, string> = {
  CheckMark: 'Checkmark',
  Contact: 'Person',
  Product: 'Box',
  ProductList: 'AppsList',
  Bank: 'BuildingBank',
  Calendar: 'CalendarLtr',
  Error: 'ErrorCircle',
  Cancel: 'DismissCircle',
};

/** Trailing weight suffixes Fluent uses; stripped so "PersonRegular" finds "Person". */
const WEIGHT_SUFFIXES = ['Regular', 'Filled', 'Color'];

/** Trailing pixel sizes, so "Person24" and "Person24Regular" both resolve. */
const SIZE_PATTERN = /\d{2}$/;

/**
 * Resolves a maker-supplied icon name to a component, or null when nothing matches.
 *
 * Null is a real answer: a maker can type anything, and an unknown name draws nothing
 * rather than throwing on a form a user is trying to fill in.
 */
export function resolveIcon(iconName: string): ComponentType<FluentIconsProps> | null {
  if (!iconName) return null;

  let name = iconName.trim();
  for (const suffix of WEIGHT_SUFFIXES) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  name = name.replace(SIZE_PATTERN, '');

  return ICONS[name] ?? ICONS[LEGACY_ALIASES[name] ?? ''] ?? null;
}

/** Every name the registry answers to — used by the tests and available to an icon picker. */
export function knownIconNames(): string[] {
  return [...Object.keys(ICONS), ...Object.keys(LEGACY_ALIASES)].sort();
}
