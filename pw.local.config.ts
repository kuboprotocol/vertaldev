import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...{ browserName: 'chromium' },
        executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome',
      },
    },
  ],
})
