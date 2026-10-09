import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const mobilePackage = (name: string) => fileURLToPath(new URL(`./mobile/node_modules/${name}`, import.meta.url));
export default defineConfig({
  resolve: { alias: [
    { find: /^react$/, replacement: mobilePackage('react') },
    { find: /^react\/jsx-runtime$/, replacement: mobilePackage('react/jsx-runtime.js') },
    { find: /^react-dom\/client$/, replacement: mobilePackage('react-dom/client.js') },
    ...['react-native', 'expo-secure-store', 'expo-crypto', 'expo-web-browser'].map(name => ({ find: name, replacement: mobilePackage(name) })),
  ] },
  test: { include: ['tests/native/**/*.test.tsx'], environment: 'jsdom', fileParallelism: false },
});
