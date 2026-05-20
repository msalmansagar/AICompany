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
  // The iconName is expected in the format the backend stores it, e.g. "CalendarRegular"
  // We wrap the lazy import in a try/catch via the component boundary.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const Icon = lazy(() =>
      import('@fluentui/react-icons').then((mod) => {
        const key = `${iconName}${size}` as keyof typeof mod;
        const component = (mod[key] ?? mod[iconName as keyof typeof mod]) as
          | ComponentType<FluentIconsProps>
          | undefined;

        if (!component) {
          return { default: () => null };
        }

        return { default: component };
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
