import type React from 'react';
import type { Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';

export interface CustomFieldProps {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

type CustomFieldComponent = React.ComponentType<CustomFieldProps>;

const registry = new Map<string, CustomFieldComponent>();

export const ComponentRegistry = {
  register(key: string, component: CustomFieldComponent): void {
    registry.set(key, component);
  },
  resolve(key: string): CustomFieldComponent | null {
    return registry.get(key) ?? null;
  },
};
