// ScopedButtonsPanel — DFE-BTN-001 designer write path. Authors tab/section
// scoped buttons (list / add / edit / delete) against qdb_form_scoped_button.
// v1 offers the in-form/submit button types; gated actions (CallApi, External
// URL, Another Form — G-1) are intentionally not offered here yet.

import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  Button,
  Input,
  Select,
  Spinner,
  Switch,
  Text,
  MessageBar,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Add16Regular, Delete16Regular } from '@fluentui/react-icons';
import { CrmContext } from '@/app/App';
import { useDesignerStore } from '@/state/designerStore';
import {
  ScopedButtonDesignService,
  type ScopedButtonRecord,
} from '@/services/ScopedButtonDesignService';
import type { ButtonPlacementScope, ScopedButtonActionType } from '@qdb/shared';

interface ButtonType {
  key: string;
  label: string;
  actionType: ScopedButtonActionType;
  config: string;
}

const BUTTON_TYPES: ButtonType[] = [
  { key: 'nextStep', label: 'Navigate: Next step', actionType: 'navigate', config: '{"target":"nextStep"}' },
  { key: 'previousStep', label: 'Navigate: Previous step', actionType: 'navigate', config: '{"target":"previousStep"}' },
  { key: 'finalSubmit', label: 'Final submit', actionType: 'finalSubmit', config: '{"extraParams":[]}' },
  { key: 'saveDraft', label: 'Save draft', actionType: 'saveDraft', config: '{}' },
];

function typeKeyOf(button: ScopedButtonRecord): string {
  if (button.actionType === 'finalSubmit') return 'finalSubmit';
  if (button.actionType === 'saveDraft') return 'saveDraft';
  try {
    return (JSON.parse(button.actionConfigJson) as { target?: string }).target === 'previousStep'
      ? 'previousStep'
      : 'nextStep';
  } catch {
    return 'nextStep';
  }
}

const useStyles = makeStyles({
  panel: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  rowTop: { display: 'flex', gap: '6px', alignItems: 'center' },
  rowToggles: { display: 'flex', gap: '12px', alignItems: 'center' },
  grow: { flex: 1 },
  empty: { color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
});

interface ScopedButtonsPanelProps {
  scope: ButtonPlacementScope;
  placementId: string;
}

export function ScopedButtonsPanel({ scope, placementId }: ScopedButtonsPanelProps): React.ReactElement {
  const styles = useStyles();
  const crmContext = useContext(CrmContext);
  const formDefinitionId = useDesignerStore(state => state.form?.id ?? '');

  const [service] = useState(() => (crmContext ? new ScopedButtonDesignService(crmContext.getWebApi()) : null));
  const [buttons, setButtons] = useState<ScopedButtonRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    setError(null);
    try {
      setButtons(await service.listByPlacement(scope, placementId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buttons');
    } finally {
      setIsLoading(false);
    }
  }, [service, scope, placementId]);

  useEffect(() => { void load(); }, [load]);

  const addButton = useCallback(async () => {
    if (!service) return;
    setIsBusy(true);
    setError(null);
    try {
      const nextOrder = buttons.reduce((max, b) => Math.max(max, b.displayOrder), -1) + 1;
      await service.create({
        formDefinitionId,
        placementScope: scope,
        placementId,
        label: 'New button',
        displayOrder: nextOrder,
        isPrimary: false,
        isVisible: true,
        actionType: 'navigate',
        actionConfigJson: '{"target":"nextStep"}',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add button');
    } finally {
      setIsBusy(false);
    }
  }, [service, buttons, formDefinitionId, scope, placementId, load]);

  const patch = useCallback(
    async (id: string, change: Parameters<ScopedButtonDesignService['update']>[1]) => {
      if (!service) return;
      setError(null);
      try {
        await service.update(id, change);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update button');
      }
    },
    [service, load],
  );

  const removeButton = useCallback(
    async (id: string) => {
      if (!service) return;
      setError(null);
      try {
        await service.remove(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete button');
      }
    },
    [service, load],
  );

  if (isLoading) return <Spinner size="tiny" label="Loading buttons…" />;

  return (
    <div className={styles.panel}>
      {error && <MessageBar intent="error">{error}</MessageBar>}

      {buttons.length === 0 && <Text className={styles.empty}>No buttons on this {scope} yet.</Text>}

      {buttons.map(button => {
        const typeKey = typeKeyOf(button);
        return (
          <div key={button.id} className={styles.row}>
            <div className={styles.rowTop}>
              <Input
                className={styles.grow}
                value={button.label}
                onChange={(_, data) =>
                  setButtons(prev => prev.map(b => (b.id === button.id ? { ...b, label: data.value } : b)))
                }
                onBlur={() => void patch(button.id, { label: button.label })}
                aria-label="Button label"
              />
              <Button
                icon={<Delete16Regular />}
                appearance="subtle"
                onClick={() => void removeButton(button.id)}
                aria-label="Delete button"
              />
            </div>
            <Select
              value={typeKey}
              onChange={(_, data) => {
                const t = BUTTON_TYPES.find(x => x.key === data.value);
                if (t) void patch(button.id, { actionType: t.actionType, actionConfigJson: t.config });
              }}
              aria-label="Button type"
            >
              {BUTTON_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </Select>
            <div className={styles.rowToggles}>
              <Switch
                label="Primary"
                checked={button.isPrimary}
                onChange={(_, data) => void patch(button.id, { isPrimary: data.checked })}
              />
              <Switch
                label="Visible"
                checked={button.isVisible}
                onChange={(_, data) => void patch(button.id, { isVisible: data.checked })}
              />
            </div>
          </div>
        );
      })}

      <Button icon={<Add16Regular />} appearance="secondary" disabled={isBusy || !service} onClick={() => void addButton()}>
        Add button
      </Button>
    </div>
  );
}
