import { resolveIcon } from './iconRegistry';

interface DynamicIconProps {
  iconName: string;
  size?: 12 | 16 | 20 | 24 | 28 | 32 | 48;
}

/**
 * Draws a maker-configured Fluent icon by name.
 *
 * Resolution goes through a static registry rather than a dynamic import. The previous
 * implementation did `import('@fluentui/react-icons').then(mod => mod[computedName])`, which
 * Rollup cannot analyse — the single-file runtime web resource shipped containing no icon
 * exports at all, and every icon on every form silently rendered nothing. The failure was
 * invisible: the loader's catch returned a component that renders null, so there was no
 * console error and no broken-image glyph, just empty space where an icon should be.
 *
 * The registry stores one size and this scales it, so a name is valid at every size a caller
 * asks for. Under the old scheme a perfectly valid name drew nothing at a size that icon did
 * not happen to ship — the size was part of the lookup key.
 */
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
