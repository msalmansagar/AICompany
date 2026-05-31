import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useMsal } from '../../src/auth/MsalProvider';
import { useDevBypass } from '../../src/context/DevBypassContext';
import { getFormDefinition, submitForm, saveDraft } from '../../src/services/FormService';
import { FormRenderer } from '../../src/components/FormRenderer';
import type { FormDefinition } from '@qdb/shared';

export default function FormDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { acquireToken } = useMsal();
  const { isDevBypass } = useDevBypass();

  const [form, setForm] = useState<FormDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) void loadForm(id);
    }, [id])
  );

  useEffect(() => {
    if (form) navigation.setOptions({ title: form.displayName });
  }, [form, navigation]);

  async function loadForm(formCode: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const token = isDevBypass ? '' : await acquireToken();
      const definition = await getFormDefinition(formCode, token);
      setForm(definition);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load form.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(values: Record<string, unknown>): Promise<void> {
    if (!form) return;
    setIsSubmitting(true);
    try {
      const token = isDevBypass ? '' : await acquireToken();
      await submitForm(form.formCode, values, token);
      Alert.alert(
        'Application Submitted',
        form.confirmationMessage || `Your ${form.displayName} has been submitted successfully. You will receive a confirmation shortly.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
      if (__DEV__) console.log('[FormSubmit]', form.formCode, values);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed.';
      Alert.alert('Submission Failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveDraft(values: Record<string, unknown>, tabIndex: number): Promise<void> {
    if (!form || isDevBypass) return;
    try {
      const token = await acquireToken();
      await saveDraft(form.formCode, values, tabIndex, token);
    } catch (err) {
      if (__DEV__) console.warn('[SaveDraft] failed:', err);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#0078d4" />
        <Text style={styles.loadingText}>Loading form…</Text>
      </View>
    );
  }

  if (error || !form) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorTitle}>Form unavailable</Text>
        <Text style={styles.errorMessage}>{error ?? 'Form not found.'}</Text>
        <Pressable style={styles.retryButton} onPress={() => id && void loadForm(id)}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FormRenderer
      form={form}
      onSubmit={handleSubmit}
      onSaveDraft={handleSaveDraft}
      onCancel={() => router.back()}
      isSubmitting={isSubmitting}
    />
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: '#666', marginTop: 8 },
  errorIcon: { fontSize: 40, color: '#d32f2f' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  errorMessage: { fontSize: 14, color: '#666', textAlign: 'center' },
  retryButton: { backgroundColor: '#0078d4', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  backButton: { paddingVertical: 8 },
  backText: { color: '#0078d4', fontSize: 14 },
});
