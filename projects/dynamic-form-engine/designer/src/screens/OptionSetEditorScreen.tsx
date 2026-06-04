import React, { useCallback, useState } from 'react';
import {
  Button,
  Checkbox,
  Field,
  Input,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowDownRegular,
  ArrowLeftRegular,
  ArrowUpRegular,
  CheckmarkRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import type { DesignerOptionValue } from '@/state/models/DesignerFormModel';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '760px',
    margin: '0 auto',
    width: '100%',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 1fr 120px 48px',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    alignItems: 'center',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 1fr 120px 48px',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '4px',
    alignItems: 'center',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: '4px',
  },
  orderButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  columnLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '4px',
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
  },
});

function generateOptionId(): string {
  return `tmp_opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildNewOption(sortOrder: number): DesignerOptionValue {
  return { id: generateOptionId(), label: '', value: '', sortOrder, isDefault: false };
}

interface OptionRowProps {
  option: DesignerOptionValue;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<DesignerOptionValue>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function OptionRow({ option, isFirst, isLast, onChange, onDelete, onMoveUp, onMoveDown }: OptionRowProps): React.ReactElement {
  const styles = useStyles();

  function handleLabelChange(_: React.ChangeEvent<HTMLInputElement>, data: { value: string }): void {
    const autoValue = option.value || data.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    onChange({ label: data.value, value: option.value ? option.value : autoValue });
  }

  return (
    <div className={styles.tableRow} role="row">
      <div className={styles.orderButtons}>
        <Button
          size="small"
          appearance="subtle"
          icon={<ArrowUpRegular />}
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Move option up"
          style={{ minWidth: 0, padding: '2px' }}
        />
        <Button
          size="small"
          appearance="subtle"
          icon={<ArrowDownRegular />}
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Move option down"
          style={{ minWidth: 0, padding: '2px' }}
        />
      </div>
      <Field>
        <Input
          value={option.label}
          onChange={handleLabelChange}
          placeholder="Option label"
          aria-label="Option label"
        />
      </Field>
      <Field>
        <Input
          value={option.value}
          onChange={(_, data) => onChange({ value: data.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          placeholder="option_value"
          style={{ fontFamily: 'monospace' }}
          aria-label="Option value"
        />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox
          checked={option.isDefault}
          onChange={(_, data) => onChange({ isDefault: data.checked === true })}
          aria-label="Set as default"
        />
      </div>
      <Button
        size="small"
        appearance="subtle"
        icon={<DeleteRegular />}
        onClick={onDelete}
        aria-label="Delete option"
      />
    </div>
  );
}

export function OptionSetEditorScreen(): React.ReactElement {
  const styles = useStyles();

  const navigateTo = useDesignerStore(s => s.navigateTo);
  const selectedId = useDesignerStore(s => s.selectedId);
  const field = useDesignerStore(s => (selectedId ? s.fields[selectedId] : null));
  const updateField = useDesignerStore(s => s.updateField);

  const [options, setOptions] = useState<DesignerOptionValue[]>(
    () => (field?.options ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [isDirty, setIsDirty] = useState(false);

  const handleBack = useCallback(() => {
    navigateTo('designer');
  }, [navigateTo]);

  const handleAddOption = useCallback(() => {
    const newOption = buildNewOption(options.length);
    setOptions(prev => [...prev, newOption]);
    setIsDirty(true);
  }, [options.length]);

  const handleChange = useCallback((id: string, patch: Partial<DesignerOptionValue>) => {
    setOptions(prev => prev.map(opt => (opt.id === id ? { ...opt, ...patch } : opt)));
    setIsDirty(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setOptions(prev => {
      const filtered = prev.filter(opt => opt.id !== id);
      return filtered.map((opt, i) => ({ ...opt, sortOrder: i }));
    });
    setIsDirty(true);
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setOptions(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      return next.map((opt, i) => ({ ...opt, sortOrder: i }));
    });
    setIsDirty(true);
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setOptions(prev => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      return next.map((opt, i) => ({ ...opt, sortOrder: i }));
    });
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedId) return;
    updateField(selectedId, { options });
    setIsDirty(false);
  }, [selectedId, updateField, options]);

  if (!field) {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack}>
            Back to Designer
          </Button>
        </div>
        <div className={styles.body}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>No field selected. Return to the designer and select a field first.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack}>
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Option Set Editor</Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
          — {field.label || field.code}
        </Text>
      </div>

      <div className={styles.body}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text size={300}>
            {options.length} option{options.length !== 1 ? 's' : ''} defined
          </Text>
          <Button appearance="primary" icon={<AddRegular />} onClick={handleAddOption}>
            Add Option
          </Button>
        </div>

        {options.length === 0 ? (
          <div className={styles.emptyState}>
            <Text size={300}>No options yet. Click "Add Option" to create the first one.</Text>
          </div>
        ) : (
          <div role="table" aria-label="Option values">
            <div className={styles.tableHeader} role="row">
              <span className={styles.columnLabel}>Order</span>
              <span className={styles.columnLabel}>Label</span>
              <span className={styles.columnLabel}>Value</span>
              <span className={styles.columnLabel} style={{ textAlign: 'center' }}>Default</span>
              <span />
            </div>

            {options.map((option, index) => (
              <OptionRow
                key={option.id}
                option={option}
                isFirst={index === 0}
                isLast={index === options.length - 1}
                onChange={patch => handleChange(option.id, patch)}
                onDelete={() => handleDelete(option.id)}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
              />
            ))}
          </div>
        )}

        <div className={styles.actionBar}>
          <Button appearance="subtle" onClick={handleBack}>Cancel</Button>
          <Button
            appearance="primary"
            icon={<CheckmarkRegular />}
            onClick={handleSave}
            disabled={!isDirty}
          >
            Save Options
          </Button>
        </div>
      </div>
    </div>
  );
}
