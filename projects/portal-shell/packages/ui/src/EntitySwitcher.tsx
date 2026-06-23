'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Text,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { BuildingRegular, ChevronDownRegular } from '@fluentui/react-icons';
import type { LinkedEntity } from '@portal/types';

interface EntitySwitcherProps {
  activeEntity: LinkedEntity | null;
  onEntitySelect: (entity: LinkedEntity) => void;
  noEntitiesLabel?: string;
  selectLabel?: string;
}

const useStyles = makeStyles({
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    maxWidth: '200px',
  },
  entityName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    paddingInline: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground3,
  },
});

async function fetchLinkedEntities(): Promise<LinkedEntity[]> {
  const response = await fetch('/api/entities');
  if (!response.ok) {
    throw new Error('Failed to fetch linked entities');
  }
  const data = (await response.json()) as { items: LinkedEntity[] };
  return data.items;
}

export function EntitySwitcher({
  activeEntity,
  onEntitySelect,
  noEntitiesLabel = 'No organisations found',
  selectLabel = 'Select an organisation',
}: EntitySwitcherProps) {
  const styles = useStyles();

  const { data: entities, isLoading } = useQuery({
    queryKey: ['entities'],
    queryFn: fetchLinkedEntities,
    staleTime: 300_000,
  });

  return (
    <Menu>
      <MenuButton
        appearance="subtle"
        icon={<BuildingRegular />}
        aria-label={selectLabel}
        className={styles.button}
      >
        <span className={styles.entityName}>
          {isLoading ? (
            <Spinner size="tiny" />
          ) : (
            activeEntity?.name ?? selectLabel
          )}
        </span>
        <ChevronDownRegular />
      </MenuButton>

      <MenuList>
        {!isLoading && (!entities || entities.length === 0) && (
          <div className={styles.emptyState}>
            <Text size={200}>{noEntitiesLabel}</Text>
          </div>
        )}
        {entities?.map((entity) => (
          <MenuItem
            key={entity.id}
            onClick={() => onEntitySelect(entity)}
            aria-current={entity.id === activeEntity?.id ? 'true' : undefined}
          >
            {entity.name}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
}
