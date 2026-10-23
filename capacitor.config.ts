import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.kubovibe.app',
  appName: 'kubovibe',
  // The native shell must bundle the local build (`npm run build && npx cap sync`).
  // A `server.url` here makes Capacitor load a remote preview instead of `dist`,
  // which is why the mobile app showed stale or raw code.
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
