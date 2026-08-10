import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Select,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Add24Regular, Search24Regular, Copy24Regular, Open24Regular, Delete24Regular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { FormDefinitionService, type FormSummary } from '@/services/FormDefinitionService';
import { TabService } from '@/services/TabService';
import { SectionService } from '@/services/SectionService';
import { FieldService } from '@/services/FieldService';
import { OptionValueService } from '@/services/OptionValueService';
import { LookupConfigService } from '@/services/LookupConfigService';
import { ValidationRuleService } from '@/services/ValidationRuleService';
import { BusinessRuleService } from '@/services/BusinessRuleService';
import { FormDeleteService } from '@/services/FormDeleteService';
import { FormCloneService } from '@/services/FormCloneService';
import { AuditLogService } from '@/services/AuditLogService';
import { DesignService } from '@/services/DesignService';
import { useDesignerStore } from '@/state/designerStore';
import { DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';
import { useConcurrencyStore } from '@/state/concurrencyStore';
import type { FormStatus } from '@/state/models/DesignerFormModel';
import type { DesignerValidationRule } from '@/state/models/DesignerRuleModel';
import type { DesignPayload } from '@qdb/shared';

const OPTION_FIELD_TYPES = new Set(['dropdown', 'multi_select', 'radio']);
const LOOKUP_FIELD_TYPES = new Set(['lookup', 'child_entity_grid']);

/**
 * Loads the persisted design payload for one form, scoped to its own sections and
 * fields so styling never bleeds across forms. Missing pieces fall back to defaults.
 */
async function loadDesignPayload(
  designService: DesignService,
  scope: { formId: string; sectionIds: string[]; fieldIds: string[] },
): Promise<DesignPayload> {
  // Each design entity loads independently — one failing query must not blank out
  // the styling that did load, so every getter falls back to its own empty default.
  const [formDesign, sectionDesigns, fieldDesigns, buttons] = await Promise.all([
    designService.getFormDesign(scope.formId).catch(() => null),
    designService.getSectionDesigns(scope.sectionIds).catch(() => []),
    designService.getFieldDesigns(scope.fieldIds).catch(() => []),
    designService.getButtonDesigns(scope.formId).catch(() => []),
  ]);

  const theme = formDesign?.themeId
    ? await designService.getTheme(formDesign.themeId).catch(() => DEFAULT_DESIGN_PAYLOAD.theme)
    : DEFAULT_DESIGN_PAYLOAD.theme;
  const layoutGrid = formDesign?.id
    ? await designService.getLayoutGrids(formDesign.id).catch(() => [])
    : [];

  return {
    theme,
    formDesign: formDesign ?? DEFAULT_DESIGN_PAYLOAD.formDesign,
    sectionDesigns: Object.fromEntries(sectionDesigns.map(design => [design.sectionId, design])),
    fieldDesigns: Object.fromEntries(fieldDesigns.map(design => [design.fieldId, design])),
    buttonDesigns: {
      Submit: buttons.find(button => button.buttonType === 'Submit'),
      SaveDraft: buttons.find(button => button.buttonType === 'SaveDraft'),
      Cancel: buttons.find(button => button.buttonType === 'Cancel'),
    },
    layoutGrid,
  };
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    padding: '16px 24px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbar: {
    padding: '12px 24px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  // The grid scrolls inside .grid-wrap, which is what the sticky header sticks to.
  // This must not scroll as well, or there are two scrollbars and the header pins
  // to the wrong one.
  tableContainer: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 24px 24px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '300px',
    gap: '16px',
  },
});

const SELECT_A_FORM_FIRST = 'Select a form first';

/** One column of the records grid: how it sorts, and what it puts in a cell. */
interface GridColumn {
  key: string;
  label: string;
  compare: (a: FormSummary, b: FormSummary) => number;
  render: (form: FormSummary) => React.ReactNode;
  /** Extra class on the cell, e.g. 'mono' for a code. */
  cellClass?: string;
}

export function FormListScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);
  const { navigateTo, loadForm } = useDesignerStore();

  const [forms, setForms] = useState<FormSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  const [isCloningId, setIsCloningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormSummary | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FormStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  // Which row the command bar acts on. Single selection: the commands here operate
  // on one form, and a multi-select would only raise the question of what Open means.
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; isAscending: boolean }>({
    key: 'modifiedOn',
    isAscending: false,
  });

  const loadForms = useCallback(async () => {
    if (!crmService) return;
    setIsLoading(true);
    setError(null);

    try {
      const service = new FormDefinitionService(crmService.getWebApi());
      const result = await service.listForms({
        status: statusFilter === 'all' ? undefined : statusFilter,
        searchTerm: searchTerm || undefined,
      });
      setForms(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forms');
    } finally {
      setIsLoading(false);
    }
  }, [crmService, statusFilter, searchTerm]);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const handleNewForm = useCallback(() => {
    navigateTo('new-form-wizard');
  }, [navigateTo]);

  const handleOpenForm = useCallback(async (formId: string) => {
    if (!crmService) return;
    setIsOpeningForm(true);
    setError(null);

    try {
      const webApi = crmService.getWebApi();
      const formService = new FormDefinitionService(webApi);
      const tabService = new TabService(webApi);
      const sectionService = new SectionService(webApi);
      const fieldService = new FieldService(webApi);
      const optionService = new OptionValueService(webApi);
      const lookupService = new LookupConfigService(webApi);
      const validationRuleService = new ValidationRuleService(webApi);
      const businessRuleService = new BusinessRuleService(webApi);

      // Use getFormWithEtag so the returned @odata.etag can be stored in concurrencyStore —
      // FormSaveService.save() requires it for the conditional PATCH. It is stored AFTER
      // loadForm below, not here: loadForm resets the concurrency store to clear state from a
      // previously opened form, which would wipe an etag stored at this point and leave every
      // save failing with MissingEtagError.
      const [{ model: form, etag }, tabs, businessRules] = await Promise.all([
        formService.getFormWithEtag(formId),
        tabService.listTabsForForm(formId),
        businessRuleService.listRulesForForm(formId),
      ]);

      const sectionsArrays = await Promise.all(tabs.map(tab => sectionService.listSectionsForTab(tab.id)));
      const sections = sectionsArrays.flat();

      const fieldsArrays = await Promise.all(sections.map(section => fieldService.listFieldsForSection(section.id)));
      const fields = fieldsArrays.flat();

      // Load options, lookup configs, and validation rules in parallel per field
      await Promise.all(
        fields.map(async field => {
          const [options, lookupConfig, validationRules] = await Promise.all([
            OPTION_FIELD_TYPES.has(field.fieldType)
              ? optionService.listOptionsForField(field.id)
              : Promise.resolve([]),
            LOOKUP_FIELD_TYPES.has(field.fieldType)
              ? lookupService.getLookupConfigForField(field.id)
              : Promise.resolve(null),
            validationRuleService.listRulesForField(field.id),
          ]);

          field.options = options;
          field.lookupConfig = lookupConfig;
          // validationRules stored separately via loadForm below
          (field as typeof field & { _validationRules: DesignerValidationRule[] })._validationRules = validationRules;
        })
      );

      const allValidationRules = fields.flatMap(
        f => (f as typeof f & { _validationRules?: DesignerValidationRule[] })._validationRules ?? []
      );

      // Styling load is best-effort — a design glitch must never block opening a form.
      let designPayload = DEFAULT_DESIGN_PAYLOAD;
      try {
        designPayload = await loadDesignPayload(new DesignService(webApi), {
          formId,
          sectionIds: sections.map(section => section.id),
          fieldIds: fields.map(field => field.id),
        });
      } catch {
        designPayload = DEFAULT_DESIGN_PAYLOAD;
      }

      loadForm({ form, tabs, sections, fields, validationRules: allValidationRules, businessRules, designPayload });

      // After loadForm, which resets the concurrency store. Keyed on form.id rather than the
      // formId argument so it matches the lookup in DesignerScreen, which reads it from the
      // loaded model.
      if (etag) {
        useConcurrencyStore.getState().setRecordEtag(form.id, etag);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open form');
      setIsOpeningForm(false);
    }
  }, [crmService, loadForm]);

  const handleCloneForm = useCallback(async (formId: string) => {
    if (!crmService) return;
    setIsCloningId(formId);
    setError(null);

    try {
      const webApi = crmService.getWebApi();
      const cloneService = new FormCloneService(webApi);
      await cloneService.cloneForm(formId);
      const auditService = new AuditLogService(webApi, crmService.getUserContext());
      await auditService.logAction(formId, 'CLONE', { sourceFormId: formId });
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone form');
    } finally {
      setIsCloningId(null);
    }
  }, [crmService, loadForms]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!crmService || !deleteTarget) return;
    const formId = deleteTarget.id;
    setIsDeletingId(formId);
    setDeleteTarget(null);

    try {
      const webApi = crmService.getWebApi();
      const auditService = new AuditLogService(webApi, crmService.getUserContext());
      await auditService.logAction(formId, 'DELETE_FORM', {});
      const deleteService = new FormDeleteService(webApi);
      await deleteService.deleteForm(formId);
      // The commands act on the selection, so it must not outlive the row.
      setSelectedFormId(null);
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete form');
    } finally {
      setIsDeletingId(null);
    }
  }, [crmService, deleteTarget, loadForms]);

  // Which commands apply is a property of the selection, not of a button sitting in
  // a row, so each one works it out from the selected form and explains itself in a
  // title when it is off.
  const selectedForm = forms.find(form => form.id === selectedFormId) ?? null;
  const isBusy = !!isCloningId || !!isDeletingId;
  const canDeleteSelected = selectedForm?.status === 'draft';
  const deleteCommandTitle =
    !selectedForm ? SELECT_A_FORM_FIRST
    : canDeleteSelected ? `Delete ${selectedForm.name}`
    : 'Only a draft can be deleted';

  const columns: GridColumn[] = [
    {
      key: 'name',
      label: 'Form Name',
      compare: (a, b) => a.name.localeCompare(b.name),
      // The name is the way in, as it is in every model-driven grid. Clicking it
      // opens rather than selects, which is why the row handler ignores it.
      render: form => (
        <button
          type="button"
          className="link-cell"
          onClick={() => void handleOpenForm(form.id)}
          aria-label={`Open ${form.name}`}
        >
          {form.name}
        </button>
      ),
    },
    {
      key: 'code',
      label: 'Code',
      compare: (a, b) => a.code.localeCompare(b.code),
      cellClass: 'mono',
      render: form => form.code,
    },
    {
      key: 'status',
      label: 'Status',
      compare: (a, b) => a.status.localeCompare(b.status),
      render: form => <span className={`pill ${form.status}`}>{form.status}</span>,
    },
    {
      key: 'version',
      label: 'Version',
      compare: (a, b) => a.currentVersion.localeCompare(b.currentVersion),
      render: form => `v${form.currentVersion}`,
    },
    {
      key: 'modifiedOn',
      label: 'Modified On',
      compare: (a, b) => a.modifiedOn.getTime() - b.modifiedOn.getTime(),
      render: form => form.modifiedOn.toLocaleDateString(),
    },
  ];

  const sortedForms = [...forms].sort((a, b) => {
    const column = columns.find(candidate => candidate.key === sort.key);
    if (!column) return 0;
    return sort.isAscending ? column.compare(a, b) : column.compare(b, a);
  });

  const toggleSort = (key: string): void =>
    setSort(current =>
      current.key === key ? { key, isAscending: !current.isAscending } : { key, isAscending: true },
    );

  if (isOpeningForm) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner label="Opening form..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className="cmdbar" role="toolbar" aria-label="Form commands">
        <button type="button" className="cmd primary" onClick={handleNewForm}>
          <Add24Regular fontSize={16} /> New Form
        </button>
        <span className="cmd-sep" />
        <button
          type="button"
          className="cmd"
          onClick={() => selectedForm && void handleOpenForm(selectedForm.id)}
          disabled={!selectedForm || isBusy}
          title={selectedForm ? `Open ${selectedForm.name}` : SELECT_A_FORM_FIRST}
        >
          <Open24Regular fontSize={16} /> Open
        </button>
        <button
          type="button"
          className="cmd"
          onClick={() => selectedForm && void handleCloneForm(selectedForm.id)}
          disabled={!selectedForm || isBusy}
          title={selectedForm ? `Clone ${selectedForm.name}` : SELECT_A_FORM_FIRST}
        >
          {isCloningId ? <Spinner size="tiny" /> : <Copy24Regular fontSize={16} />} Clone
        </button>
        <button
          type="button"
          className="cmd danger"
          onClick={() => selectedForm && setDeleteTarget(selectedForm)}
          disabled={!canDeleteSelected || isBusy}
          title={deleteCommandTitle}
        >
          {isDeletingId ? <Spinner size="tiny" /> : <Delete24Regular fontSize={16} />} Delete
        </button>
        <span className="cmd-spacer" />
        <button type="button" className="cmd" onClick={() => void loadForms()} disabled={isBusy}>
          Refresh
        </button>
      </div>

      <div className={styles.header}>
        <Text size={600} weight="semibold">Portal Form Designer</Text>
      </div>

      <div className={styles.toolbar}>
        <Input
          contentBefore={<Search24Regular />}
          placeholder="Search forms..."
          value={searchTerm}
          onChange={(_, data) => setSearchTerm(data.value)}
          style={{ width: 280 }}
        />
        <Select
          value={statusFilter}
          onChange={(_, data) => setStatusFilter(data.value as FormStatus | 'all')}
          style={{ width: 160 }}
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
      </div>

      <div className={styles.tableContainer}>
        {isLoading ? (
          <Spinner label="Loading forms..." />
        ) : error ? (
          <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>
        ) : forms.length === 0 ? (
          <div className={styles.emptyState}>
            <Text size={400} weight="semibold">No forms found</Text>
            <Text>Create your first portal form to get started.</Text>
            <Button appearance="primary" icon={<Add24Regular />} onClick={handleNewForm}>
              Create New Form
            </Button>
          </div>
        ) : (
          <>
            <div className="grid-wrap">
              <table className="grid" role="grid">
                <thead>
                  <tr>
                    <th className="row-check" />
                    {columns.map(column => (
                      <th
                        key={column.key}
                        className="sortable"
                        aria-sort={
                          sort.key === column.key
                            ? (sort.isAscending ? 'ascending' : 'descending')
                            : 'none'
                        }
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        <span className="sort-arrow" aria-hidden="true">
                          {sort.key === column.key && !sort.isAscending ? '↓' : '↑'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedForms.map(form => (
                    // The whole row selects, as it does in the reference — clicking
                    // the name is the one exception, because that opens the form.
                    <tr
                      key={form.id}
                      data-id={form.id}
                      className={form.id === selectedFormId ? 'selected' : undefined}
                      aria-selected={form.id === selectedFormId}
                      onClick={event => {
                        // The name opens the form; without this it would select too.
                        if ((event.target as HTMLElement).closest('.link-cell')) return;
                        setSelectedFormId(form.id);
                      }}
                    >
                      <td className="row-check">
                        <input
                          type="checkbox"
                          checked={form.id === selectedFormId}
                          aria-label={`Select ${form.name}`}
                          // Without this the click also reaches the row handler, which
                          // re-selects whatever the box just cleared.
                          onClick={event => event.stopPropagation()}
                          onChange={() =>
                            setSelectedFormId(current => (current === form.id ? null : form.id))
                          }
                        />
                      </td>
                      {columns.map(column => (
                        <td key={column.key} data-label={column.label} className={column.cellClass}>
                          {column.render(form)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="legend">
              {(['published', 'draft', 'archived'] as const).map(status => (
                <span key={status}>
                  <b>{forms.filter(form => form.status === status).length}</b> {status}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(_, data) => { if (!data.open) setDeleteTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Form</DialogTitle>
            <DialogContent>
              Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>?
              This will also remove all tabs, sections, fields, and related records. This action cannot be undone.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button appearance="primary" onClick={() => void handleDeleteConfirm()} style={{ backgroundColor: tokens.colorPaletteRedBackground3 }}>
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
