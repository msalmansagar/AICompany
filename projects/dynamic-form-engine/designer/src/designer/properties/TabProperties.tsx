import React from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Checkbox,
  Divider,
  Field,
  Input,
  Switch,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { TranslationsPanel } from '@/designer/properties/panels/TranslationsPanel';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  columnButtons: { display: 'flex', gap: '4px' },
  columnBtn: {
    minWidth: '32px',
    padding: '2px 8px',
  },
  sectionHeading: {
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
});

interface TabPropertiesProps {
  tabId: string;
}

export function TabProperties({ tabId }: TabPropertiesProps): React.ReactElement {
  const styles = useStyles();
  const tab = useDesignerStore(state => state.tabs[tabId]);
  const updateTab = useDesignerStore(state => state.updateTab);
  const sectionIds = useDesignerStore(state => state.sectionOrder[tabId] ?? []);
  const sections = useDesignerStore(state => state.sections);
  const updateSection = useDesignerStore(state => state.updateSection);
  const formCode = useDesignerStore(state => state.form?.code ?? '');

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

      <Field
        hint="When enabled, the navigation bar is hidden while this tab is active. All sections and fields on this tab still render normally."
      >
        <Switch
          label="Hide tab bar (show tab content full-screen)"
          checked={tab.hideTabBar}
          onChange={(_, data) => updateTab(tabId, { hideTabBar: data.checked })}
        />
      </Field>

      {sectionIds.length > 0 && (
        <>
          <Divider />
          <Text size={100} weight="semibold" className={styles.sectionHeading}>Section Layouts</Text>
          {sectionIds.map(sectionId => {
            const section = sections[sectionId];
            if (!section) return null;
            return (
              <div key={sectionId} className={styles.sectionRow}>
                <Text size={200} truncate style={{ flex: 1, marginRight: 8 }}>
                  {section.label || 'Untitled Section'}
                </Text>
                <div className={styles.columnButtons}>
                  {([1, 2, 3] as const).map(col => (
                    <Button
                      key={col}
                      size="small"
                      appearance={section.columnCount === col ? 'primary' : 'outline'}
                      className={styles.columnBtn}
                      onClick={() => updateSection(sectionId, { columnCount: col })}
                      aria-label={`${col} column${col > 1 ? 's' : ''}`}
                      aria-pressed={section.columnCount === col}
                    >
                      {col}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      <Divider />
      <Accordion collapsible>
        <AccordionItem value="translations">
          <AccordionHeader>Translations</AccordionHeader>
          <AccordionPanel>
            <TranslationsPanel
              entityName="qdb_form_tab"
              recordId={tabId}
              entityLabel="Tab"
              formCode={formCode}
            />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
