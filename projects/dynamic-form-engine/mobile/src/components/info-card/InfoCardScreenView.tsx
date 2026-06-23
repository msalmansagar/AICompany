import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { InfoCardScreen } from '@qdb/shared';
import { InfoCardSectionRenderer } from './InfoCardSectionRenderer';

interface Props {
  screen: InfoCardScreen;
}

export function InfoCardScreenView({ screen }: Props) {
  const sortedSections = [...(screen.sections ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {screen.iconUrl != null && screen.iconUrl.length > 0 && (
        <Image
          source={{ uri: screen.iconUrl }}
          style={styles.icon}
          accessibilityLabel={screen.iconAltText ?? screen.heading}
          accessibilityRole="image"
          resizeMode="contain"
        />
      )}

      <Text style={styles.heading}>{screen.heading}</Text>

      {screen.subHeading != null && screen.subHeading.length > 0 && (
        <Text style={styles.subHeading}>{screen.subHeading}</Text>
      )}

      {sortedSections.length > 0 && (
        <View style={styles.sections}>
          {sortedSections.map((section) => (
            <InfoCardSectionRenderer key={section.sectionId} section={section} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  icon: { width: 80, height: 80, alignSelf: 'center', marginBottom: 20 },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 28,
  },
  subHeading: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  sections: { marginTop: 8 },
});
