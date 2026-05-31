import type { ComponentType } from 'react';
import type { ControlProps } from '../components/forms/FieldRenderer';

class ComponentRegistryService {
  private readonly components = new Map<string, ComponentType<ControlProps>>();

  register(key: string, component: ComponentType<ControlProps>): void {
    this.components.set(key, component);
  }

  resolve(key: string): ComponentType<ControlProps> | null {
    return this.components.get(key) ?? null;
  }

  isRegistered(key: string): boolean {
    return this.components.has(key);
  }

  listKeys(): string[] {
    return Array.from(this.components.keys());
  }
}

export const ComponentRegistry = new ComponentRegistryService();
