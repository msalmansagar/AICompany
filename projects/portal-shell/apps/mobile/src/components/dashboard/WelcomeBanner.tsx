import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { t } from '../../i18n';

interface WelcomeBannerProps {
  displayName: string;
  testID?: string;
}

function getGreetingKey(): 'dashboard.goodMorning' | 'dashboard.goodAfternoon' | 'dashboard.goodEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.goodMorning';
  if (hour < 18) return 'dashboard.goodAfternoon';
  return 'dashboard.goodEvening';
}

export function WelcomeBanner({ displayName, testID }: WelcomeBannerProps): React.JSX.Element {
  const greetingKey = getGreetingKey();
  const greeting = t(greetingKey, { name: displayName });

  return (
    <View testID={testID} style={styles.container}>
      <Text style={styles.greeting} accessibilityRole="header">
        {greeting}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
});
