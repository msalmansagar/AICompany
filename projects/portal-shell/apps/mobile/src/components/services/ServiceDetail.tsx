import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import type { PortalService } from '@portal/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Colors } from '../../constants/Colors';
import { t, getCurrentLocale } from '../../i18n';

interface ServiceDetailProps {
  service: PortalService;
  onApply: () => void;
  testID?: string;
}

export function ServiceDetail({
  service,
  onApply,
  testID,
}: ServiceDetailProps): React.JSX.Element {
  const isAr = getCurrentLocale() === 'ar';
  const title = isAr ? service.titleAr : service.title;
  const description = isAr ? service.fullDescriptionAr : service.fullDescription;

  return (
    <ScrollView testID={testID} style={styles.container} contentContainerStyle={styles.content}>
      {service.imageUrl ? (
        <Image
          source={{ uri: service.imageUrl }}
          style={styles.heroImage}
          contentFit="cover"
          accessibilityLabel={title}
        />
      ) : null}

      <Badge label={service.categoryTag} variant="primary" style={styles.badge} />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <Button
        title={t('services.detail.applyNow')}
        onPress={onApply}
        variant="primary"
        style={styles.applyButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    paddingBottom: 32,
  },
  heroImage: {
    width: '100%',
    height: 220,
    backgroundColor: Colors.grey30,
  },
  badge: {
    marginTop: 16,
    marginStart: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  applyButton: {
    marginHorizontal: 16,
  },
});
