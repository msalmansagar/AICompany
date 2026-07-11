import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import { useIndexBasedKeyboard } from '@/designer/dnd/useIndexBasedKeyboard';
import { arrayMove } from '@dnd-kit/sortable';
import { makeStyles, tokens, Spinner, Text, MessageBar, MessageBarBody, MessageBarActions, Button } from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { DESIGNER_SESSION_ID } from '@/state/designerSessionId';
import { useAuditStore } from '@/state/auditStore';
import { ComponentToolbox } from '@/designer/toolbox/ComponentToolbox';
import { DesignerCanvas } from '@/designer/canvas/DesignerCanvas';
import { PropertiesPanel } from '@/designer/properties/PropertiesPanel';
import { DesignerCommandBar } from '@/designer/commandbar/DesignerCommandBar';
import { ConflictResolutionDialog } from '@/components/concurrency/ConflictResolutionDialog';
import { CrmContext } from '@/app/App';
import { FormSaveService, PartialSaveError } from '@/services/FormSaveService';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { ConcurrencyConflictError } from '@/services/concurrency/ConcurrencyConflictError';
import { WriteQueue } from '@/services/concurrency/WriteQueue';
import { mapPatches } from '@/services/AuditPatchMapper';
import { AuditBatchWriter } from '@/services/audit/AuditBatchWriter';
import { computeSnapshotPatches } from '@/services/audit/computeSnapshotPatches';
import { useConcurrencyStore } from '@/state/concurrencyStore';
import { validateForDraftSave } from '@/validation/draftValidation';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { FormAuditableSnapshot } from '@/state/designerStore';
import type { DesignerFieldModel, DesignerSectionModel, DesignerTabModel } from '@/state/models/DesignerFormModel';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FIELD_TYPE, FIELD_TYPE_DEFINITIONS } from '@/constants/fieldTypes';
import { calculateContrastRatio } from '@qdb/shared';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  workArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  toolbox: {
    width: '260px',
    flexShrink: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  canvas: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground3,
    padding: '24px',
  },
  properties: {
    width: '320px',
    flexShrink: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

function generateTempId(prefix: string): string {
  return `tmp_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface AuditWriteParams {
  baseline: FormAuditableSnapshot;
  current: FormAuditableSnapshot;
  formId: string;
  changedBy: string;
  webApi: IWebApiAdapter;
  sessionId: string;
}

/**
 * Retries any audit entries that buffered on a prior write failure (PC-3).
 * Must be called before writeAuditEntriesNonBlocking on each successful save
 * so that pending entries are flushed in order ahead of the new batch.
 */
function retryPendingAuditEntriesNonBlocking(webApi: IWebApiAdapter): void {
  const pendingEntries = useAuditStore.getState().takePendingEntries();
  if (pendingEntries.length === 0) return;

  const writer = new AuditBatchWriter(webApi, DESIGNER_SESSION_ID);
  void writer.writeEntries(pendingEntries).then((stillFailed) => {
    if (stillFailed.length > 0) {
      useAuditStore.getState().addFailedEntries(stillFailed);
    }
  });
}

/**
 * Computes immer patches between baseline and current, maps them to audit
 * entries, and fires the batch write. Failed entries are buffered in
 * auditStore for retry on the next successful save (PC-3).
 */
function writeAuditEntriesNonBlocking(params: AuditWriteParams): void {
  const { baseline, current, formId, changedBy, webApi, sessionId } = params;

  const [, patches, inversePatches] = computeSnapshotPatches(baseline, current);

  if (patches.length === 0) return;

  const entries = mapPatches(patches, inversePatches, {
    formId,
    formVersionId: null,
    changedBy,
    changedOn: new Date().toISOString(),
  });

  const writer = new AuditBatchWriter(webApi, sessionId);
  void writer.writeEntries(entries).then((failedEntries) => {
    if (failedEntries.length > 0) {
      useAuditStore.getState().addFailedEntries(failedEntries);
    }
  });
}

export function DesignerScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);
  const [activeOverlayLabel, setActiveOverlayLabel] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState<string>('');

  // One WriteQueue per form session — serialises debounced PATCH operations and
  // routes ConcurrencyConflictError (412) to the conflict dialog (OI-005).
  const writeQueueRef = useRef<WriteQueue>(new WriteQueue());

  const {
    form,
    tabs,
    sections,
    fields,
    businessRules,
    validationRules,
    designPayload,
    tabOrder,
    sectionOrder,
    fieldOrder,
    newIds,
    dirtyIds,
    deletedIds,
    isDirty,
    isSaving,
    activeCanvasTabId,
    deletedEntityTypes,
    lastSavedAuditSnapshot,
    addField,
    addSection,
    addTab,
    moveField,
    reorderFields,
    reorderTabs,
    markSaving,
    markSaved,
    markResolved,
    navigateTo,
  } = useDesignerStore();
  const { conflictState } = useConcurrencyStore();
  const setConflictState = useConcurrencyStore(s => s.setConflictState);
  const setRecordEtag = useConcurrencyStore(s => s.setRecordEtag);

  const hasAuditRetryWarning = useAuditStore(s => s.hasAuditRetryWarning);
  const dismissAuditRetryWarning = useAuditStore(s => s.dismissAuditRetryWarning);

  // PointerSensor: distance: 5 prevents click-to-drag activation while keeping drag
  // responsive; delay+tolerance catches the edge case where a click on a text label
  // would otherwise trigger a spurious selection-drag on slow pointer events.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  /** Fires the actual Dataverse PATCH for a save, using the current state snapshot. */
  const executeSave = useCallback(async (
    snapshot: Parameters<FormSaveService['save']>[0],
    auditBaseline: FormAuditableSnapshot | null,
  ): Promise<void> => {
    const webApi = crmService!.getWebApi();
    const userContext = crmService!.getUserContext();
    const saveService = new FormSaveService(webApi, userContext);

    const { resolvedIds, resolvedThemeId } = await saveService.save(snapshot);
    markSaved(resolvedIds, resolvedThemeId);

    // Refresh the etag after a successful PATCH — Dataverse invalidates the
    // prior etag on every write (next save without a refresh would get a false 412).
    const formDefService = new FormDefinitionService(webApi);
    const { etag: freshEtag } = await formDefService.getFormWithEtag(snapshot.form!.id);
    if (freshEtag) setRecordEtag(snapshot.form!.id, freshEtag);

    // E4: retry any buffered failed entries first, then write new audit entries.
    // Both are non-blocking — the save return value is unaffected by audit state (PC-3).
    if (auditBaseline) {
      retryPendingAuditEntriesNonBlocking(webApi);
      writeAuditEntriesNonBlocking({
        baseline: auditBaseline,
        current: { fields: snapshot.fields, validationRules: snapshot.validationRules, businessRules: snapshot.businessRules },
        formId: snapshot.form!.id,
        changedBy: userContext.userId,
        webApi,
        sessionId: DESIGNER_SESSION_ID,
      });
    }
  }, [crmService, markSaved, setRecordEtag]);

  // IndexBasedKeyboardSensor — wired alongside the PointerSensor in the DndContext.
  // Alt+ArrowUp/Down reorders by index position (not pixel offset) — see ADR-009.
  useIndexBasedKeyboard({ onAnnounce: setKeyboardAnnouncement });

  const handleSaveDraft = useCallback(() => {
    if (!form || !crmService || isSaving) return;

    const validation = validateForDraftSave(form);
    if (!validation.isValid) return;

    setSaveError(null);
    markSaving();

    // Capture a point-in-time snapshot of the designer state for this save attempt.
    // Fields/tabs/sections are captured NOW so the save reflects the user's edit,
    // not any mutation that happens between scheduling and flush.
    const saveSnapshot = {
      form,
      tabs,
      sections,
      fields,
      validationRules,
      businessRules,
      designPayload,
      tabOrder,
      sectionOrder,
      fieldOrder,
      newIds,
      dirtyIds,
      deletedIds,
      deletedEntityTypes,
    };
    const auditBaseline = lastSavedAuditSnapshot;

    writeQueueRef.current.schedule(
      () => {
        // Read the etag at flush time — Dataverse invalidates the etag after each
        // successful PATCH, and executeSave refreshes it. Capturing at schedule time
        // would use a stale etag on rapid sequential saves, causing a spurious 412.
        const currentEtag = useConcurrencyStore.getState().recordEtags[form.id] ?? '';
        return executeSave({ ...saveSnapshot, formEtag: currentEtag }, auditBaseline);
      },
      (error) => {
        if (error instanceof PartialSaveError && Object.keys(error.resolvedIds).length > 0) {
          markResolved(error.resolvedIds);
        }
        if (error instanceof ConcurrencyConflictError) {
          setConflictState({
            entityLogicalName: ENTITY_NAMES.FORM_DEFINITION,
            recordId: form.id,
            localEtag: error.localEtag,
            conflictTimestamp: new Date(),
          });
        }
        setSaveError(error instanceof Error ? error.message : 'Save failed. Please try again.');
        useDesignerStore.setState({ isSaving: false });
      },
    );
  }, [
    form, crmService, isSaving,
    tabs, sections, fields, validationRules, businessRules, designPayload,
    tabOrder, sectionOrder, fieldOrder,
    newIds, dirtyIds, deletedIds, deletedEntityTypes,
    lastSavedAuditSnapshot,
    markSaving, markSaved, markResolved, setConflictState,
    executeSave,
    // recordEtags intentionally omitted — the etag is read at flush time via
    // useConcurrencyStore.getState() inside the operation closure (M-2).
  ]);

  // Fixed: stable dep array so the listener is not re-registered on every render
  useEffect(() => {
    const handler = () => void handleSaveDraft();
    window.addEventListener('formdesigner:autosave', handler);
    return () => window.removeEventListener('formdesigner:autosave', handler);
  }, [handleSaveDraft]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as Record<string, unknown> | undefined;
    const fieldType = String(data?.['fieldType'] ?? '');
    const def = fieldType ? FIELD_TYPE_DEFINITIONS[fieldType as keyof typeof FIELD_TYPE_DEFINITIONS] : undefined;
    setActiveOverlayLabel(def?.label ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveOverlayLabel(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const activeData = active.data.current as Record<string, unknown> | undefined;

      // ── Toolbox drop ──────────────────────────────────────────────────────
      if (activeData?.['source'] === 'toolbox') {
        const fieldType = String(activeData['fieldType'] ?? '');
        const fieldDef = FIELD_TYPE_DEFINITIONS[fieldType as keyof typeof FIELD_TYPE_DEFINITIONS];
        if (!fieldDef) return;

        // Layout: TAB type → add a new tab
        if (fieldType === FIELD_TYPE.TAB) {
          const newTab: DesignerTabModel = {
            id: generateTempId('tab'),
            formId: form?.id ?? '',
            label: `Tab ${tabOrder.length + 1}`,
            iconName: null,
            sortOrder: tabOrder.length,
            isVisible: true,
            requiresPreviousTabComplete: false,
            hideTabBar: false,
          };
          addTab(newTab);
          return;
        }

        // Layout: SECTION_* types → add section to active tab
        if (fieldDef.isLayout) {
          const targetTabId = activeCanvasTabId ?? tabOrder[0];
          if (!targetTabId) return;

          const columnCount: 1 | 2 | 3 =
            fieldType === FIELD_TYPE.SECTION_1COL ? 1
            : fieldType === FIELD_TYPE.SECTION_3COL ? 3
            : 2; // 2COL, CARD, ACCORDION all default to 2

          const existingSections = sectionOrder[targetTabId] ?? [];
          const newSection: DesignerSectionModel = {
            id: generateTempId('section'),
            tabId: targetTabId,
            label: fieldDef.label,
            description: null,
            columnCount,
            isCollapsible: fieldType === FIELD_TYPE.SECTION_ACCORDION,
            isExpandedByDefault: true,
            isVisible: true,
            sortOrder: existingSections.length,
          };
          addSection(newSection);
          return;
        }

        // Regular field drop — resolve target section
        const overData = over.data.current as Record<string, unknown> | undefined;
        const targetSectionId = String(
          overData?.['sectionId'] ??
          (overId.startsWith('section-drop-') ? overId.replace('section-drop-', '') : overId)
        );
        if (!sections[targetSectionId] && !overId.startsWith('section-drop-')) return;

        const existingFieldIds = fieldOrder[targetSectionId] ?? [];
        const newField: DesignerFieldModel = {
          id: generateTempId('field'),
          sectionId: targetSectionId,
          label: fieldDef.label,
          code: `field_${Date.now()}`,
          fieldType,
          placeholder: '',
          helpText: '',
          isRequired: false,
          isReadOnly: false,
          isHidden: false,
          defaultValue: null,
          currencyCode: null,
          decimalPlaces: null,
          maxRows: null,
          sortOrder: existingFieldIds.length,
          columnSpan: 1,
          options: [],
          lookupConfig: null,
          componentKey: null,
          boolRenderStyle: null,
          trueLabel: null,
          falseLabel: null,
          infoCardStyle: null,
          infoCardTitle: null,
          infoCardBody: null,
          infoCardIcon: null,
          infoCardDownloadUrl: null,
          infoCardDownloadLabel: null,
          infoCardDownloadIcon: null,
          fileDownloadLabel: null,
          fileDownloadIcon: null,
          uploadDocumentSetting: null,
          downloadDocumentSetting: null,
          prefix: null,
          suffix: null,
          gridMode: null,
          gridEntityName: null,
          gridSelectionMode: null,
          gridMinRows: null,
          gridSavedViewId: null,
          gridFilterExpression: null,
          gridDependsOnFieldId: null,
          gridDependsOnFilterTemplate: null,
          gridColumns: [],
        };
        addField(newField);
        return;
      }

      // ── Tab reorder ───────────────────────────────────────────────────────
      if (activeData?.['type'] === 'tab' && tabs[activeId] && tabs[overId]) {
        const oldIndex = tabOrder.indexOf(activeId);
        const newIndex = tabOrder.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          reorderTabs(arrayMove(tabOrder, oldIndex, newIndex));
        }
        return;
      }

      // ── Field reorder / move ──────────────────────────────────────────────
      if (activeId !== overId && fields[activeId]) {
        const field = fields[activeId];
        const overField = fields[overId];

        if (overField && field.sectionId === overField.sectionId) {
          const currentOrder = fieldOrder[field.sectionId] ?? [];
          const oldIndex = currentOrder.indexOf(activeId);
          const newIndex = currentOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1) {
            reorderFields(field.sectionId, arrayMove(currentOrder, oldIndex, newIndex));
          }
          return;
        }

        if (overField && field.sectionId !== overField.sectionId) {
          const targetOrder = fieldOrder[overField.sectionId] ?? [];
          const targetIndex = targetOrder.indexOf(overId);
          moveField(activeId, overField.sectionId, targetIndex >= 0 ? targetIndex : targetOrder.length);
        }
      }
    },
    [form, tabs, sections, fields, fieldOrder, sectionOrder, tabOrder, activeCanvasTabId,
     addField, addSection, addTab, reorderFields, reorderTabs, moveField]
  );

  const handleDragOver = useCallback((_event: DragOverEvent) => {}, []);

  const handlePublish = useCallback(async () => {
    // SC-08: evaluate blocking WCAG pairs in-memory before navigating to publish.
    const theme = designPayload.theme;
    const primaryColor = theme.primaryColor;
    const bgColor = theme.backgroundColor ?? '#ffffff';
    const contrastResult = calculateContrastRatio(primaryColor, bgColor);
    if (!contrastResult.passesMinimumGate) {
      // Redirect to theme editor — WcagContrastIndicator shows the failing ratio live.
      navigateTo('theme-editor');
      return;
    }
    // SC-08: flush pending save before entering publish flow. handleSaveDraft
    // schedules via WriteQueue; flush() drives it to completion synchronously.
    if (isDirty) {
      handleSaveDraft();
      await writeQueueRef.current.flush();
    }
    navigateTo('publish-validation');
  }, [designPayload, isDirty, handleSaveDraft, navigateTo]);
  const handlePreview = useCallback(() => navigateTo('preview'), [navigateTo]);
  const handleOpenForm = useCallback(() => {
    if (!form || !crmService) return;
    crmService.openFormRuntime(form.id, form.code);
  }, [form, crmService]);
  const selectFormItem = useDesignerStore(state => state.selectItem);
  const handleFormProperties = useCallback(() => {
    if (form) selectFormItem(form.id, 'form');
  }, [form, selectFormItem]);
  const handleVersionHistory = useCallback(() => navigateTo('version-history'), [navigateTo]);
  const handleBusinessRules = useCallback(() => navigateTo('rule-config'), [navigateTo]);
  const handleSubmissionMapping = useCallback(() => navigateTo('submission-mapping'), [navigateTo]);
  const handleThemeEditor = useCallback(() => navigateTo('theme-editor'), [navigateTo]);

  const handleConflictReload = useCallback(() => {
    setConflictState(null);
    useDesignerStore.getState().resetDesigner();
  }, [setConflictState]);

  const handleConflictDismiss = useCallback(() => {
    setConflictState(null);
  }, [setConflictState]);

  if (!form) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner label="Loading form..." />
      </div>
    );
  }

  const hasNoTabs = tabOrder.length === 0;
  const activeTabId = tabOrder[0] ?? null;

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.root}>
        <DesignerCommandBar
          formName={form.name}
          formStatus={form.status}
          isDirty={isDirty}
          isSaving={isSaving}
          onSaveDraft={() => void handleSaveDraft()}
          onPublish={() => void handlePublish()}
          onPreview={handlePreview}
          onOpenForm={handleOpenForm}
          onFormProperties={handleFormProperties}
          onVersionHistory={handleVersionHistory}
          onBusinessRules={handleBusinessRules}
          onSubmissionMapping={handleSubmissionMapping}
          onThemeEditor={handleThemeEditor}
          onBack={() => useDesignerStore.getState().navigateTo('form-list')}
        />
        {saveError && (
          <MessageBar intent="error">
            <MessageBarBody>Save failed: {saveError}</MessageBarBody>
            <MessageBarActions>
              <Button size="small" appearance="transparent" onClick={() => setSaveError(null)}>Dismiss</Button>
            </MessageBarActions>
          </MessageBar>
        )}
        {hasAuditRetryWarning && (
          <MessageBar intent="warning">
            <MessageBarBody>Some change-history entries could not be saved and will retry on the next save.</MessageBarBody>
            <MessageBarActions>
              <Button size="small" appearance="transparent" onClick={dismissAuditRetryWarning}>Dismiss</Button>
            </MessageBarActions>
          </MessageBar>
        )}
        <div className={styles.workArea}>
          <div className={styles.toolbox}>
            <ComponentToolbox />
          </div>
          <div className={styles.canvas}>
            {hasNoTabs ? (
              <EmptyCanvasPrompt />
            ) : (
              <DesignerCanvas
                tabs={tabs}
                sections={sections}
                fields={fields}
                tabOrder={tabOrder}
                sectionOrder={sectionOrder}
                fieldOrder={fieldOrder}
                activeTabId={activeTabId}
              />
            )}
          </div>
          <div className={styles.properties}>
            <PropertiesPanel />
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeOverlayLabel ? (
          <div style={{
            padding: '6px 14px',
            backgroundColor: tokens.colorBrandBackground,
            color: tokens.colorNeutralForegroundOnBrand,
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: tokens.shadow8,
            pointerEvents: 'none',
          }}>
            {activeOverlayLabel}
          </div>
        ) : null}
      </DragOverlay>

      {/* ARIA live region — announces keyboard reorder events to screen readers. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {keyboardAnnouncement}
      </div>
    </DndContext>

      {conflictState && form && crmService && (
        <ConflictResolutionDialog
          isOpen
          localSnapshot={form}
          conflictTimestamp={conflictState.conflictTimestamp}
          fetchServerVersion={() => {
            const webApi = crmService.getWebApi();
            return new FormDefinitionService(webApi)
              .getFormWithEtag(conflictState.recordId)
              .then(r => r.model);
          }}
          onReload={handleConflictReload}
          onDismiss={handleConflictDismiss}
        />
      )}
    </>
  );
}

function EmptyCanvasPrompt(): React.ReactElement {
  const addTab = useDesignerStore(state => state.addTab);
  const tabOrder = useDesignerStore(state => state.tabOrder);

  const handleAddFirstTab = useCallback(() => {
    addTab({
      id: `tmp_tab_${Date.now()}`,
      formId: useDesignerStore.getState().form?.id ?? '',
      label: 'Tab 1',
      iconName: null,
      sortOrder: tabOrder.length,
      isVisible: true,
      requiresPreviousTabComplete: false,
      hideTabBar: false,
    });
  }, [addTab, tabOrder.length]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 16,
      color: tokens.colorNeutralForeground3,
    }}>
      <Text size={400} weight="semibold">Your form canvas is empty</Text>
      <Text>Drag a Tab from the toolbox or click below to start designing</Text>
      <button onClick={handleAddFirstTab} style={{
        padding: '8px 20px',
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 14,
      }}>
        Add First Tab
      </button>
    </div>
  );
}
