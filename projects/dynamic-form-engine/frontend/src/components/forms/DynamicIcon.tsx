import { Suspense, lazy, type ComponentType } from 'react';
import type { FluentIconsProps } from '@fluentui/react-icons';

interface DynamicIconProps {
  iconName: string;
  size?: 12 | 16 | 20 | 24 | 28 | 32 | 48;
}

// Fluent react-icons are tree-shakeable named exports.
// We use a dynamic import map so only requested icons are loaded.
// Unknown icon names are silently ignored (no error boundary needed).
function buildIconLoader(
  iconName: string,
  size: number,
): ComponentType<FluentIconsProps> | null {
  try {
    const Icon = lazy(() =>
      import('@fluentui/react-icons').then((mod) => {
        // Resolution order:
        //   1. "PersonRegular20" (name + size)
        //   2. "PersonRegular"   (name as-is — already has Regular/Filled suffix)
        //   3. "Person20Regular" (size-suffixed variant)
        //   4. "PersonRegular"   (bare name + Regular appended)
        const candidates = [
          `${iconName}${size}`,
          iconName,
          `${iconName}${size}Regular`,
          `${iconName}Regular`,
        ] as (keyof typeof mod)[];

        const component = candidates
          .map((k) => mod[k] as ComponentType<FluentIconsProps> | undefined)
          .find(Boolean);

        return { default: component ?? (() => null) };
      }),
    );

    return Icon as ComponentType<FluentIconsProps>;
  } catch {
    return null;
  }
}

export function DynamicIcon({ iconName, size = 16 }: DynamicIconProps) {
  const IconComponent = buildIconLoader(iconName, size);

  if (!IconComponent) return null;

  return (
    <Suspense fallback={null}>
      <IconComponent aria-hidden="true" />
    </Suspense>
  );
}
