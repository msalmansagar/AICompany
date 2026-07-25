import type { ComboItem } from '@/components/SearchableCombobox';
import type { EntityMetadata } from '@/services/MetadataService';

// First-party Microsoft app / system tables (Marketing, Field Service, Portals,
// cloud flows, scheduling) are never valid submission targets — hide them from
// the entity picker. Matched as name prefixes, so whole families are excluded.
export const EXCLUDED_ENTITY_PREFIXES = [
  'msdyn_',
  'msdyncrm_',
  'msdynmkt_',
  'adx_',
  'mspp_',
  'flow',
  'bookableresource',
];

export function isExcludedEntity(logicalName: string): boolean {
  return EXCLUDED_ENTITY_PREFIXES.some(prefix => logicalName.startsWith(prefix));
}

/**
 * Filters out excluded tables and surfaces the most likely targets first: the
 * preferred (form's own) entity, then custom (qdb_) tables, then other
 * publisher tables, then system tables — each group sorted alphabetically.
 */
export function buildEntityItems(entities: EntityMetadata[], preferred = ''): ComboItem[] {
  const rank = (logicalName: string): number => {
    if (logicalName === preferred) return 0;
    if (logicalName.startsWith('qdb_')) return 1;
    if (logicalName.includes('_')) return 2;
    return 3;
  };
  return entities
    .filter(entity => !isExcludedEntity(entity.logicalName))
    .sort((a, b) => rank(a.logicalName) - rank(b.logicalName) || a.logicalName.localeCompare(b.logicalName))
    .map(entity => ({ value: entity.logicalName, secondary: entity.displayName }));
}
