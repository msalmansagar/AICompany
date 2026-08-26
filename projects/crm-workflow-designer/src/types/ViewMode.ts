/**
 * 'technical-new' keeps its id so stored view preferences and any deep link
 * still resolve; the old 'technical' canvas it replaced is gone.
 */
export type ViewMode = 'executive' | 'business' | 'technical-new' | 'swimlane' | 'hierarchy';

export interface ViewModeMeta {
  id: ViewMode;
  label: string;
  description: string;
}

export const VIEW_MODES: ViewModeMeta[] = [
  {
    id: 'executive',
    label: 'Executive',
    description: 'Clean happy-path view for management',
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Main flow with grouped outcomes',
  },
  {
    id: 'technical-new',
    label: 'Technical',
    description: 'Full detail — schema, tasks, assignments, colour-coded paths',
  },
  {
    id: 'swimlane',
    label: 'Swimlane',
    description: 'Steps grouped by role or team',
  },
  {
    id: 'hierarchy',
    label: 'Hierarchy',
    description: 'Org-chart drilldown — collapse and expand the flow level by level',
  },
];
