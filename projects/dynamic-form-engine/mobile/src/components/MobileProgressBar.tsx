// DFE-FBE-002 (mobile) — form-completion progress bar shown above the tab bar.
import { StyleSheet, Text, View } from 'react-native';
import { useWatch, type Control } from 'react-hook-form';
import type { FormDefinition } from '@qdb/shared';
import { useMobileFormContext } from '../context/MobileFormContext';
import { computeMobileCompletion } from './formCompletion';

interface Props {
  form: FormDefinition;
  control: Control<Record<string, unknown>>;
}

export function MobileProgressBar({ form, control }: Props) {
  const { ruleState } = useMobileFormContext();
  const values = useWatch({ control }) as Record<string, unknown>;
  const { percent, filled, total } = computeMobileCompletion(form, values, ruleState);

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Completion</Text>
        <Text style={styles.percent}>{percent}%{total > 0 ? ` · ${filled}/${total}` : ''}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 12, color: '#666' },
  percent: { fontSize: 12, color: '#1a1a2e', fontWeight: '600' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e8e8e8', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#0078d4' },
});
