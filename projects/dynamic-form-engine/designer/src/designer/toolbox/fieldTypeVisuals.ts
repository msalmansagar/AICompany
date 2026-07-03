// Toolbox field-type visuals — Lucide line icons + a semantic colour group per type.
// Colours use Fluent palette tokens so they stay theme- and dark-mode aware.
import {
  Type, AlignLeft, Hash, DollarSign, Calendar, CalendarClock, Mail, Phone,
  ChevronDown, ListChecks, SquareCheck, CircleDot, ToggleLeft, Search, SearchCheck,
  Table, Table2, Grid3x3, Code, Upload, FileText, Pilcrow, PanelTop,
  RectangleHorizontal, Columns2, Columns3, SquareStack, ChevronsUpDown,
  StretchHorizontal, Minus, Info, Heading, FileCheck, ClipboardCheck, ClipboardList,
  MessageSquare, Tag, type LucideIcon,
} from 'lucide-react';
import { FIELD_TYPE, type FieldType } from '@/constants/fieldTypes';

export type ColorGroup = 'input' | 'choice' | 'datetime' | 'media' | 'data' | 'layout';

interface FieldVisual {
  Icon: LucideIcon;
  group: ColorGroup;
}

/** Icon (line style) + colour group for the toolbox. Colour is derived from the group. */
export const FIELD_TYPE_VISUALS: Record<FieldType, FieldVisual> = {
  [FIELD_TYPE.TEXT]: { Icon: Type, group: 'input' },
  [FIELD_TYPE.TEXTAREA]: { Icon: AlignLeft, group: 'input' },
  [FIELD_TYPE.NUMBER]: { Icon: Hash, group: 'input' },
  [FIELD_TYPE.DECIMAL]: { Icon: Hash, group: 'input' },
  [FIELD_TYPE.CURRENCY]: { Icon: DollarSign, group: 'input' },
  [FIELD_TYPE.EMAIL]: { Icon: Mail, group: 'input' },
  [FIELD_TYPE.PHONE]: { Icon: Phone, group: 'input' },
  [FIELD_TYPE.RICH_TEXT]: { Icon: Pilcrow, group: 'input' },

  [FIELD_TYPE.DATE]: { Icon: Calendar, group: 'datetime' },
  [FIELD_TYPE.DATETIME]: { Icon: CalendarClock, group: 'datetime' },

  [FIELD_TYPE.DROPDOWN]: { Icon: ChevronDown, group: 'choice' },
  [FIELD_TYPE.MULTI_SELECT]: { Icon: ListChecks, group: 'choice' },
  [FIELD_TYPE.CHECKBOX]: { Icon: SquareCheck, group: 'choice' },
  [FIELD_TYPE.RADIO]: { Icon: CircleDot, group: 'choice' },
  [FIELD_TYPE.BOOLEAN]: { Icon: ToggleLeft, group: 'choice' },

  [FIELD_TYPE.LOOKUP]: { Icon: Search, group: 'data' },
  [FIELD_TYPE.MULTI_LOOKUP]: { Icon: SearchCheck, group: 'data' },
  [FIELD_TYPE.REPEATING_GRID]: { Icon: Table, group: 'data' },
  [FIELD_TYPE.CHILD_ENTITY_GRID]: { Icon: Table2, group: 'data' },
  [FIELD_TYPE.INTERACTIVE_GRID]: { Icon: Grid3x3, group: 'data' },
  [FIELD_TYPE.CUSTOM]: { Icon: Code, group: 'data' },

  [FIELD_TYPE.FILE_UPLOAD]: { Icon: Upload, group: 'media' },
  [FIELD_TYPE.DOCUMENT_UPLOAD]: { Icon: FileText, group: 'media' },

  [FIELD_TYPE.TAB]: { Icon: PanelTop, group: 'layout' },
  [FIELD_TYPE.SECTION_1COL]: { Icon: RectangleHorizontal, group: 'layout' },
  [FIELD_TYPE.SECTION_2COL]: { Icon: Columns2, group: 'layout' },
  [FIELD_TYPE.SECTION_3COL]: { Icon: Columns3, group: 'layout' },
  [FIELD_TYPE.SECTION_CARD]: { Icon: SquareStack, group: 'layout' },
  [FIELD_TYPE.SECTION_ACCORDION]: { Icon: ChevronsUpDown, group: 'layout' },
  [FIELD_TYPE.SPACER]: { Icon: StretchHorizontal, group: 'layout' },
  [FIELD_TYPE.DIVIDER]: { Icon: Minus, group: 'layout' },
  [FIELD_TYPE.INFO_TEXT]: { Icon: Info, group: 'layout' },
  [FIELD_TYPE.HEADER_TEXT]: { Icon: Heading, group: 'layout' },
  [FIELD_TYPE.TERMS_BLOCK]: { Icon: FileCheck, group: 'layout' },
  [FIELD_TYPE.DECLARATION_BLOCK]: { Icon: ClipboardCheck, group: 'layout' },
  [FIELD_TYPE.SUMMARY_BLOCK]: { Icon: ClipboardList, group: 'layout' },
  [FIELD_TYPE.INFO_CARD]: { Icon: MessageSquare, group: 'layout' },
  [FIELD_TYPE.LABEL]: { Icon: Tag, group: 'layout' },
};

/** Vibrant icon colour per group — applied directly to the Lucide icon's stroke. */
export const GROUP_COLORS: Record<ColorGroup, string> = {
  input: '#2563eb',    // blue
  choice: '#16a34a',   // green
  datetime: '#0d9488', // teal
  media: '#7c3aed',    // purple
  data: '#ea580c',     // orange
  layout: '#64748b',   // slate
};
