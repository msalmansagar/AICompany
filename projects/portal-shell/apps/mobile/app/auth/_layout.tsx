import React from 'react';
import { Stack } from 'expo-router';

// Auth screens have no tab bar — they use a plain stack navigator
export default function AuthLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
