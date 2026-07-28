// DFE-BARSRC-001: the min/max/value behind a bar whose numbers live on a CRM record.
//
// The user's selection in the configured lookup field names the record; the values are
// re-read whenever that selection changes, so the bar tracks the picked customer rather
// than a snapshot taken at form load. Returns null when the field has no bar config, which
// is how the caller falls back to the original field-based bar.
import { useEffect, useState } from 'react';
import type { BarSourceConfig } from '@qdb/shared';
import { useFormContext } from '../contexts/FormContext';

export interface BarSourceValues {
  min: number;
  max: number;
  value: number;
}

/** A lookup selection is stored as { id, displayName }; an API caller may send a bare GUID. */
function readRecordId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

export function useBarSourceValues(
  fieldId: string,
  config: BarSourceConfig | undefined,
): BarSourceValues | null {
  const { formCode, fieldValues } = useFormContext();
  const [values, setValues] = useState<BarSourceValues | null>(null);

  const recordId = config ? readRecordId(fieldValues[config.sourceFieldSchemaName]) : null;

  // Depend on the config's VALUES, not the object. The form definition hands a fresh object
  // on every render, so an object dependency re-fires the effect each time it runs — which
  // sets state, re-renders, and loops until the page freezes.
  const configKey = config
    ? [config.entityLogicalName, config.minAttribute, config.maxAttribute, config.valueAttribute].join('|')
    : null;

  useEffect(() => {
    if (!configKey || !recordId) {
      setValues(null);
      return;
    }

    // A selection change mid-flight would otherwise let an older response win.
    const controller = new AbortController();

    const url = `/api/bar-source/${fieldId}`
      + `?formCode=${encodeURIComponent(formCode)}&recordId=${encodeURIComponent(recordId)}`;

    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.success) setValues(body.data as BarSourceValues);
        else setValues(null);
      })
      .catch(() => {
        // An aborted or failed read leaves the bar empty rather than showing a stale limit.
        if (!controller.signal.aborted) setValues(null);
      });

    return () => controller.abort();
  }, [fieldId, formCode, recordId, configKey]);

  return values;
}
