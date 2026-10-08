import { defineConfig } from "@playwright/test";
const port = Number(process.env.BOOKIFIED_TEST_PORT ?? 3000);
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: `http://localhost:${port}`, headless: true },
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
