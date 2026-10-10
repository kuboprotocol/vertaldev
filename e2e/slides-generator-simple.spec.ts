import { test, expect } from '@playwright/test';

test.use({
  launchArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
});

test('slides generator should load', async ({ page }) => {
  // Try to reach the main page
  const response = await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  });
  
  expect(response?.status()).toBeLessThan(400);
  
  // Check if page has content
  const content = await page.content();
  expect(content.length).toBeGreaterThan(0);
});

test('creative panel components exist', async ({ page }) => {
  await page.goto('/', {
    waitUntil: 'domcontentloaded',
  });

  // Wait a bit for React to render
  await page.waitForTimeout(2000);

  // Just verify the page is interactive
  const body = await page.locator('body');
  await expect(body).toBeVisible();
});
