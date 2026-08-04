import { useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { ICrmAdapter } from '@/services/ICrmAdapter';

/**
 * The entity context the Advanced Find builder needs: the target entity's
 * object-type code, its logical name, and the client URL to host the control.
 *
 * `process.recordEntity` is a lookup GUID into the auto-number system-entities
 * table; that record is what carries the object-type code and logical name.
 *
 * Extracted from RoutePropertiesPanel when a second panel — the step's branch
 * condition — needed exactly the same three values.
 */
export interface FetchXmlEntityContext {
  objectTypeCode: number;
  entityLogicalName: string;
  clientUrl: string;
}

export function useFetchXmlEntityContext(adapter: ICrmAdapter): FetchXmlEntityContext {
  const recordEntity = useWorkflowStore((s) => s.process?.recordEntity);
  const [context, setContext] = useState<FetchXmlEntityContext>({
    objectTypeCode: 0,
    entityLogicalName: '',
    clientUrl: '',
  });

  useEffect(() => {
    if (!recordEntity) return;
    const recordEntityId = recordEntity.replace(/[{}]/g, '').toLowerCase();

    adapter
      .getAutoNumberEntities()
      .then((entities) => {
        const entity = entities.find((candidate) => candidate.id === recordEntityId);
        if (!entity) return;
        setContext((previous) => ({
          ...previous,
          objectTypeCode: entity.objectTypeCode,
          entityLogicalName: entity.logicalName,
        }));
      })
      .catch(() => void 0);

    setContext((previous) => ({ ...previous, clientUrl: resolveClientUrl() }));
  }, [recordEntity, adapter]);

  return context;
}

function resolveClientUrl(): string {
  try {
    const xrm = (window as Window & { Xrm?: typeof Xrm }).Xrm;
    return xrm ? xrm.Utility.getGlobalContext().getClientUrl() : window.location.origin;
  } catch {
    return window.location.origin;
  }
}
