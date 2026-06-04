/**
 * FieldSelectorPopup.tsx
 * Anchored popup that shows entity attributes, N:1 lookups, and 1:N children.
 * Supports keyboard navigation (↑↓ move, → drill-in, ← drill-out, Enter insert, Esc close).
 * Lazy-loads metadata for each entity level.
 */

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MetadataService } from '../services/MetadataService';
import { useMetadata } from '../hooks/useMetadata';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { AttributeMetadata, ManyToOneRelationship, OneToManyRelationship } from '../types/Metadata';
import { PopupMode } from '../types/EditorProps';

export interface FieldSelectorPopupProps {
  readonly anchor: { readonly x: number; readonly y: number };
  readonly entityPath: readonly string[];
  readonly metadataService: MetadataService;
  readonly mode: PopupMode;
  readonly maxDepth: number;
  readonly onDrillDown: (entityLogicalName: string) => void;
  readonly onDrillUp: () => void;
  readonly onSelect: (tokenSource: string) => void;
  readonly onClose: () => void;
}

type RowKind = 'attribute' | 'manyToOne' | 'oneToMany';

interface PopupRow {
  readonly kind: RowKind;
  readonly logicalName: string;
  readonly displayName: string;
  readonly typeLabel: string;
  readonly navigationTarget?: string;
}

function getDisplayName(
  obj: AttributeMetadata | ManyToOneRelationship | OneToManyRelationship
): string {
  if ('DisplayName' in obj && obj.DisplayName?.UserLocalizedLabel?.Label) {
    return obj.DisplayName.UserLocalizedLabel.Label;
  }
  if ('SchemaName' in obj) return obj.SchemaName;
  return '';
}

export const FieldSelectorPopup: React.FC<FieldSelectorPopupProps> = (props) => {
  const { anchor, entityPath, metadataService, mode, maxDepth, onDrillDown, onDrillUp, onSelect, onClose } = props;

  const currentEntity = entityPath[entityPath.length - 1] ?? '';
  const { bundle, loading, error } = useMetadata(currentEntity, metadataService);
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement | null>(null);

  // Reset filter when entity changes
  useEffect(() => { setFilter(''); }, [currentEntity]);

  // Focus the filter input when popup opens
  useEffect(() => { filterRef.current?.focus(); }, []);

  const rows: readonly PopupRow[] = useMemo(() => {
    if (!bundle) return [];

    const result: PopupRow[] = [];
    const needle = filter.trim().toLowerCase();

    const matches = (displayName: string, logicalName: string) =>
      !needle ||
      displayName.toLowerCase().includes(needle) ||
      logicalName.toLowerCase().includes(needle);

    // Attributes (skip in "each" mode — each is for collections only)
    if (mode !== 'each') {
      for (const attr of bundle.attributes) {
        const dn = getDisplayName(attr);
        if (matches(dn, attr.LogicalName)) {
          result.push({
            kind: 'attribute',
            logicalName: attr.LogicalName,
            displayName: dn || attr.LogicalName,
            typeLabel: attr.AttributeType
          });
        }
      }

      // N:1 (parent lookups — drill into them for nested paths)
      for (const rel of bundle.manyToOne) {
        const dn = rel.ReferencingEntityNavigationPropertyName;
        if (matches(dn, rel.ReferencingAttribute)) {
          result.push({
            kind: 'manyToOne',
            logicalName: rel.ReferencingAttribute,
            displayName: dn,
            typeLabel: `→ ${rel.ReferencedEntity}`,
            navigationTarget: rel.ReferencedEntity
          });
        }
      }
    }

    // 1:N (child collections — primary for #each mode)
    for (const rel of bundle.oneToMany) {
      const dn = rel.ReferencedEntityNavigationPropertyName;
      if (matches(dn, rel.ReferencingEntity)) {
        result.push({
          kind: 'oneToMany',
          logicalName: rel.ReferencedEntityNavigationPropertyName,
          displayName: dn,
          typeLabel: `1:N → ${rel.ReferencingEntity}`,
          navigationTarget: rel.ReferencingEntity
        });
      }
    }

    return result;
  }, [bundle, filter, mode]);

  const buildToken = (row: PopupRow): string => {
    // Build the full path: skip root entity label, concat remaining segments
    const pathSegments = entityPath.slice(1).concat(row.logicalName);
    const path = pathSegments.join('.');

    if (row.kind === 'oneToMany') {
      return `{{#each ${path}}}\n\n{{/each}}`;
    }
    if (row.kind === 'manyToOne') {
      return `{{${path} | display}}`;
    }
    return `{{${path}}}`;
  };

  const canDrillIn = (row: PopupRow): boolean =>
    !!row.navigationTarget && entityPath.length < maxDepth;

  const { selectedIndex, setSelectedIndex, handleKeyDown } = useKeyboardNav<PopupRow>({
    items: rows,
    onSelect: (row) => onSelect(buildToken(row)),
    onDrillIn: (row) => { if (row.navigationTarget) onDrillDown(row.navigationTarget); },
    onDrillOut: onDrillUp,
    onClose,
    canDrillIn
  });

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    left: anchor.x,
    top: anchor.y,
    zIndex: 9999,
    width: '340px',
    maxHeight: '360px',
    overflowY: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #c8c6c4',
    borderRadius: '2px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: '13px'
  };

  const headerStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderBottom: '1px solid #edebe9',
    backgroundColor: '#f3f2f1'
  };

  const breadcrumbStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#605e5c',
    marginBottom: '4px'
  };

  const rowBaseStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f2f1',
    color: '#323130'
  };

  const typeLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#605e5c',
    marginLeft: '8px',
    whiteSpace: 'nowrap'
  };

  return (
    <div
      role="listbox"
      aria-label="Field selector"
      style={popupStyle}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div style={headerStyle}>
        {entityPath.length > 1 && (
          <div style={breadcrumbStyle}>
            {entityPath.join(' › ')}
          </div>
        )}
        <input
          ref={filterRef}
          type="text"
          placeholder="Search fields…"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setSelectedIndex(0); }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            border: '1px solid #c8c6c4',
            borderRadius: '2px',
            padding: '3px 6px',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
          aria-label="Filter fields"
        />
      </div>

      {loading && (
        <div style={{ padding: '10px', color: '#605e5c' }}>Loading metadata…</div>
      )}

      {error && (
        <div style={{ padding: '10px', color: '#a4262c' }}>
          Failed to load metadata. Check console for details.
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: '10px', color: '#605e5c' }}>No fields match.</div>
      )}

      {!loading && !error && rows.map((row, i) => {
        const isSelected = i === selectedIndex;
        return (
          <div
            key={`${row.kind}:${row.logicalName}`}
            role="option"
            aria-selected={isSelected}
            style={{
              ...rowBaseStyle,
              backgroundColor: isSelected ? '#deecf9' : 'transparent'
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => onSelect(buildToken(row))}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.displayName}
              {canDrillIn(row) && <span style={{ marginLeft: '4px', color: '#0078d4' }}>›</span>}
            </span>
            <span style={typeLabelStyle}>{row.typeLabel}</span>
          </div>
        );
      })}
    </div>
  );
};
