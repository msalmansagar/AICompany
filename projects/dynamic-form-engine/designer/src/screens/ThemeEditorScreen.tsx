import React, { useCallback } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { useDesignerStore } from '@/state/designerStore';
import { StyleTabContainer } from './style/StyleTabContainer';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: tokens.colorNeutralBackground3 },
  topBar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  body: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
});

/** ThemeEditorScreen — navigation shell. All editing logic lives in StyleTabContainer and its panels. */
export function ThemeEditorScreen(): React.ReactElement {
  const styles = useStyles();
  const navigateTo = useDesignerStore(s => s.navigateTo);
  const selectedId = useDesignerStore(s => s.selectedId);
  const selectedType = useDesignerStore(s => s.selectedType);

  const handleBack = useCallback(() => navigateTo('designer'), [navigateTo]);

  const activeSectionId = selectedType === 'section' ? selectedId : null;
  const activeFieldId = selectedType === 'field' ? selectedId : null;

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={handleBack} aria-label="Back to designer">
          Back to Designer
        </Button>
        <Text size={400} weight="semibold">Style Editor</Text>
      </div>
      <div className={styles.body}>
        <StyleTabContainer activeSectionId={activeSectionId} activeFieldId={activeFieldId} />
      </div>
    </div>
  );
}
