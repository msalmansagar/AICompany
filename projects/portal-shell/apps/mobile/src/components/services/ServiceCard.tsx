import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { PortalService } from '@portal/types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Colors } from '../../constants/Colors';
import { t, getCurrentLocale } from '../../i18n';

interface ServiceCardProps {
  service: PortalService;
  onPress: (code: string) => void;
  testID?: string;
}

export function ServiceCard({ service, onPress, testID }: ServiceCardProps): React.JSX.Element {
  const isAr = getCurrentLocale() === 'ar';
  const title = isAr ? service.titleAr : service.title;
  const description = isAr ? service.shortDescriptionAr : service.shortDescription;

  return (
    <Card onPress={() => onPress(service.code)} testID={testID} style={styles.card}>
      {service.imageUrl ? (
        <Image
          source={{ uri: service.imageUrl }}
          style={styles.image}
          contentFit="cover"
          accessibilityLabel={title}
        />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Badge label={service.categoryTag} variant="primary" />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.description} numberOfLines={3}>
          {description}
        </Text>
        <Text style={styles.applyLink}>{t('services.applyNow')}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 0,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.grey30,
  },
  imagePlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.primaryLight,
  },
  body: {
    padding: 14,
  },
  headerRow: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  applyLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
});
