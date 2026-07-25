import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Select,
  Spinner,
  TableCellLayout,
  TableColumnDefinition,
  Text,
  Badge,
  Toolbar,
  ToolbarButton,
  createTableColumn,
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
  tableContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '0 24px 24px',
  },
  statusBadge: {
    textTransform: 'capitalize',
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

const STATUS_BADGE_APPEARANCE = {
  draft: 'outline',
  published: 'filled',
  archived: 'ghost',
} as const;

const STATUS_BADGE_COLOR = {
  draft: 'warning',
  published: 'success',
  archived: 'subtle',
} as const;

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

      // Use getFormWithEtag so the returned @odata.etag is stored in concurrencyStore
      // immediately — FormSaveService.save() requires it for the conditional PATCH.
      const [{ model: form, etag }, tabs, businessRules] = await Promise.all([
        formService.getFormWithEtag(formId),
        tabService.listTabsForForm(formId),
        businessRuleService.listRulesForForm(formId),
      ]);
      if (etag) {
        useConcurrencyStore.getState().setRecordEtag(formId, etag);
      }

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
      await loadForms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete form');
    } finally {
      setIsDeletingId(null);
    }
  }, [crmService, deleteTarget, loadForms]);

  const columns: TableColumnDefinition<FormSummary>[] = [
    createTableColumn<FormSummary>({
      columnId: 'name',
      compare: (a, b) => a.name.localeCompare(b.name),
      renderHeaderCell: () => 'Form Name',
      renderCell: item => <TableCellLayout>{item.name}</TableCellLayout>,
    }),
    createTableColumn<FormSummary>({
      columnId: 'code',
      compare: (a, b) => a.code.localeCompare(b.code),
      renderHeaderCell: () => 'Code',
      renderCell: item => <TableCellLayout><Text font="monospace">{item.code}</Text></TableCellLayout>,
    }),
    createTableColumn<FormSummary>({
      columnId: 'status',
      compare: (a, b) => a.status.localeCompare(b.status),
      renderHeaderCell: () => 'Status',
      renderCell: item => (
        <TableCellLayout>
          <Badge
            appearance={STATUS_BADGE_APPEARANCE[item.status]}
            color={STATUS_BADGE_COLOR[item.status]}
            className={styles.statusBadge}
          >
            {item.status}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<FormSummary>({
      columnId: 'version',
      compare: (a, b) => a.currentVersion.localeCompare(b.currentVersion),
      renderHeaderCell: () => 'Version',
      renderCell: item => <TableCellLayout>v{item.currentVersion}</TableCellLayout>,
    }),
    createTableColumn<FormSummary>({
      columnId: 'modifiedOn',
      compare: (a, b) => a.modifiedOn.getTime() - b.modifiedOn.getTime(),
      renderHeaderCell: () => 'Modified On',
      renderCell: item => <TableCellLayout>{item.modifiedOn.toLocaleDateString()}</TableCellLayout>,
    }),
    createTableColumn<FormSummary>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: item => (
        <TableCellLayout>
          <Toolbar size="small">
            <ToolbarButton
              icon={<Open24Regular />}
              onClick={() => void handleOpenForm(item.id)}
              aria-label={`Open ${item.name}`}
              disabled={!!isDeletingId || !!isCloningId}
            />
            <ToolbarButton
              icon={isCloningId === item.id ? <Spinner size="tiny" /> : <Copy24Regular />}
              onClick={() => void handleCloneForm(item.id)}
              aria-label={`Clone ${item.name}`}
              disabled={isCloningId === item.id || !!isDeletingId}
            />
            {item.status === 'draft' && (
              <ToolbarButton
                icon={isDeletingId === item.id ? <Spinner size="tiny" /> : <Delete24Regular />}
                onClick={() => setDeleteTarget(item)}
                aria-label={`Delete ${item.name}`}
                disabled={isDeletingId === item.id || !!isCloningId}
              />
            )}
          </Toolbar>
        </TableCellLayout>
      ),
    }),
  ];

  if (isOpeningForm) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner label="Opening form..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text size={600} weight="semibold">Portal Form Designer</Text>
        <Button appearance="primary" icon={<Add24Regular />} onClick={handleNewForm}>
          New Form
        </Button>
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
        <Button onClick={() => void loadForms()}>Refresh</Button>
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
          <DataGrid
            items={forms}
            columns={columns}
            sortable
            getRowId={item => item.id}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<FormSummary>>
              {({ item, rowId }) => (
                <DataGridRow<FormSummary> key={rowId}>
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
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
