import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CrmContext } from '@/app/App';
import { MetadataService } from '@/services/MetadataService';
import type { EntityMetadata } from '@/services/MetadataService';
import { SearchableCombobox } from './SearchableCombobox';
import { buildEntityItems } from '@/constants/entityMetadata';

export interface EntityComboboxProps {
  value: string;
  onChange: (logicalName: string) => void;
  /** The form's own entity — surfaced at the top of the list. */
  preferredEntity?: string;
  /** Pre-loaded entity list. When omitted, the component fetches its own. */
  entities?: EntityMetadata[];
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Searchable Target CRM Entity picker backed by Dataverse metadata, with
 * first-party/system tables excluded. Self-loads the entity list unless the
 * caller passes a shared `entities` array (avoids refetching when many pickers
 * appear on one screen).
 */
export function EntityCombobox({
  value,
  onChange,
  preferredEntity,
  entities: providedEntities,
  disabled,
  placeholder,
  ariaLabel,
}: EntityComboboxProps): React.ReactElement {
  const crmService = useContext(CrmContext);
  const metadata = useMemo(() => (crmService ? new MetadataService(crmService) : null), [crmService]);
  const selfLoad = providedEntities === undefined;

  const [loaded, setLoaded] = useState<EntityMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selfLoad || !metadata) return;
    let cancelled = false;
    setLoading(true);
    metadata
      .getEntities()
      .then(list => { if (!cancelled) setLoaded(list); })
      .catch(() => { if (!cancelled) setLoaded([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selfLoad, metadata]);

  const items = useMemo(
    () => buildEntityItems(providedEntities ?? loaded, preferredEntity ?? ''),
    [providedEntities, loaded, preferredEntity],
  );

  return (
    <SearchableCombobox
      value={value}
      onChange={onChange}
      items={items}
      disabled={disabled}
      loading={selfLoad && loading}
      placeholder={placeholder ?? 'Search or type an entity (e.g. contact)'}
      ariaLabel={ariaLabel ?? 'Target CRM Entity'}
    />
  );
}
