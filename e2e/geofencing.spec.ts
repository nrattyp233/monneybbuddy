import { test, expect } from '@playwright/test';

test.describe('Geofencing Drawing and Claims', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('h1', { timeout: 10000 });
  });

  test('loads the application and shows main interface', async ({ page }) => {
    // Verify the app title
    await expect(page).toHaveTitle('Money Buddy - Geo Safe');
    
    // Check for main heading
    await expect(page.locator('h1')).toContainText('Money Buddy');
    
    // Verify Send Money section is visible
    await expect(page.locator('text=Send Money Securely')).toBeVisible();
  });

  test('enables geofence toggle and shows drawing interface', async ({ page }) => {
    // Find and click the geofence toggle
    const geofenceSection = page.locator('text=Add Geofence').locator('..');
    const geofenceToggle = geofenceSection.locator('input[type="checkbox"]');
    
    await geofenceToggle.click();
    
    // Verify the map container appears
    await expect(page.locator('[data-testid="map-container"], .leaflet-container')).toBeVisible();
    
    // Check for drawing instructions
    await expect(page.locator('text=Use the drawing tools on the map')).toBeVisible();
  });

  test('enables time restriction and shows hours input', async ({ page }) => {
    // Find and click the time restriction toggle
    const timeSection = page.locator('text=Add Time Restriction').locator('..');
    const timeToggle = timeSection.locator('input[type="checkbox"]');
    
    await timeToggle.click();
    
    // Verify hours input appears
    await expect(page.locator('input[placeholder="24"]')).toBeVisible();
    await expect(page.locator('text=Claim within (hours)')).toBeVisible();
  });

  test('validates required fields before submission', async ({ page }) => {
    // Try to submit without filling required fields
    const submitButton = page.locator('button:has-text("Pay $")');
    
    // Set up dialog handler for the alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Please fill all required fields correctly');
      await dialog.accept();
    });
    
    await submitButton.click();
  });

  test('calculates transaction fees correctly', async ({ page }) => {
    // Fill in amount
    const amountInput = page.locator('input[placeholder="0.00"]');
    await amountInput.fill('100');
    
    // Wait for fee calculation
    await page.waitForTimeout(500);
    
    // Check fee display (3% of $100 = $3.00)
    await expect(page.locator('text=$3.00')).toBeVisible();
    
    // Check total debit ($100 + $3 = $103.00)
    await expect(page.locator('text=$103.00')).toBeVisible();
  });

  test('complete transaction flow with geofence and time restriction', async ({ page }) => {
    // Fill all required fields
    const recipientInput = page.locator('input[placeholder="buddy@example.com"]');
    await recipientInput.fill('test@example.com');
    
    const amountInput = page.locator('input[placeholder="0.00"]');
    await amountInput.fill('50');
    
    const descriptionInput = page.locator('input[placeholder*="Dinner"]');
    await descriptionInput.fill('Test payment with restrictions');
    
    // Enable geofence
    const geofenceSection = page.locator('text=Add Geofence').locator('..');
    const geofenceToggle = geofenceSection.locator('input[type="checkbox"]');
    await geofenceToggle.click();
    
    // Wait for map to load
    await page.waitForSelector('[data-testid="map-container"], .leaflet-container', { timeout: 5000 });
    
    // Enable time restriction
    const timeSection = page.locator('text=Add Time Restriction').locator('..');
    const timeToggle = timeSection.locator('input[type="checkbox"]');
    await timeToggle.click();
    
    // Set time restriction to 12 hours
    const hoursInput = page.locator('input[placeholder="24"]');
    await hoursInput.fill('12');
    
    // Verify submit button shows correct total
    const submitButton = page.locator('button:has-text("Pay $51.50")');
    await expect(submitButton).toBeVisible();
    
    // Note: We don't actually submit in E2E test to avoid side effects
    // In a real test environment, you would mock the onSend handler
  });

  test('geofence drawing interaction simulation', async ({ page }) => {
    // Enable geofence
    const geofenceSection = page.locator('text=Add Geofence').locator('..');
    const geofenceToggle = geofenceSection.locator('input[type="checkbox"]');
    await geofenceToggle.click();
    
    // Wait for map and drawing controls to appear
    await page.waitForSelector('[data-testid="map-container"], .leaflet-container', { timeout: 5000 });
    
    // Look for drawing controls (these may vary based on leaflet-draw implementation)
    const mapContainer = page.locator('[data-testid="map-container"], .leaflet-container').first();
    await expect(mapContainer).toBeVisible();
    
    // Check that drawing instructions are visible
    await expect(page.locator('text=Use the drawing tools')).toBeVisible();
    
    // In a real scenario with proper leaflet-draw setup, you would:
    // 1. Click on drawing tools (circle/polygon buttons)
    // 2. Simulate drawing gestures on the map
    // 3. Verify the drawn shape appears
    // 4. Check that geofence confirmation message shows
    
    // For now, verify the UI elements are properly displayed
    await expect(page.locator('text=Draw a circle or polygon')).toBeVisible();
  });

  test('responsive design and mobile compatibility', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Verify main sections are still visible
    await expect(page.locator('text=Send Money Securely')).toBeVisible();
    
    // Enable geofence on mobile
    const geofenceSection = page.locator('text=Add Geofence').locator('..');
    const geofenceToggle = geofenceSection.locator('input[type="checkbox"]');
    await geofenceToggle.click();
    
    // Map should still be usable on mobile
    await expect(page.locator('[data-testid="map-container"], .leaflet-container')).toBeVisible();
    
    // Drawing instructions should be readable
    await expect(page.locator('text=Use the drawing tools')).toBeVisible();
  });
});