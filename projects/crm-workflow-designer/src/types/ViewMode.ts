export type ViewMode = 'executive' | 'business' | 'technical' | 'technical-new' | 'swimlane';

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
    id: 'technical',
    label: 'Technical',
    description: 'Full detail — schema, tasks, assignments',
  },
  {
    id: 'technical-new',
    label: 'Technical (New)',
    description: 'SOP-style canvas with full technical detail and colour-coded paths',
  },
  {
    id: 'swimlane',
    label: 'Swimlane',
    description: 'Steps grouped by role or team',
  },
];
