import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMsal } from '../../src/auth/MsalProvider';
import { useDevBypass } from '../../src/context/DevBypassContext';
import { listForms } from '../../src/services/FormService';
import type { FormListItem } from '@qdb/form-engine-shared';

export default function FormsListScreen() {
  const router = useRouter();
  const { account, acquireToken } = useMsal();
  const { isDevBypass } = useDevBypass();

  const [forms, setForms] = useState<FormListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = account?.displayName ?? (isDevBypass ? 'Dev User' : '');

  const loadForms = useCallback(async (isRefresh = false): Promise<void> => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const token = isDevBypass ? '' : await acquireToken();
      const result = await listForms(token);
      setForms(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load forms.';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isDevBypass, acquireToken]);

  useFocusEffect(
    useCallback(() => {
      void loadForms();
    }, [loadForms])
  );

  function openForm(item: FormListItem): void {
    router.push(`/forms/${item.formCode}`);
  }

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#0078d4" />
        <Text style={styles.loadingText}>Loading forms…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorTitle}>Could not load forms</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        {!isDevBypass && (
          <Text style={styles.errorHint}>
            Make sure the backend is running and apiBaseUrl points to your PC's IP address (not localhost).
          </Text>
        )}
        <Pressable style={styles.retryButton} onPress={() => void loadForms()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Welcome{displayName ? `, ${displayName.split(' ')[0]}` : ''}
        </Text>
        <Text style={styles.subtitle}>Select a form to begin your application</Text>
        {isDevBypass && (
          <View style={styles.devBadge}>
            <Text style={styles.devBadgeText}>Dev Mode — Mock Data</Text>
          </View>
        )}
        {!isDevBypass && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>● Live — {forms.length} form{forms.length !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={forms}
        keyExtractor={(item) => item.formId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadForms(true)}
            tintColor="#0078d4"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No forms available.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openForm(item)}>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.displayName}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>
              {item.hasDraft && (
                <View style={styles.draftBadge}>
                  <Text style={styles.draftText}>Draft saved</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: '#666', marginTop: 8 },
  errorIcon: { fontSize: 40, color: '#d32f2f' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  errorMessage: { fontSize: 14, color: '#666', textAlign: 'center' },
  errorHint: { fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 18 },
  retryButton: { backgroundColor: '#0078d4', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  header: { backgroundColor: '#0078d4', padding: 24, paddingTop: 16 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  devBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 10 },
  devBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  liveBadge: { backgroundColor: 'rgba(0,200,100,0.25)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 10 },
  liveBadgeText: { color: '#d4ffec', fontSize: 12, fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  emptyState: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#999' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  cardDescription: { fontSize: 13, color: '#666', lineHeight: 18 },
  draftBadge: { backgroundColor: '#fff3cd', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 8 },
  draftText: { color: '#856404', fontSize: 12, fontWeight: '600' },
  cardArrow: { fontSize: 24, color: '#ccc', marginLeft: 8 },
});
