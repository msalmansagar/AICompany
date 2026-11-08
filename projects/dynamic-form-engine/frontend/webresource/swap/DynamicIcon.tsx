// In-CRM DynamicIcon. The build swaps this in for the portal component (see
// inCrmModuleSwap in vite.webresource.config.ts) because the single-file web resource
// inlines everything it references.
//
// It used to carry its own hand-written list of 25 icon names, which drifted from what
// makers actually store: of the 19 distinct qdb_icon_name values in org5869857f, TEN did
// not resolve here — CalendarLtr, CheckMark, CheckboxChecked, Contact, DocumentBulletList,
// LockClosed, Phone, Product, ProductList and Search all silently drew nothing, because
// this list only ever matched an exact name or name + "Regular".
//
// The list now lives in one place, iconRegistry, shared with the portal component. Only the
// rendering differs, and only because this file must not import anything whose path ends in
// DynamicIcon — the swap rule would resolve that back to this file.
import { resolveIcon } from '../../src/components/forms/iconRegistry';

interface DynamicIconProps {
  iconName: string;
  size?: number;
}

export function DynamicIcon({ iconName, size = 16 }: DynamicIconProps) {
  const Icon = resolveIcon(iconName);

  if (!Icon) return null;

  return (
    <Icon
      aria-hidden="true"
      style={{ width: `${size}px`, height: `${size}px`, fontSize: `${size}px` }}
    />
  );
}
