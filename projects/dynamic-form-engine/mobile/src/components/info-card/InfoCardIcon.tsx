import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  iconName: string | null;
  size?: number;
  color?: string;
}

// Maps Fluent UI icon names (stored in Dataverse) to MaterialCommunityIcons names
const FLUENT_TO_MCO: Record<string, string> = {
  PersonRegular:            'account-outline',
  HomeRegular:              'home-outline',
  ContactCardRegular:       'card-account-details-outline',
  CertificateRegular:       'certificate-outline',
  DrawImageRegular:         'pencil-ruler',
  BuildingBankRegular:      'bank-outline',
  DocumentTextRegular:      'file-document-outline',
  SignatureRegular:         'fountain-pen-tip',
  DocumentRegular:          'file-outline',
  ShieldCheckmarkRegular:   'shield-check-outline',
  // Generic fallbacks for common Fluent names
  CalendarRegular:          'calendar-outline',
  MailRegular:              'email-outline',
  PhoneRegular:             'phone-outline',
  SearchRegular:            'magnify',
  SettingsRegular:          'cog-outline',
  EditRegular:              'pencil-outline',
  DeleteRegular:            'trash-can-outline',
  AddRegular:               'plus',
  CheckmarkRegular:         'check',
  DismissRegular:           'close',
  InfoRegular:              'information-outline',
  WarningRegular:           'alert-outline',
  AttachRegular:            'paperclip',
  DownloadRegular:          'download-outline',
  ShareRegular:             'share-variant-outline',
  LocationRegular:          'map-marker-outline',
  MoneyRegular:             'currency-usd',
};

export function InfoCardIcon({ iconName, size = 20, color = '#0078d4' }: Props) {
  if (iconName == null) return null;

  const mcoName = FLUENT_TO_MCO[iconName];

  if (!mcoName) {
    // Unknown icon — show a neutral bullet placeholder
    return (
      <View style={styles.fallback} accessibilityElementsHidden>
        <Text style={[styles.bullet, { color }]}>•</Text>
      </View>
    );
  }

  return (
    <MaterialCommunityIcons
      name={mcoName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
      size={size}
      color={color}
      accessibilityElementsHidden
    />
  );
}

const styles = StyleSheet.create({
  fallback: { width: 20, alignItems: 'center', justifyContent: 'center' },
  bullet: { fontSize: 18, lineHeight: 20 },
});
