import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';

interface AvatarProps {
  displayName: string;
  imageUrl?: string | null;
  size?: number;
  testID?: string;
}

function buildInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function Avatar({
  displayName,
  imageUrl,
  size = 44,
  testID,
}: AvatarProps): React.JSX.Element {
  const initials = buildInitials(displayName);
  const fontSize = Math.round(size * 0.38);

  if (imageUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUrl }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
        accessibilityLabel={displayName}
      />
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.initials, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityLabel={displayName}
    >
      <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: Colors.grey30,
  },
  initials: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
