/**
 * useMetadata.ts
 * React hook that wraps MetadataService for use in components.
 * Handles loading state and errors so components stay clean.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MetadataService } from '../services/MetadataService';
import {
  AttributeMetadata,
  ManyToOneRelationship,
  OneToManyRelationship
} from '../types/Metadata';

export interface EntityMetadataBundle {
  readonly attributes: readonly AttributeMetadata[];
  readonly oneToMany: readonly OneToManyRelationship[];
  readonly manyToOne: readonly ManyToOneRelationship[];
}

export interface UseMetadataResult {
  readonly bundle: EntityMetadataBundle | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export function useMetadata(
  entityLogicalName: string | null,
  service: MetadataService
): UseMetadataResult {
  const [bundle, setBundle] = useState<EntityMetadataBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const load = useCallback(
    async (logicalName: string) => {
      cancelRef.current = false;
      setLoading(true);
      setError(null);
      setBundle(null);

      try {
        const [attributes, oneToMany, manyToOne] = await Promise.all([
          service.getAttributes(logicalName),
          service.getOneToMany(logicalName),
          service.getManyToOne(logicalName)
        ]);

        if (!cancelRef.current) {
          setBundle({ attributes, oneToMany, manyToOne });
        }
      } catch (err) {
        if (!cancelRef.current) {
          setError(err instanceof Error ? err.message : 'metadata_load_failed');
        }
      } finally {
        if (!cancelRef.current) {
          setLoading(false);
        }
      }
    },
    [service]
  );

  useEffect(() => {
    if (!entityLogicalName) return;
    load(entityLogicalName);
    return () => { cancelRef.current = true; };
  }, [entityLogicalName, load]);

  return { bundle, loading, error };
}
