import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type NetworkListener = (isConnected: boolean) => void;

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

export function addNetworkListener(listener: NetworkListener): () => void {
  return NetInfo.addEventListener((state: NetInfoState) => {
    listener(state.isConnected ?? false);
  });
}
