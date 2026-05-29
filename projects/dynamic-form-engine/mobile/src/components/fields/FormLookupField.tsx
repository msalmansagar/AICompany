import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/form-engine-shared';
import { fieldStyles } from './fieldStyles';
import { apiGet } from '../../services/apiClient';
import { useMsal } from '../../auth/MsalProvider';
import { useDevBypass } from '../../context/DevBypassContext';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface LookupResult {
  id: string;
  displayName: string;
}

interface LookupValue {
  id: string;
  displayName: string;
}

interface ParsedConfig {
  entity: string;
  displayAttr: string;
  valueAttr: string;
  searchMin: number;
  maxResults: number;
}

function parseLookupConfig(raw: string | undefined): ParsedConfig | null {
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length < 3) return null;
  return {
    entity: parts[0],
    displayAttr: parts[1],
    valueAttr: parts[2],
    searchMin: parseInt(parts[3] ?? '2', 10),
    maxResults: parseInt(parts[4] ?? '10', 10),
  };
}

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormLookupField({ field, control }: Props) {
  const { acquireToken, account } = useMsal();
  const { isDevBypass } = useDevBypass();
  const config = parseLookupConfig(field.lookupEntity);

  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(
    async (query?: string): Promise<void> => {
      if (!config) return;
      setIsSearching(true);
      try {
        const token = isDevBypass || !account ? '' : await acquireToken();
        const params = new URLSearchParams({
          displayAttribute: config.displayAttr,
          valueAttribute: config.valueAttr,
          max: String(config.maxResults),
        });
        if (query) params.set('search', query);
        const data = await apiGet<LookupResult[]>(
          `/api/lookups/${config.entity}?${params.toString()}`,
          token
        );
        setResults(data ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [config, isDevBypass, account, acquireToken],
  );

  function openSheet(): void {
    setSearchText('');
    setOpen(true);
    void fetchResults();
  }

  function closeSheet(): void {
    setOpen(false);
    setSearchText('');
    setResults([]);
  }

  function handleSearchChange(text: string): void {
    setSearchText(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!text) {
      void fetchResults();
      return;
    }
    if (!config || text.length < config.searchMin) return;
    debounceTimer.current = setTimeout(() => void fetchResults(text), 300);
  }

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const currentValue =
          value && typeof value === 'object' && 'id' in value
            ? (value as LookupValue)
            : null;

        function selectResult(result: LookupResult): void {
          onChange({ id: result.id, displayName: result.displayName } satisfies LookupValue);
          closeSheet();
        }

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            <Pressable
              style={[fieldStyles.input, styles.trigger, error && fieldStyles.inputError]}
              onPress={openSheet}
            >
              <Text style={currentValue ? styles.selectedText : styles.placeholder} numberOfLines={1}>
                {currentValue
                  ? currentValue.displayName
                  : `Select ${field.displayLabel.toLowerCase()}`}
              </Text>
              {currentValue ? (
                <Pressable
                  style={styles.clearBtn}
                  onPress={() => onChange(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearBtnText}>✕</Text>
                </Pressable>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}

            <Modal visible={open} transparent animationType="slide" onRequestClose={closeSheet}>
              <Pressable style={styles.backdrop} onPress={closeSheet} />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{field.displayLabel}</Text>
                  <Pressable onPress={closeSheet}>
                    <Text style={styles.closeButton}>Done</Text>
                  </Pressable>
                </View>

                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchText}
                    onChangeText={handleSearchChange}
                    placeholder="Search..."
                    placeholderTextColor="#999"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {isSearching && (
                    <ActivityIndicator size="small" color="#0078d4" style={styles.searchSpinner} />
                  )}
                </View>

                {!isSearching && results.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                      {searchText ? 'No results found' : 'No records available'}
                    </Text>
                  </View>
                )}

                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const isSelected = currentValue?.id === item.id;
                    return (
                      <Pressable
                        style={[styles.option, isSelected && styles.optionSelected]}
                        onPress={() => selectResult(item)}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                          {item.displayName}
                        </Text>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
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
  trigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedText: { fontSize: 15, color: '#1a1a2e', flex: 1 },
  placeholder: { fontSize: 15, color: '#999', flex: 1 },
  chevron: { fontSize: 18, color: '#666', transform: [{ rotate: '90deg' }], marginLeft: 8 },
  clearBtn: { marginLeft: 8, padding: 2 },
  clearBtnText: { fontSize: 14, color: '#999', fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  closeButton: { fontSize: 15, color: '#0078d4', fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a2e',
  },
  searchSpinner: { marginLeft: 8 },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#999' },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionSelected: { backgroundColor: '#f0f7ff' },
  optionText: { fontSize: 15, color: '#1a1a2e', flex: 1 },
  optionTextSelected: { color: '#0078d4', fontWeight: '600' },
  checkmark: { color: '#0078d4', fontSize: 16, marginLeft: 8 },
});
