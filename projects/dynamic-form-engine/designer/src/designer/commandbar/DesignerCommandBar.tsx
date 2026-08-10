// The editor's command bar, on the design system.
//
// Every action is a .cmd, as it is in report-designer.html: 34px, 13px text, a 16px
// icon, transparent until hovered. The primary action is brand-coloured TEXT rather
// than a filled button — a model-driven command bar has no filled buttons in it, and
// a blue block at the end of the row was the loudest thing on the screen.
//
// Native `title` rather than Fluent's Tooltip, which is what the reference uses and
// what a command bar in Dataverse does.

import React from 'react';
import {
  Save24Regular,
  Send24Regular,
  Eye24Regular,
  Open24Regular,
  History24Regular,
  ArrowLeft24Regular,
  ArrowUndo24Regular,
  ArrowRedo24Regular,
  BranchRegular,
  TableRegular,
  PaintBrushRegular,
  Settings24Regular,
  LocalLanguageRegular,
} from '@fluentui/react-icons';
import { Spinner } from '@fluentui/react-components';
import { useDesignerStore, selectCanUndo, selectCanRedo } from '@/state/designerStore';
import type { FormStatus } from '@/state/models/DesignerFormModel';

/** Command-bar icons sit at 16px; the 24px variants overwhelm a 34px command. */
const ICON_SIZE = 16;

interface CommandProps {
  label: string;
  title: string;
  icon: React.ReactElement;
  onClick: () => void;
  isPrimary?: boolean;
  isDisabled?: boolean;
  /** Icon-only, with the label carried by the accessible name. */
  isIconOnly?: boolean;
}

function Command({
  label,
  title,
  icon,
  onClick,
  isPrimary = false,
  isDisabled = false,
  isIconOnly = false,
}: CommandProps): React.ReactElement {
  return (
    <button
      type="button"
      className={isPrimary ? 'cmd primary' : 'cmd'}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={label}
    >
      {icon}
      {!isIconOnly && label}
    </button>
  );
}

interface DesignerCommandBarProps {
  formName: string;
  formStatus: FormStatus;
  isDirty: boolean;
  isSaving: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPreview: () => void;
  onOpenForm: () => void;
  onFormProperties: () => void;
  onVersionHistory: () => void;
  onBusinessRules: () => void;
  onSubmissionMapping: () => void;
  onThemeEditor: () => void;
  onTranslations: () => void;
  onBack: () => void;
}

export function DesignerCommandBar({
  formName,
  formStatus,
  isDirty,
  isSaving,
  onSaveDraft,
  onPublish,
  onPreview,
  onOpenForm,
  onFormProperties,
  onVersionHistory,
  onBusinessRules,
  onSubmissionMapping,
  onThemeEditor,
  onTranslations,
  onBack,
}: DesignerCommandBarProps): React.ReactElement {
  const canUndo = useDesignerStore(selectCanUndo);
  const canRedo = useDesignerStore(selectCanRedo);
  const undo = useDesignerStore(state => state.undo);
  const redo = useDesignerStore(state => state.redo);

  return (
    <div className="cmdbar" role="toolbar" aria-label="Form Designer Command Bar">
      <Command
        label="Back to Form List"
        title="Back to Form List"
        icon={<ArrowLeft24Regular fontSize={ICON_SIZE} />}
        onClick={onBack}
        isIconOnly
      />
      <span className="cmd-sep" />

      <span className="cmd-record">
        <span className="cmd-record-name">{formName}</span>
        <span className={`pill ${formStatus}`}>{formStatus}</span>
        {isDirty && <span className="cmd-dirty" title="Unsaved changes" aria-label="Unsaved changes" />}
      </span>
      <span className="cmd-sep" />

      <Command
        label="Undo"
        title="Undo (Ctrl+Z)"
        icon={<ArrowUndo24Regular fontSize={ICON_SIZE} />}
        onClick={undo}
        isDisabled={!canUndo}
        isIconOnly
      />
      <Command
        label="Redo"
        title="Redo (Ctrl+Y)"
        icon={<ArrowRedo24Regular fontSize={ICON_SIZE} />}
        onClick={redo}
        isDisabled={!canRedo}
        isIconOnly
      />
      <span className="cmd-sep" />

      <Command label="Preview" title="Preview form" icon={<Eye24Regular fontSize={ICON_SIZE} />} onClick={onPreview} />
      <Command
        label="Open"
        title="Open the published form in the runtime"
        icon={<Open24Regular fontSize={ICON_SIZE} />}
        onClick={onOpenForm}
      />
      <span className="cmd-sep" />

      <Command
        label="Form"
        title="Form properties (progress bar, summary mode, flow, …)"
        icon={<Settings24Regular fontSize={ICON_SIZE} />}
        onClick={onFormProperties}
      />
      <Command label="Rules" title="Business rules" icon={<BranchRegular fontSize={ICON_SIZE} />} onClick={onBusinessRules} />
      <Command
        label="Mapping"
        title="Submission mapping"
        icon={<TableRegular fontSize={ICON_SIZE} />}
        onClick={onSubmissionMapping}
      />
      <Command label="Theme" title="Theme editor" icon={<PaintBrushRegular fontSize={ICON_SIZE} />} onClick={onThemeEditor} />
      <Command
        label="Translations"
        title="Export labels for translation, and import them back"
        icon={<LocalLanguageRegular fontSize={ICON_SIZE} />}
        onClick={onTranslations}
      />
      <Command
        label="Version History"
        title="Version history"
        icon={<History24Regular fontSize={ICON_SIZE} />}
        onClick={onVersionHistory}
        isIconOnly
      />

      <span className="cmd-spacer" />

      <Command
        label={isSaving ? 'Saving…' : 'Save Draft'}
        title="Save this form as a draft"
        icon={isSaving ? <Spinner size="tiny" /> : <Save24Regular fontSize={ICON_SIZE} />}
        onClick={onSaveDraft}
        isDisabled={!isDirty || isSaving}
      />
      <Command
        label="Publish"
        title="Publish this form"
        icon={<Send24Regular fontSize={ICON_SIZE} />}
        onClick={onPublish}
        isDisabled={isSaving}
        isPrimary
      />
    </div>
  );
}
