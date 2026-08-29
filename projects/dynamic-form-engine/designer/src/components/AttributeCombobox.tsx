import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CrmContext } from '@/app/App';
import { MetadataService } from '@/services/MetadataService';
import type { AttributeMetadata } from '@/services/MetadataService';
import { SearchableCombobox } from './SearchableCombobox';
import type { ComboItem } from './SearchableCombobox';

export interface AttributeComboboxProps {
  /** The entity whose attributes are offered. Empty disables the picker with a hint. */
  entityLogicalName: string;
  value: string;
  onChange: (logicalName: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
}

/**
 * One in-flight-or-done request per entity, shared by every picker on screen.
 *
 * The grid column editor mounts one of these per column, and a ten-column grid asking
 * Dataverse for the same attribute list ten times is the kind of cost that gets a picker
 * reverted to a text box. Failures are evicted so a transient error is retried on the next
 * mount rather than cached forever.
 */
const attributeCache = new Map<string, Promise<AttributeMetadata[]>>();

function loadAttributes(metadata: MetadataService, entity: string): Promise<AttributeMetadata[]> {
  const cached = attributeCache.get(entity);
  if (cached) return cached;

  const request = metadata.getAttributes(entity).catch((error: unknown) => {
    attributeCache.delete(entity);
    throw error;
  });
  attributeCache.set(entity, request);
  return request;
}

/** Test hook — the cache is module state and must not leak between tests. */
export function clearAttributeCache(): void {
  attributeCache.clear();
}

/**
 * Searchable attribute picker for one entity, backed by Dataverse metadata.
 *
 * Every place that stores an attribute logical name previously asked the maker to type it
 * blind ("e.g. qdb_full_name"); a typo passed validation and failed silently at runtime.
 * Free text is still accepted — the combobox stores whatever is typed — so an attribute
 * newer than the loaded metadata is not blocked, but the ordinary path is picking from
 * what the entity actually has.
 */
export function AttributeCombobox({
  entityLogicalName,
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
}: AttributeComboboxProps): React.ReactElement {
  const crmService = useContext(CrmContext);
  const metadata = useMemo(() => (crmService ? new MetadataService(crmService) : null), [crmService]);

  const [attributes, setAttributes] = useState<AttributeMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAttributes([]);
    if (!metadata || !entityLogicalName) return;
    let cancelled = false;
    setLoading(true);
    loadAttributes(metadata, entityLogicalName)
      .then(list => { if (!cancelled) setAttributes(list); })
      .catch(() => { if (!cancelled) setAttributes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metadata, entityLogicalName]);

  const items = useMemo<ComboItem[]>(
    () => attributes.map(a => ({
      value: a.logicalName,
      secondary: a.displayName,
      tertiary: a.attributeType,
    })),
    [attributes],
  );

  const hasEntity = entityLogicalName.length > 0;

  return (
    <SearchableCombobox
      value={value}
      onChange={onChange}
      items={items}
      disabled={disabled || !hasEntity}
      loading={loading}
      placeholder={hasEntity ? (placeholder ?? 'Search or type an attribute') : 'Choose a target entity first'}
      ariaLabel={ariaLabel}
    />
  );
}
