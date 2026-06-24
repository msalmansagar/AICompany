import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type NetworkListener = (isConnected: boolean) => void;

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    // null means the platform couldn't determine status — assume online so we
    // attempt the live API call and let it fail with a real error if needed.
    return state.isConnected ?? true;
  } catch {
    return true;
  }
}

export function addNetworkListener(listener: NetworkListener): () => void {
  return NetInfo.addEventListener((state: NetInfoState) => {
    listener(state.isConnected ?? false);
  });
}
