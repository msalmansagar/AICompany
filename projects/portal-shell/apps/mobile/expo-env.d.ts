/// <reference types="expo/types" />

// Expo public environment variables — typed for strict TypeScript
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_URL: string;
    readonly EXPO_PUBLIC_PORTAL_ID: string;
    readonly EXPO_PUBLIC_MICROSOFT_CLIENT_ID: string;
  }
}
