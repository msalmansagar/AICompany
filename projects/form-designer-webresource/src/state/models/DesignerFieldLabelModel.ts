export interface DesignerFieldLabelModel {
  /** CRM GUID or 'tmp_fl_<timestamp>' for unsaved records */
  id: string;
  fieldId: string;
  name: string;
  locale: string;
  label: string | null;
  placeholder: string | null;
  tooltip: string | null;
}
