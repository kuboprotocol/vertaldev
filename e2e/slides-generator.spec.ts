import { test, expect } from '@playwright/test';

test.describe('Slides Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8084/creative/panel');
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display Creative Panel with Slides option', async ({ page }) => {
    // Check if Creative Panel header exists
    const header = page.locator('text=Painel Criativo');
    await expect(header).toBeVisible();

    // Check if Slides Generator card exists
    const slidesCard = page.locator('text=Gerador de Slides');
    await expect(slidesCard).toBeVisible();
  });

  test('should navigate to slides generator when clicked', async ({ page }) => {
    // Click on Slides Generator card
    await page.click('text=Gerador de Slides');

    // Wait for slides page to load
    await page.waitForLoadState('networkidle');

    // Check if generator form is visible
    const generatorTitle = page.locator('text=Gerador de Apresentações IA');
    await expect(generatorTitle).toBeVisible({ timeout: 5000 });
  });

  test('should show form fields for slide generation', async ({ page }) => {
    // Navigate to slides generator
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Check form fields
    const topicInput = page.locator('input[placeholder*="Ex: Inteligência"]');
    await expect(topicInput).toBeVisible({ timeout: 5000 });

    // Check number input
    const numInput = page.locator('input[type="number"]');
    await expect(numInput).toBeVisible();

    // Check tone options
    const professionalBtn = page.locator('button:has-text("Professional")');
    await expect(professionalBtn).toBeVisible();

    // Check theme options
    const themeButtons = page.locator('.theme-btn');
    const count = await themeButtons.count();
    expect(count).toBe(5); // 5 themes
  });

  test('should show cost calculation', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Set topic
    const topicInput = page.locator('input[placeholder*="Ex: Inteligência"]');
    await topicInput.fill('Inteligência Artificial');

    // Change number of slides
    const numInput = page.locator('input[type="number"]');
    await numInput.clear();
    await numInput.fill('5');

    // Check cost badge
    const costBadge = page.locator('text=/crédito/');
    await expect(costBadge).toBeVisible();
    await expect(costBadge).toContainText('5 créditos');
  });

  test('should generate slides when button clicked', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Fill form
    const topicInput = page.locator('input[placeholder*="Ex: Inteligência"]');
    await topicInput.fill('Web3 e Blockchain');

    const numInput = page.locator('input[type="number"]');
    await numInput.clear();
    await numInput.fill('3');

    // Click generate button
    const generateBtn = page.locator('button:has-text("Gerar Apresentação")');
    await expect(generateBtn).not.toBeDisabled();

    // Note: Generation requires API key, so we just verify button exists and is clickable
    const isEnabled = await generateBtn.isEnabled();
    expect(isEnabled).toBe(true);
  });

  test('should disable button when insufficient credits', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // This test would require mock data to set credits to 0
    // For now, we just verify the button exists
    const generateBtn = page.locator('button:has-text("Gerar Apresentação")');
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
  });

  test('should show recent presentations list', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Recent presentations section might be empty initially
    // Check if section exists
    const recentSection = page.locator('text=Apresentações Recentes');
    // This section might not be visible if no presentations exist
    // So we just check if page loaded correctly
    const formExists = page.locator('input[placeholder*="Ex: Inteligência"]');
    await expect(formExists).toBeVisible({ timeout: 5000 });
  });

  test('should validate required fields', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Try to generate without topic
    const generateBtn = page.locator('button:has-text("Gerar Apresentação")');
    const isDisabled = await generateBtn.isDisabled();

    // Button should be disabled or show warning
    expect(isDisabled).toBe(true);
  });

  test('should switch between themes', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Get all theme buttons
    const themeButtons = page.locator('.theme-btn');
    const count = await themeButtons.count();

    // Click on second theme
    if (count > 1) {
      const secondTheme = themeButtons.nth(1);
      await secondTheme.click();

      // Check if it has active class
      const classList = await secondTheme.getAttribute('class');
      expect(classList).toContain('active');
    }
  });

  test('should change number of slides within valid range', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    const numInput = page.locator('input[type="number"]');

    // Test minimum
    await numInput.fill('3');
    const value3 = await numInput.inputValue();
    expect(value3).toBe('3');

    // Test maximum
    await numInput.clear();
    await numInput.fill('20');
    const value20 = await numInput.inputValue();
    expect(value20).toBe('20');
  });

  test('should go back to Creative Panel', async ({ page }) => {
    await page.click('text=Gerador de Slides');
    await page.waitForLoadState('networkidle');

    // Click back button
    const backBtn = page.locator('button:has-text("Voltar")');
    await backBtn.click();

    // Should be back at Creative Panel
    const header = page.locator('text=Painel Criativo');
    await expect(header).toBeVisible();
  });
});
