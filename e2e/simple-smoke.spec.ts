import { test, expect } from '@playwright/test';

test.describe('Basic Application Tests', () => {
  test('application loads without crashing', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check if the page title is correct
    await expect(page).toHaveTitle(/Money Buddy/);
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'test-results/app-loaded.png' });
  });

  test('page renders basic structure', async ({ page }) => {
    await page.goto('/');
    
    // Check for basic HTML structure
    const bodyContent = await page.textContent('body');
    
    // Verify the page isn't completely empty
    expect(bodyContent).toBeTruthy();
    expect(bodyContent!.length).toBeGreaterThan(0);
  });
});