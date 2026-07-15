// DFE-TABZONE-001: helpers for enumerating fields across a tab's three zones —
// header, section body, and footer. Header/footer fields live directly on the tab
// (TabDefinition.headerFields/footerFields) rather than inside a section, so any
// code that walks tabs → sections → fields for state (values, rules, validation)
// must also include these zone fields or their behavior would silently break.

import type { FieldDefinition, FormDefinition, TabDefinition } from '@qdb/shared';

// Header + footer fields placed directly on the tab (visibility gated by the tab,
// not a section).
export function getTabZoneFields(tab: TabDefinition): FieldDefinition[] {
  return [...(tab.headerFields ?? []), ...(tab.footerFields ?? [])];
}

// Every field in a tab, in visual order: header → section body → footer.
export function getAllTabFields(tab: TabDefinition): FieldDefinition[] {
  return [
    ...(tab.headerFields ?? []),
    ...tab.sections.flatMap((section) => section.fields),
    ...(tab.footerFields ?? []),
  ];
}

// Every field in the whole form definition, across all tabs and zones.
export function getAllFormFields(formDefinition: FormDefinition): FieldDefinition[] {
  return formDefinition.tabs.flatMap(getAllTabFields);
}
