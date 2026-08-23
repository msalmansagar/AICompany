// DynamicIcon used to resolve icons through `import('@fluentui/react-icons')` and a computed
// key. Rollup cannot see which exports a computed key touches, so the single-file runtime web
// resource shipped with ZERO icon exports and every icon on every form drew nothing — with no
// console error, because the loader's catch returned a render-null component.
//
// The registry is static so the bundler can see it. These lock in that every icon name the
// org actually stores resolves, including the legacy Fabric names that were never Fluent
// icons and could not have resolved under any scheme.

import { describe, it, expect } from 'vitest';
import { resolveIcon, knownIconNames } from './iconRegistry';

// Every distinct qdb_icon_name present in org5869857f at the time of writing.
const NAMES_IN_ORG_DATA = [
  'Attach', 'BriefcaseRegular', 'CalendarLtr', 'CheckMark', 'CheckboxChecked',
  'CheckmarkCircleRegular', 'Contact', 'DocumentBulletList', 'DocumentRegular', 'Info',
  'LockClosedRegular', 'Money', 'Person', 'PersonRegular', 'Phone', 'Product',
  'ProductList', 'Search', 'Settings',
];

// Names the seed scripts write.
const NAMES_IN_SEEDS = [
  'DismissCircleRegular', 'InfoRegular', 'MailRegular', 'MoneyRegular',
  'PhoneRegular', 'WarningRegular', 'DocumentRegular', 'PersonRegular',
];

describe('resolveIcon', () => {
  it.each(NAMES_IN_ORG_DATA)('resolves %s — a name already stored in the org', name => {
    expect(resolveIcon(name)).not.toBeNull();
  });

  it.each([...new Set(NAMES_IN_SEEDS)])('resolves %s — a name the seeds write', name => {
    expect(resolveIcon(name)).not.toBeNull();
  });

  // The three conventions a maker's free-text entry arrives in.
  it('acceptsTheBareName', () => {
    expect(resolveIcon('Person')).not.toBeNull();
  });

  it('acceptsTheWeightSuffixedName', () => {
    expect(resolveIcon('PersonRegular')).toBe(resolveIcon('Person'));
  });

  it('acceptsASizeSuffixedName', () => {
    expect(resolveIcon('Person24')).toBe(resolveIcon('Person'));
    expect(resolveIcon('Person24Regular')).toBe(resolveIcon('Person'));
  });

  // A legacy Fabric name is not a Fluent icon and never resolved under the old scheme.
  it('mapsALegacyFabricNameOntoItsFluentEquivalent', () => {
    expect(resolveIcon('Contact')).toBe(resolveIcon('Person'));
    expect(resolveIcon('CheckMark')).toBe(resolveIcon('Checkmark'));
  });

  // A maker can type anything; an unknown name must draw nothing, not throw, on a form
  // somebody is trying to fill in.
  it('returnsNullForAnUnknownName', () => {
    expect(resolveIcon('NotARealIconAtAll')).toBeNull();
  });

  it('returnsNullForBlankInput', () => {
    expect(resolveIcon('')).toBeNull();
  });

  it('trimsSurroundingWhitespace', () => {
    expect(resolveIcon('  Person  ')).toBe(resolveIcon('Person'));
  });

  it('exposesItsKnownNames', () => {
    expect(knownIconNames()).toContain('DocumentBulletList');
    expect(knownIconNames().length).toBeGreaterThan(20);
  });
});
