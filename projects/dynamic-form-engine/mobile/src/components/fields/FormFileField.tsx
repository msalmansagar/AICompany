import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import * as DocumentPicker from 'expo-document-picker';
import type { FieldDefinition } from '@qdb/form-engine-shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules } from '../../utils/buildValidationRules';

interface PickedFile {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormFileField({ field, control }: Props) {
  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const picked = value as PickedFile | null | undefined;

        async function pickFile(): Promise<void> {
          const result = await DocumentPicker.getDocumentAsync({
            type: field.allowedMimeTypes?.length ? field.allowedMimeTypes : ['*/*'],
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            onChange({
              uri: asset.uri,
              name: asset.name,
              size: asset.size ?? undefined,
              mimeType: asset.mimeType ?? undefined,
            } satisfies PickedFile);
          }
        }

        function removeFile(): void {
          onChange(null);
        }

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {field.isRequiredDefault && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            {picked ? (
              <View style={[styles.fileRow, error && styles.fileRowError]}>
                <Text style={styles.fileIcon}>📄</Text>
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName} numberOfLines={1}>{picked.name}</Text>
                  {picked.size !== undefined && (
                    <Text style={styles.fileSize}>{formatBytes(picked.size)}</Text>
                  )}
                </View>
                <Pressable style={styles.changeButton} onPress={() => void pickFile()}>
                  <Text style={styles.changeText}>Change</Text>
                </Pressable>
                <Pressable style={styles.removeButton} onPress={removeFile} hitSlop={8}>
                  <Text style={styles.removeIcon}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.emptyButton, error && styles.emptyButtonError]}
                onPress={() => void pickFile()}
              >
                <Text style={styles.emptyIcon}>📎</Text>
                <Text style={[styles.emptyText, error && styles.emptyTextError]}>
                  Choose file
                </Text>
              </Pressable>
            )}

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#0078d4',
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#f0f7ff',
  },
  emptyButtonError: { borderColor: '#d32f2f', backgroundColor: '#fff5f5' },
  emptyIcon: { fontSize: 18 },
  emptyText: { fontSize: 14, color: '#0078d4', fontWeight: '600' },
  emptyTextError: { color: '#d32f2f' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f1f8f1',
  },
  fileRowError: { borderColor: '#d32f2f', backgroundColor: '#fff5f5' },
  fileIcon: { fontSize: 22 },
  fileDetails: { flex: 1 },
  fileName: { fontSize: 13, color: '#1a1a2e', fontWeight: '500' },
  fileSize: { fontSize: 11, color: '#888', marginTop: 2 },
  changeButton: { paddingHorizontal: 8, paddingVertical: 4 },
  changeText: { fontSize: 13, color: '#0078d4', fontWeight: '500' },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIcon: { fontSize: 12, color: '#d32f2f', fontWeight: '700' },
});
