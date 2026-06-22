import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';
import { InfoCardIcon } from '../info-card/InfoCardIcon';
import { appConfig } from '../../config/appConfig';

interface PickedFile {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  accessToken?: string;
}

interface TemplateDownloadProps {
  field: FieldDefinition;
  accessToken?: string;
}

function TemplateDownloadButton({ field, accessToken }: TemplateDownloadProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const hasDownload = !!(field.fileDownloadIcon ?? field.fileDownloadLabel ?? field.downloadDocumentSetting);
  if (!hasDownload) return null;

  async function handlePress(): Promise<void> {
    const setting = field.downloadDocumentSetting;
    if (!setting || !accessToken || isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`${appConfig.apiBaseUrl}/api/files/document-template`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ downloadDocumentSetting: setting }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      // expo-file-system is not installed — notify the user the file is ready
      // and instruct them to use the web portal for full download capability.
      Alert.alert(
        'Template Ready',
        'The document template was retrieved successfully. ' +
        'To save and open it on your device, use the web portal or contact your administrator to enable mobile file downloads.',
      );
    } catch (error) {
      Alert.alert(
        'Download Failed',
        error instanceof Error ? error.message : 'Unable to download the template. Please try again.',
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Pressable
      style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
      onPress={() => { void handlePress(); }}
      accessibilityRole="button"
      disabled={isDownloading}
    >
      {field.fileDownloadIcon ? (
        <InfoCardIcon iconName={field.fileDownloadIcon} size={18} color="#0078d4" />
      ) : (
        <Text style={styles.downloadButtonText}>
          {isDownloading ? 'Downloading…' : `⬇  ${field.fileDownloadLabel || 'Download Template'}`}
        </Text>
      )}
    </Pressable>
  );
}

export function FormFileField({ field, control, accessToken }: Props) {
  const [cameraPermissionRequested, setCameraPermissionRequested] = useState(false);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const picked = value as PickedFile | null | undefined;

        async function pickFromFiles(): Promise<void> {
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

        async function pickFromCamera(): Promise<void> {
          if (!cameraPermissionRequested) {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            setCameraPermissionRequested(true);
            if (status !== 'granted') {
              Alert.alert('Permission required', 'Camera access is needed to take a photo.');
              return;
            }
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const filename = asset.uri.split('/').pop() ?? 'photo.jpg';
            onChange({
              uri: asset.uri,
              name: filename,
              size: asset.fileSize ?? undefined,
              mimeType: asset.mimeType ?? 'image/jpeg',
            } satisfies PickedFile);
          }
        }

        function openPicker(): void {
          if (!field.allowCamera) {
            void pickFromFiles();
            return;
          }
          if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
              { options: ['Cancel', 'Take Photo', 'Choose File'], cancelButtonIndex: 0 },
              (index) => {
                if (index === 1) void pickFromCamera();
                if (index === 2) void pickFromFiles();
              },
            );
          } else {
            Alert.alert('Add attachment', undefined, [
              { text: 'Take Photo', onPress: () => void pickFromCamera() },
              { text: 'Choose File', onPress: () => void pickFromFiles() },
              { text: 'Cancel', style: 'cancel' },
            ]);
          }
        }

        function removeFile(): void {
          onChange(null);
        }

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            <TemplateDownloadButton field={field} accessToken={accessToken} />

            {picked ? (
              <View style={[styles.fileRow, error && styles.fileRowError]}>
                <Text style={styles.fileIcon}>📄</Text>
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName} numberOfLines={1}>{picked.name}</Text>
                  {picked.size !== undefined && (
                    <Text style={styles.fileSize}>{formatBytes(picked.size)}</Text>
                  )}
                </View>
                <Pressable style={styles.changeButton} onPress={openPicker}>
                  <Text style={styles.changeText}>Change</Text>
                </Pressable>
                <Pressable style={styles.removeButton} onPress={removeFile} hitSlop={8}>
                  <Text style={styles.removeIcon}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.emptyButton, error && styles.emptyButtonError]}
                onPress={openPicker}
              >
                <Text style={styles.emptyIcon}>{field.allowCamera ? '📷' : '🔎'}</Text>
                <Text style={[styles.emptyText, error && styles.emptyTextError]}>
                  {field.allowCamera ? 'Take photo or choose file' : 'Choose file'}
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
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: '#0078d4',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#f0f7ff',
  },
  downloadButtonDisabled: {
    opacity: 0.5,
  },
  downloadButtonText: {
    fontSize: 14,
    color: '#0078d4',
    fontWeight: '600',
  },
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
