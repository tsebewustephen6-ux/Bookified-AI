import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bookified.app',
  appName: 'bookified',
  webDir: 'public',
  server: {
    url: 'https://bookified-beige-six.vercel.app',
    cleartext: true
  },
  appendUserAgent: 'BookifiedMobileApp'
};

export default config;
