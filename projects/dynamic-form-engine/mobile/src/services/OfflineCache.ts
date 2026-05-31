import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FormDefinition, FormListItem } from '@qdb/shared';

const KEY_FORM_LIST = '@qdb/form-list';

function keyFormDef(formCode: string): string {
  return `@qdb/form-def/${formCode}`;
}

export async function cacheFormList(items: FormListItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY_FORM_LIST, JSON.stringify(items));
}

export async function getCachedFormList(): Promise<FormListItem[] | null> {
  const raw = await AsyncStorage.getItem(KEY_FORM_LIST);
  if (!raw) return null;
  return JSON.parse(raw) as FormListItem[];
}

export async function cacheFormDefinition(formCode: string, def: FormDefinition): Promise<void> {
  await AsyncStorage.setItem(keyFormDef(formCode), JSON.stringify(def));
}

export async function getCachedFormDefinition(formCode: string): Promise<FormDefinition | null> {
  const raw = await AsyncStorage.getItem(keyFormDef(formCode));
  if (!raw) return null;
  return JSON.parse(raw) as FormDefinition;
}

export async function clearFormDefinition(formCode: string): Promise<void> {
  await AsyncStorage.removeItem(keyFormDef(formCode));
}

export async function clearAllCaches(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const qdbKeys = allKeys.filter((k) => k.startsWith('@qdb/'));
  if (qdbKeys.length > 0) {
    await AsyncStorage.multiRemove(qdbKeys);
  }
}
