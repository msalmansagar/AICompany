import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { FormDefinition, FieldDefinition } from '@qdb/shared';

interface Props {
  form: FormDefinition;
  values: Record<string, unknown>;
  isSubmitting: boolean;
  onBack: () => void;
  onEditTab: (tabIndex: number) => void;
  onSubmit: () => void;
}

export function FormSummaryScreen({
  form,
  values,
  isSubmitting,
  onBack,
  onEditTab,
  onSubmit,
}: Props) {
  const tabs = [...form.tabs].sort((a, b) => a.displayOrder - b.displayOrder);

  let requiredFilled = 0;
  let requiredTotal = 0;

  for (const tab of tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        if (field.fieldType === 'info-card') continue;
        if (!field.isRequiredDefault) continue;
        requiredTotal++;
        const val = values[field.fieldKey];
        if (val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0)) requiredFilled++;
      }
    }
  }

  const allRequiredFilled = requiredFilled === requiredTotal;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Review your answers</Text>
        <View style={[styles.badge, allRequiredFilled ? styles.badgeSuccess : styles.badgeWarning]}>
          <Text style={styles.badgeText}>
            {requiredFilled}/{requiredTotal} required filled
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tabs.map((tab, tabIndex) => {
          const sections = [...tab.sections].sort((a, b) => a.displayOrder - b.displayOrder);

          const tabHasFilledFields = sections.some((section) =>
            section.fields.some((f) => {
              if (f.fieldType === 'info-card') return false;
              const val = values[f.fieldKey];
              return val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0);
            }),
          );

          if (!tabHasFilledFields) return null;

          return (
            <View key={tab.tabId} style={styles.tabBlock}>
              <View style={styles.tabHeader}>
                <Text style={styles.tabTitle}>{tab.displayLabel}</Text>
                <Pressable
                  style={styles.editButton}
                  onPress={() => onEditTab(tabIndex)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${tab.displayLabel}`}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
              </View>

              {sections.map((section) => {
                const filledFields = section.fields
                  .filter((f) => {
                    if (f.fieldType === 'info-card') return false;
                    const val = values[f.fieldKey];
                    return val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && val.length === 0);
                  })
                  .sort((a, b) => a.displayOrder - b.displayOrder);

                if (filledFields.length === 0) return null;

                return (
                  <View key={section.sectionId} style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>{section.displayLabel}</Text>
                    {filledFields.map((field) => (
                      <View key={field.fieldId} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{field.displayLabel}</Text>
                        <Text style={styles.fieldValue}>
                          {formatFieldValue(field, values[field.fieldKey])}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={styles.secondaryButton}
          onPress={onBack}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Edit Responses"
        >
          <Text style={styles.secondaryButtonText}>Edit Responses</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryButton, (isSubmitting || !allRequiredFilled) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting || !allRequiredFilled}
          accessibilityRole="button"
          accessibilityLabel={isSubmitting ? 'Submitting' : 'Submit'}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(value: unknown, includeTime = false): string {
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return includeTime ? d.toLocaleString() : d.toLocaleDateString();
}

function extractRowValues(row: unknown): Record<string, unknown> {
  if (row === null || typeof row !== 'object') return {};
  const r = row as Record<string, unknown>;
  if (r['values'] && typeof r['values'] === 'object') return r['values'] as Record<string, unknown>;
  return r;
}

function formatFieldValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value) && value.length === 0) return '—';

  switch (field.fieldType) {
    case 'checkbox':
    case 'boolean':
      return Boolean(value) ? 'Yes' : 'No';

    case 'dropdown':
    case 'radio': {
      const opt = field.optionValues?.find((o) => o.value === String(value));
      return opt?.label ?? String(value);
    }

    case 'multiselect': {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        selected.map((v) => field.optionValues?.find((o) => o.value === v)?.label ?? v).join(', ') ||
        'None selected'
      );
    }

    case 'number': {
      const num = Number(value);
      return isNaN(num) ? String(value) : num.toLocaleString();
    }

    case 'decimal': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const dp = field.decimalPlaces ?? 2;
      return num.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
    }

    case 'currency': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const code = field.currencySymbol ?? 'USD';
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(num);
    }

    case 'date':
      return formatDate(value, false);

    case 'datetime':
      return formatDate(value, true);

    case 'file': {
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === 'object' &&
        value[0] !== null &&
        'fileName' in (value[0] as object)
      ) {
        const refs = value as Array<{ fileId: string; fileName: string; sizeBytes: number }>;
        return refs.map((r) => `${r.fileName} (${formatFileSize(r.sizeBytes)})`).join('\n');
      }
      return `${Array.isArray(value) ? value.length : 1} file(s)`;
    }

    case 'grid':
    case 'interactive-grid': {
      const rows = Array.isArray(value) ? value : [];
      if (rows.length === 0) return '—';

      const cols = [...(field.gridConfig?.columnConfigs ?? [])]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .slice(0, 4);

      if (cols.length === 0) {
        const isSelection = field.gridConfig?.mode === 'selection';
        return `${rows.length} ${isSelection ? 'record' : 'row'}${rows.length !== 1 ? 's' : ''} ${isSelection ? 'selected' : 'entered'}`;
      }

      const displayRows = rows.slice(0, 5);
      const overflow = rows.length - displayRows.length;

      const header = cols.map((c) => c.columnLabel).join(' | ');
      const dataRows = displayRows.map((row) => {
        const vals = extractRowValues(row);
        return cols
          .map((c) => {
            const v = vals[c.targetAttribute];
            if (v === null || v === undefined || v === '') return '—';
            if (c.columnFieldType === 'boolean') return v ? 'Yes' : 'No';
            if (c.columnFieldType === 'date') return formatDate(v, false);
            if (c.columnFieldType === 'datetime') return formatDate(v, true);
            return String(v);
          })
          .join(' | ');
      });

      const lines = [header, ...dataRows];
      if (overflow > 0) lines.push(`…and ${overflow} more`);
      return lines.join('\n');
    }

    case 'richtext':
      return String(value).replace(/<[^>]*>/g, ' ').trim();

    default:
      return String(value);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeSuccess: { backgroundColor: '#d4edda' },
  badgeWarning: { backgroundColor: '#fff3cd' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#1a1a2e' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  tabBlock: { gap: 10 },
  tabHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0078d4',
  },
  editButtonText: { fontSize: 13, color: '#0078d4', fontWeight: '600' },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: { flex: 1, fontSize: 13, color: '#666', fontWeight: '500' },
  fieldValue: { flex: 2, fontSize: 13, color: '#1a1a2e', textAlign: 'right' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0078d4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0078d4',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#0078d4', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
