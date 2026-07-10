// Visual diff renderer for DFE-ENH-001 (Workstream H).
//
// ADR-003: BUILD custom FormDiffViewer chosen over jsondiffpatch HTML formatter
// (dangerouslySetInnerHTML; inactive since Dec 2023) and react-diff-viewer-continued
// (< 1,000 stars). At ~120 lines over microdiff output, this fits naturally inside
// the Fluent UI v9 design system with no additional npm dependencies.
//
// Consumed by FR-001 ConflictResolutionDialog ("Review what changed" path)
// and FR-004 version diff panel (Phase 2).

import { useMemo, type ReactElement } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Text,
} from '@fluentui/react-components';
import { diffForms } from '@/services/FormDiffService';
import type { FormChange, FormChangeKind } from '@/services/FormDiffService';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Props for FormDiffViewer. */
export interface FormDiffViewerProps {
  /** The earlier snapshot (local unsaved state or older version). */
  before: object;
  /** The later snapshot (server version or newer version). */
  after: object;
  /**
   * Optional: convert a change path (string segments) to a human-readable label.
   * Numeric indices are pre-converted to strings before the call.
   * Defaults to joining path segments with " → ".
   */
  labelResolver?: (path: string[]) => string;
}

// ─── Style constants ──────────────────────────────────────────────────────────

type BadgeColor = 'success' | 'danger' | 'warning';

const KIND_TO_BADGE_COLOR: Record<FormChangeKind, BadgeColor> = {
  CREATE: 'success',
  REMOVE: 'danger',
  UPDATE: 'warning',
};

const KIND_TO_SYMBOL: Record<FormChangeKind, string> = {
  CREATE: '+',
  REMOVE: '−',
  UPDATE: '~',
};

// Fluent UI v9 CSS custom properties for semantic text colours.
const COLOR_BEFORE = 'var(--colorPaletteRedForeground1)';
const COLOR_AFTER  = 'var(--colorPaletteGreenForeground1)';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function groupChangesByArea(changes: FormChange[]): Map<string, FormChange[]> {
  return changes.reduce((map, change) => {
    const bucket = map.get(change.area) ?? [];
    bucket.push(change);
    map.set(change.area, bucket);
    return map;
  }, new Map<string, FormChange[]>());
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return '(empty)';
  if (typeof value === 'string') return `"${value}"`;
  return JSON.stringify(value);
}

function defaultLabelResolver(path: (string | number)[]): string {
  return path.map(String).join(' → ');
}

function buildChangeKey(change: FormChange, idx: number): string {
  return `${change.path.map(String).join('.')}-${idx}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ChangeRowProps {
  change: FormChange;
  resolvedLabel: string;
}

function ChangeRow({ change, resolvedLabel }: ChangeRowProps): ReactElement {
  const badgeColor = KIND_TO_BADGE_COLOR[change.kind];
  const symbol = KIND_TO_SYMBOL[change.kind];

  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0 4px 4px', alignItems: 'flex-start' }}>
      <Badge appearance="filled" color={badgeColor} size="small" aria-label={change.kind}>
        {symbol}
      </Badge>
      <div>
        <Text size={200} weight="semibold">{resolvedLabel}</Text>
        {change.kind !== 'CREATE' && (
          <div style={{ color: COLOR_BEFORE }}>
            <Text size={200}>Before: {stringifyValue(change.oldValue)}</Text>
          </div>
        )}
        {change.kind !== 'REMOVE' && (
          <div style={{ color: COLOR_AFTER }}>
            <Text size={200}>After: {stringifyValue(change.newValue)}</Text>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Renders a structured before/after diff grouped by top-level area.
 *
 * Groups changes under collapsible Accordion sections — one per top-level key
 * in the compared objects (e.g. "fields", "rules", "theme", "translations").
 * Each change shows a colour-coded badge (+ green / − red / ~ amber) with old
 * and new values.
 *
 * All sections are expanded by default so reviewers see the full diff without
 * interaction (collapsible via prop, matching Fluent UI Accordion behaviour).
 */
export function FormDiffViewer({ before, after, labelResolver }: FormDiffViewerProps): ReactElement {
  const changes = useMemo(() => diffForms(before, after), [before, after]);
  const grouped = useMemo(() => groupChangesByArea(changes), [changes]);

  if (changes.length === 0) {
    return <Text>No changes detected between the two versions.</Text>;
  }

  const areas = useMemo(() => Array.from(grouped.keys()), [grouped]);

  function resolveLabel(change: FormChange): string {
    const stringPath = change.path.map(String);
    return labelResolver ? labelResolver(stringPath) : defaultLabelResolver(change.path);
  }

  return (
    <Accordion multiple collapsible defaultOpenItems={areas}>
      {Array.from(grouped.entries()).map(([area, areaChanges]) => (
        <AccordionItem key={area} value={area}>
          <AccordionHeader>
            <Text weight="semibold">{area}</Text>
            {' '}
            <Badge appearance="outline" size="small">{areaChanges.length}</Badge>
          </AccordionHeader>
          <AccordionPanel>
            {areaChanges.map((change, idx) => (
              <ChangeRow
                key={buildChangeKey(change, idx)}
                change={change}
                resolvedLabel={resolveLabel(change)}
              />
            ))}
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
