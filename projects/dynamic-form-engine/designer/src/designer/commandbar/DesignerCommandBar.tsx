import React from 'react';
import {
  Button,
  Text,
  Badge,
  makeStyles,
  tokens,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Tooltip,
  Spinner,
} from '@fluentui/react-components';
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
} from '@fluentui/react-icons';
import { useDesignerStore, selectCanUndo, selectCanRedo } from '@/state/designerStore';
import type { FormStatus } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  commandBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    gap: '8px',
    minHeight: '48px',
  },
  formNameArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  dirtyIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorPaletteMarigoldBackground3,
  },
  statusBadge: {
    textTransform: 'capitalize',
  },
  rightActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

interface DesignerCommandBarProps {
  formName: string;
  formStatus: FormStatus;
  isDirty: boolean;
  isSaving: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onPreview: () => void;
  onOpenForm: () => void;
  onVersionHistory: () => void;
  onBusinessRules: () => void;
  onSubmissionMapping: () => void;
  onThemeEditor: () => void;
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
  onVersionHistory,
  onBusinessRules,
  onSubmissionMapping,
  onThemeEditor,
  onBack,
}: DesignerCommandBarProps): React.ReactElement {
  const styles = useStyles();
  const canUndo = useDesignerStore(selectCanUndo);
  const canRedo = useDesignerStore(selectCanRedo);
  const undo = useDesignerStore(state => state.undo);
  const redo = useDesignerStore(state => state.redo);

  return (
    <div className={styles.commandBar} role="toolbar" aria-label="Form Designer Command Bar">
      <Toolbar>
        <Tooltip content="Back to Form List" relationship="label">
          <ToolbarButton
            icon={<ArrowLeft24Regular />}
            onClick={onBack}
            aria-label="Back to Form List"
          />
        </Tooltip>
        <ToolbarDivider />
        <div className={styles.formNameArea}>
          <Text weight="semibold" size={400}>{formName}</Text>
          <Badge
            appearance={formStatus === 'published' ? 'filled' : 'outline'}
            color={formStatus === 'published' ? 'success' : 'warning'}
            className={styles.statusBadge}
          >
            {formStatus}
          </Badge>
          {isDirty && (
            <Tooltip content="Unsaved changes" relationship="label">
              <div className={styles.dirtyIndicator} aria-label="Unsaved changes" />
            </Tooltip>
          )}
        </div>
        <ToolbarDivider />
        <Tooltip content="Undo (Ctrl+Z)" relationship="label">
          <ToolbarButton
            icon={<ArrowUndo24Regular />}
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
          />
        </Tooltip>
        <Tooltip content="Redo (Ctrl+Y)" relationship="label">
          <ToolbarButton
            icon={<ArrowRedo24Regular />}
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
          />
        </Tooltip>
        <ToolbarDivider />
        <Tooltip content="Preview Form" relationship="label">
          <ToolbarButton icon={<Eye24Regular />} onClick={onPreview} aria-label="Preview">
            Preview
          </ToolbarButton>
        </Tooltip>
        <Tooltip content="Open the published form in the runtime" relationship="label">
          <ToolbarButton icon={<Open24Regular />} onClick={onOpenForm} aria-label="Open Form">
            Open
          </ToolbarButton>
        </Tooltip>
        <ToolbarDivider />
        <Tooltip content="Business Rules" relationship="label">
          <ToolbarButton icon={<BranchRegular />} onClick={onBusinessRules} aria-label="Business Rules">
            Rules
          </ToolbarButton>
        </Tooltip>
        <Tooltip content="Submission Mapping" relationship="label">
          <ToolbarButton icon={<TableRegular />} onClick={onSubmissionMapping} aria-label="Submission Mapping">
            Mapping
          </ToolbarButton>
        </Tooltip>
        <Tooltip content="Theme Editor" relationship="label">
          <ToolbarButton icon={<PaintBrushRegular />} onClick={onThemeEditor} aria-label="Theme Editor">
            Theme
          </ToolbarButton>
        </Tooltip>
        <ToolbarDivider />
        <Tooltip content="Version History" relationship="label">
          <ToolbarButton icon={<History24Regular />} onClick={onVersionHistory} aria-label="Version History" />
        </Tooltip>
      </Toolbar>

      <div className={styles.rightActions}>
        <Button
          appearance="outline"
          icon={isSaving ? <Spinner size="tiny" /> : <Save24Regular />}
          onClick={onSaveDraft}
          disabled={!isDirty || isSaving}
          aria-label="Save Draft"
        >
          {isSaving ? 'Saving...' : 'Save Draft'}
        </Button>
        <Button
          appearance="primary"
          icon={<Send24Regular />}
          onClick={onPublish}
          disabled={isSaving}
          aria-label="Publish Form"
        >
          Publish
        </Button>
      </div>
    </div>
  );
}
