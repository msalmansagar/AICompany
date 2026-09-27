import { useState, type ReactNode } from 'react';
import { readLayout, writeLayout, type ListLayout } from '../data/layoutPreference.js';

/**
 * Split and Grid, for every V1 list — the same two layouts Workspace V2 offers, on V1's own
 * vocabulary (user instruction, 2026-09-27: both workspaces the same, on every list).
 *
 * **Split** shows the rows beside a preview of the chosen one; **Grid** lays every column out and a
 * row opens its record directly. Switching changes the renderer and nothing else: the query, the
 * paging and the source are untouched, so the two layouts can never list different populations.
 * The choice is remembered per list in this browser, as V2 remembers its own.
 */

export type { ListLayout };

export function useListLayout(storageKey: string): [ListLayout, (next: ListLayout) => void] {
  const [layout, setLayout] = useState<ListLayout>(() => readLayout(storageKey));
  const choose = (next: ListLayout) => { setLayout(next); writeLayout(storageKey, next); };
  return [layout, choose];
}

/** The Split / Grid control. One is always pressed. */
export function LayoutSwitch({ layout, onChange, testId }: {
  layout: ListLayout;
  onChange: (next: ListLayout) => void;
  testId: string;
}) {
  return (
    <div className="layout-switch" role="group" aria-label="Layout" data-testid={testId}>
      {(['split', 'grid'] as const).map(option => (
        <button
          key={option} type="button" aria-pressed={layout === option}
          className={layout === option ? 'chip sel' : 'chip'}
          data-testid={`${testId}-${option}`} onClick={() => onChange(option)}
        >
          {option === 'split' ? 'Split' : 'Grid'}
        </button>
      ))}
    </div>
  );
}

/** A list's toolbar: its filters on the left, the layout control on the right. */
export function ListToolbar({ children, layout, onChangeLayout, testId }: {
  children?: ReactNode;
  layout: ListLayout;
  onChangeLayout: (next: ListLayout) => void;
  testId: string;
}) {
  return (
    <div className="list-toolbar" data-testid={testId}>
      <div className="list-toolbar-filters">{children}</div>
      <LayoutSwitch layout={layout} onChange={onChangeLayout} testId={`${testId}-layout`} />
    </div>
  );
}

/** The rows on the left, the chosen row's preview on the right. */
export function SplitLayout({ list, preview, testId }: { list: ReactNode; preview: ReactNode; testId: string }) {
  return (
    <div className="split-layout" data-testid={testId}>
      <div className="split-list">{list}</div>
      <aside className="split-preview" aria-label="Preview">{preview}</aside>
    </div>
  );
}
