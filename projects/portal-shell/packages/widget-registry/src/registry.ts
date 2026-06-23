import type { WidgetConfig, WidgetDefinition } from './types';

/**
 * Module-level singleton registry.
 *
 * In Next.js App Router dev mode, module-level state is per-worker.
 * Widgets must self-register at module import time — not lazily — so that
 * every worker thread has a populated registry.
 *
 * Stabilised via globalThis cache to survive HMR in development.
 */
function getRegistry(): Map<string, WidgetDefinition> {
  const globalKey = '__portalWidgetRegistry__';
  if (!(globalKey in globalThis)) {
    (globalThis as Record<string, unknown>)[globalKey] = new Map<string, WidgetDefinition>();
  }
  return (globalThis as Record<string, unknown>)[globalKey] as Map<string, WidgetDefinition>;
}

/**
 * Registers a widget definition in the global registry.
 *
 * @throws {Error} when a widget with the same name is already registered
 *   (guards against accidental double-import; HMR-safe via globalThis cache).
 */
export function registerWidget<TConfig extends WidgetConfig>(
  definition: WidgetDefinition<TConfig>
): void {
  const registry = getRegistry();
  if (registry.has(definition.name)) {
    // In development HMR, this is expected — swallow to prevent noise.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Widget already registered: "${definition.name}". Each widget name must be unique.`
      );
    }
    return;
  }
  registry.set(definition.name, definition as unknown as WidgetDefinition);
}

/**
 * Resolves a widget definition by its machine-readable name.
 * Returns undefined when the name is not registered.
 */
export function resolveWidget(name: string): WidgetDefinition | undefined {
  return getRegistry().get(name);
}

/**
 * Returns all currently registered widget definitions in insertion order.
 */
export function listRegisteredWidgets(): WidgetDefinition[] {
  return Array.from(getRegistry().values());
}

/**
 * Removes all registered widgets. Intended for test isolation only.
 * Not for production use.
 */
export function clearRegistry(): void {
  getRegistry().clear();
}
