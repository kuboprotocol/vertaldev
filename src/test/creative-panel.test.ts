import { test, expect } from '@playwright/test';

test('Creative Panel - Component Structure Test', async ({ page }) => {
  console.log('\n🚀 Testing Creative Panel Structure...\n');
  
  // Navigate to the app
  await page.goto('http://localhost:8083/', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('✅ Page loaded successfully');

  // Check for main components
  const componentTests = [
    { selector: '.creative-chat-container', name: 'Main Container' },
    { selector: '.conversation-sidebar', name: 'Conversation Sidebar' },
    { selector: '.conversation-header', name: 'Conversation Header' },
    { selector: '.creative-chat-input', name: 'Input Area' },
    { selector: '.creative-chat-messages', name: 'Messages Area' },
  ];

  console.log('\n📊 Component Visibility Check:');
  console.log('─────────────────────────────');

  for (const test of componentTests) {
    const element = page.locator(test.selector);
    const isVisible = await element.isVisible().catch(() => false);
    console.log(`${isVisible ? '✅' : '⚠️'} ${test.name}: ${isVisible ? 'Visible' : 'Not visible'}`);
  }

  console.log('─────────────────────────────\n');
  console.log('✅ Creative Panel structure test completed!\n');
});
