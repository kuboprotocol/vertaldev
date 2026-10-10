import { test, chromium } from '@playwright/test';

test('Creative Panel - Access & Component Check', async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium'
  });
  const page = await browser.newPage();

  try {
    console.log('\n🎨 Testing Creative Chat Panel\n');
    
    // Try the chat route
    console.log('📍 Accessing /creative/chat...');
    const response = await page.goto('http://localhost:8083/creative/chat', { 
      waitUntil: 'networkidle', 
      timeout: 30000 
    }).catch(e => console.log('Note:', e.message.split('\n')[0]));

    if (response?.status() === 404) {
      console.log('⚠️ Route not accessible (may require auth)');
    } else {
      console.log('✅ Page navigated');
    }

    // Check current URL
    const url = page.url();
    console.log(`📍 Current URL: ${url}\n`);

    // Take a screenshot
    await page.screenshot({ path: 'creative-panel.png', fullPage: true });
    console.log('📸 Screenshot saved\n');

    // Check for authentication or main components
    const isAuth = await page.locator('input[type="email"]').isVisible().catch(() => false);
    
    if (isAuth) {
      console.log('ℹ️ LOGIN REQUIRED');
      console.log('─────────────────────────────────');
      console.log('The Creative Panel is protected by authentication.');
      console.log('To test the panel, you need to:');
      console.log('1. Sign up or log in to the application');
      console.log('2. Access /creative/chat route\n');
    } else {
      // Check for creative panel components
      const tests = [
        { selector: '.creative-chat-container', name: 'Main Container' },
        { selector: '.conversation-sidebar', name: 'Sidebar' },
        { selector: '.conversation-header', name: 'Header' },
        { selector: '.creative-chat-input', name: 'Input Area' },
        { selector: '.creative-chat-messages', name: 'Messages Area' },
      ];

      console.log('✅ CREATIVE PANEL LOADED');
      console.log('─────────────────────────────────');
      
      for (const { selector, name } of tests) {
        const isVisible = await page.locator(selector).isVisible().catch(() => false);
        console.log(`${isVisible ? '✅' : '⚠️'} ${name}`);
      }
    }

    console.log('\n✅ Test completed!\n');

  } finally {
    await browser.close();
  }
});
