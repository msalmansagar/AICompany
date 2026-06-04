import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@qdb/pending-submissions';

export interface PendingSubmission {
  id: string;
  formCode: string;
  formData: Record<string, unknown>;
  queuedAt: string;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueueSubmission(
  formCode: string,
  formData: Record<string, unknown>,
): Promise<PendingSubmission> {
  const item: PendingSubmission = {
    id: generateId(),
    formCode,
    formData,
    queuedAt: new Date().toISOString(),
  };
  const current = await getAllPending();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...current, item]));
  return item;
}

export async function getAllPending(): Promise<PendingSubmission[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as PendingSubmission[];
}

export async function removePending(id: string): Promise<void> {
  const current = await getAllPending();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(current.filter((s) => s.id !== id)));
}

export async function clearPendingQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
