// DFE-FBE-002 (mobile) — multi-select lookup. Array value; modal search toggles membership.
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { apiGet } from '../../services/apiClient';
import { useMsal } from '../../auth/MsalProvider';
import { useDevBypass } from '../../context/DevBypassContext';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface LookupResult { id: string; displayName: string }
interface ParsedConfig { entity: string; displayAttr: string; valueAttr: string; searchMin: number; maxResults: number }

function parseLookupConfig(raw: string | undefined): ParsedConfig | null {
  if (!raw) return null;
  const p = raw.split('|');
  if (p.length < 3) return null;
  return { entity: p[0], displayAttr: p[1], valueAttr: p[2], searchMin: parseInt(p[3] ?? '2', 10), maxResults: parseInt(p[4] ?? '10', 10) };
}

interface Props { field: FieldDefinition; control: Control<Record<string, unknown>> }

export function FormMultiLookupField({ field, control }: Props) {
  const { acquireToken, account } = useMsal();
  const { isDevBypass } = useDevBypass();
  const config = parseLookupConfig(field.lookupEntity);

  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (query?: string): Promise<void> => {
    if (!config) return;
    setIsSearching(true);
    try {
      const token = isDevBypass || !account ? '' : await acquireToken();
      const params = new URLSearchParams({ displayAttribute: config.displayAttr, valueAttribute: config.valueAttr, max: String(config.maxResults) });
      if (query) params.set('search', query);
      const data = await apiGet<LookupResult[]>(`/api/lookups/${config.entity}?${params.toString()}`, token);
      setResults(data ?? []);
    } catch { setResults([]); } finally { setIsSearching(false); }
  }, [config, isDevBypass, account, acquireToken]);

  function handleSearchChange(text: string): void {
    setSearchText(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (!text) { void fetchResults(); return; }
    if (!config || text.length < config.searchMin) return;
    debounce.current = setTimeout(() => void fetchResults(text), 300);
  }

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selected: LookupResult[] = Array.isArray(value) ? (value as LookupResult[]) : [];
        const ids = new Set(selected.map((s) => s.id));
        const toggle = (r: LookupResult) =>
          onChange(ids.has(r.id) ? selected.filter((s) => s.id !== r.id) : [...selected, { id: r.id, displayName: r.displayName }]);
        const remove = (id: string) => onChange(selected.filter((s) => s.id !== id));

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}{isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            {selected.length > 0 && (
              <View style={styles.chips}>
                {selected.map((s) => (
                  <View key={s.id} style={styles.chip}>
                    <Text style={styles.chipText}>{s.displayName}</Text>
                    <Pressable onPress={() => remove(s.id)} hitSlop={8}><Text style={styles.chipX}>✕</Text></Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              style={[fieldStyles.input, styles.trigger, error && fieldStyles.inputError]}
              onPress={() => { setSearchText(''); setOpen(true); void fetchResults(); }}
            >
              <Text style={styles.placeholder}>{selected.length > 0 ? 'Add more…' : `Select ${field.displayLabel.toLowerCase()}`}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}

            <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
              <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{field.displayLabel} ({selected.length})</Text>
                  <Pressable onPress={() => setOpen(false)}><Text style={styles.closeButton}>Done</Text></Pressable>
                </View>
                <View style={styles.searchRow}>
                  <TextInput style={styles.searchInput} value={searchText} onChangeText={handleSearchChange} placeholder="Search..." placeholderTextColor="#999" autoCorrect={false} autoCapitalize="none" />
                  {isSearching && <ActivityIndicator size="small" color="#0078d4" style={{ marginLeft: 8 }} />}
                </View>
                {!isSearching && results.length === 0 && (
                  <View style={styles.emptyState}><Text style={styles.emptyText}>{searchText ? 'No results found' : 'No records available'}</Text></View>
                )}
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSel = ids.has(item.id);
                    return (
                      <Pressable style={[styles.option, isSel && styles.optionSelected]} onPress={() => toggle(item)}>
                        <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>{item.displayName}</Text>
                        {isSel && <Text style={styles.checkmark}>✓</Text>}
                      </Pressable>
                    );
                  }}
                />
              </View>
            </Modal>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0f7ff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: '#0078d4', fontSize: 13 },
  chipX: { color: '#0078d4', fontSize: 13, fontWeight: '600' },
  trigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeholder: { fontSize: 15, color: '#999', flex: 1 },
  chevron: { fontSize: 18, color: '#666', transform: [{ rotate: '90deg' }], marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  closeButton: { fontSize: 15, color: '#0078d4', fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, backgroundColor: '#f9f9f9' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#1a1a2e' },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#999' },
  option: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  optionSelected: { backgroundColor: '#f0f7ff' },
  optionText: { fontSize: 15, color: '#1a1a2e', flex: 1 },
  optionTextSelected: { color: '#0078d4', fontWeight: '600' },
  checkmark: { color: '#0078d4', fontSize: 16, marginLeft: 8 },
});
