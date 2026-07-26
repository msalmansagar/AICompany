// In-CRM replacement for src/hooks/useBarSourceValues.ts.
//
// The portal reads the bar's source record through the backend; inside CRM there is no
// backend, so the record is read directly with Xrm.WebApi — which runs as the signed-in
// user, so field security and record-level permissions apply on their own.
//
// Same contract as the portal hook: null means "no config or nothing selected", and the
// caller falls back to the field-based bar.
import { useEffect, useState } from 'react';
import type { BarSourceConfig } from '@qdb/shared';
import { useFormContext } from '../../src/contexts/FormContext';
import { webApi } from './xrmClient';

export interface BarSourceValues {
  min: number;
  max: number;
  value: number;
}

function readRecordId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

/** A null or unreadable column reads as zero — the bar renders empty rather than breaking. */
function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function useBarSourceValues(
  _fieldId: string,
  config: BarSourceConfig | undefined,
): BarSourceValues | null {
  const { fieldValues } = useFormContext();
  const [values, setValues] = useState<BarSourceValues | null>(null);

  const recordId = config ? readRecordId(fieldValues[config.sourceFieldSchemaName]) : null;

  useEffect(() => {
    if (!config || !recordId) {
      setValues(null);
      return;
    }

    // A selection change mid-flight would otherwise let an older response win.
    let isCurrent = true;

    const attributes = [config.maxAttribute, config.valueAttribute];
    if (config.minAttribute) attributes.push(config.minAttribute);
    const select = [...new Set(attributes)].join(',');

    webApi()
      .retrieveRecord(config.entityLogicalName, recordId.replace(/[{}]/g, ''), `?$select=${select}`)
      .then((record: Record<string, unknown>) => {
        if (!isCurrent) return;
        setValues({
          min: config.minAttribute ? toNumber(record[config.minAttribute]) : 0,
          max: toNumber(record[config.maxAttribute]),
          value: toNumber(record[config.valueAttribute]),
        });
      })
      .catch(() => {
        if (isCurrent) setValues(null);
      });

    return () => { isCurrent = false; };
  }, [recordId, config]);

  return values;
}
