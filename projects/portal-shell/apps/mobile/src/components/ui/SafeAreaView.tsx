// Re-export with consistent edge insets used across all screens
import React from 'react';
import {
  SafeAreaView as RNSafeAreaView,
  type Edge,
} from 'react-native-safe-area-context';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';

const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right'];

interface SafeAreaViewProps {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  testID?: string;
}

export function SafeAreaView({
  children,
  edges = DEFAULT_EDGES,
  style,
  testID,
}: SafeAreaViewProps): React.JSX.Element {
  return (
    <RNSafeAreaView testID={testID} edges={edges} style={[styles.base, style]}>
      {children}
    </RNSafeAreaView>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
