import React from 'react';
import {
  Checkbox,
  Field,
  Input,
  makeStyles,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
});

interface TabPropertiesProps {
  tabId: string;
}

export function TabProperties({ tabId }: TabPropertiesProps): React.ReactElement {
  const styles = useStyles();
  const tab = useDesignerStore(state => state.tabs[tabId]);
  const updateTab = useDesignerStore(state => state.updateTab);

  if (!tab) return <></>;

  return (
    <div className={styles.form}>
      <Field label="Tab Label" required>
        <Input
          value={tab.label}
          onChange={(_, data) => updateTab(tabId, { label: data.value })}
          placeholder="e.g. Personal Information"
        />
      </Field>

      <Field label="Icon Name" hint="Fluent UI icon name (e.g. Contact, Money, Document)">
        <Input
          value={tab.iconName ?? ''}
          onChange={(_, data) => updateTab(tabId, { iconName: data.value || null })}
          placeholder="e.g. Contact"
        />
      </Field>

      <Checkbox
        label="Visible by default"
        checked={tab.isVisible}
        onChange={(_, data) => updateTab(tabId, { isVisible: data.checked === true })}
      />

      <Checkbox
        label="Require previous tab complete"
        checked={tab.requiresPreviousTabComplete}
        onChange={(_, data) =>
          updateTab(tabId, { requiresPreviousTabComplete: data.checked === true })
        }
      />
    </div>
  );
}
