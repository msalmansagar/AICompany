import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { buildValidationRules } from '../../utils/buildValidationRules';

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

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (query: string, onChange: (v: unknown) => void): Promise<void> => {
      if (!config || query.length < config.searchMin) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const token = isDevBypass || !account ? '' : await acquireToken();
        const params = new URLSearchParams({
          search: query,
          displayAttribute: config.displayAttr,
          valueAttribute: config.valueAttr,
          max: String(config.maxResults),
        });
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
    [config, isDevBypass, account, acquireToken]
  );

  function handleTextChange(
    text: string,
    onChange: (v: unknown) => void
  ): void {
    setSearchText(text);
    if (!text) {
      onChange(null);
      setResults([]);
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void search(text, onChange), 300);
  }

  function selectResult(
    result: LookupResult,
    onChange: (v: unknown) => void
  ): void {
    const value: LookupValue = { id: result.id, displayName: result.displayName };
    onChange(value);
    setSearchText(result.displayName);
    setResults([]);
  }

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selectedName =
          value && typeof value === 'object' && 'displayName' in value
            ? (value as LookupValue).displayName
            : undefined;

        const inputText = selectedName ?? searchText;

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {field.isRequiredDefault && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            <View style={[styles.inputRow, error && styles.inputRowError]}>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={(text) => handleTextChange(text, onChange)}
                placeholder={`Search ${field.displayLabel.toLowerCase()}…`}
                placeholderTextColor="#999"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {isSearching && (
                <ActivityIndicator size="small" color="#0078d4" style={styles.spinner} />
              )}
            </View>

            {results.length > 0 && (
              <View style={styles.dropdown}>
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.resultRow}
                      onPress={() => selectResult(item, onChange)}
                    >
                      <Text style={styles.resultText}>{item.displayName}</Text>
                    </Pressable>
                  )}
                />
              </View>
            )}

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  inputRowError: { borderColor: '#d32f2f' },
  input: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#1a1a2e' },
  spinner: { marginLeft: 8 },
  dropdown: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultText: { fontSize: 14, color: '#1a1a2e' },
});
