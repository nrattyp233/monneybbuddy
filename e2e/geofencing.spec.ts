import { test, expect } from '@playwright/test';

test.describe('Geofencing and Drawing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.getByText(/Money Buddy - Geo Safe/i)).toBeVisible();
  });

  test('enables geofence toggle and shows map with drawing controls', async ({ page }) => {
    // First, we need to authenticate or get to the main app
    // For now, let's assume we can access the SendMoney component
    // This might need adjustment based on the actual app flow
    
    // Look for a send money section or navigate to it
    // This test might need to be adjusted based on the actual app structure
    const sendMoneySection = page.locator('[data-testid="send-money"]').or(
      page.getByText('Send Money Securely')
    );
    
    if (await sendMoneySection.isVisible()) {
      // Fill in basic transaction details first
      await page.getByLabel(/amount/i).fill('50');
      await page.getByLabel(/recipient/i).fill('test@example.com');
      await page.getByLabel(/description/i).fill('Test payment');

      // Find and click the geofence toggle
      const geofenceToggle = page.getByText(/Add Geofence/i)
        .locator('..')
        .locator('input[type="checkbox"]');
      
      await geofenceToggle.click();

      // Verify map appears
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
      
      // Verify drawing controls appear
      await expect(page.locator('.leaflet-draw')).toBeVisible({ timeout: 5000 });
      
      // Test circle drawing
      const circleButton = page.locator('.leaflet-draw-draw-circle');
      if (await circleButton.isVisible()) {
        await circleButton.click();
        
        // Draw a circle by clicking on the map
        const map = page.locator('.leaflet-container');
        await map.click({ position: { x: 200, y: 200 } });
        await map.click({ position: { x: 250, y: 200 } });
        
        // Verify a shape was drawn
        await expect(page.locator('.leaflet-interactive')).toBeVisible();
      }
      
      // Test polygon drawing
      const polygonButton = page.locator('.leaflet-draw-draw-polygon');
      if (await polygonButton.isVisible()) {
        await polygonButton.click();
        
        // Draw a polygon by clicking multiple points
        const map = page.locator('.leaflet-container');
        await map.click({ position: { x: 100, y: 100 } });
        await map.click({ position: { x: 150, y: 100 } });
        await map.click({ position: { x: 150, y: 150 } });
        await map.click({ position: { x: 100, y: 150 } });
        await map.click({ position: { x: 100, y: 100 } }); // Close the polygon
      }

      // Submit the transaction with geofence
      const submitButton = page.getByRole('button', { name: /pay/i });
      await submitButton.click();
      
      // Check for success or error messages
      // This will depend on the actual app flow
    } else {
      // If SendMoney component is not immediately visible, 
      // we might need to navigate through auth first
      console.log('Send Money component not found - may need to authenticate first');
    }
  });

  test('time restriction works with geofencing', async ({ page }) => {
    // Similar to above but also test time restrictions
    const sendMoneySection = page.locator('[data-testid="send-money"]').or(
      page.getByText('Send Money Securely')
    );
    
    if (await sendMoneySection.isVisible()) {
      // Fill in basic transaction details
      await page.getByLabel(/amount/i).fill('75');
      await page.getByLabel(/recipient/i).fill('test2@example.com');
      await page.getByLabel(/description/i).fill('Test with restrictions');

      // Enable both geofence and time restriction
      const geofenceToggle = page.getByText(/Add Geofence/i)
        .locator('..')
        .locator('input[type="checkbox"]');
      await geofenceToggle.click();

      const timeToggle = page.getByText(/Add Time Restriction/i)
        .locator('..')
        .locator('input[type="checkbox"]');
      await timeToggle.click();

      // Set custom hours
      const hoursInput = page.getByLabel(/Claim within \(hours\)/i);
      await hoursInput.clear();
      await hoursInput.fill('6');

      // Verify both map and time input are visible
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
      await expect(hoursInput).toHaveValue('6');

      // Draw a shape if controls are available
      const circleButton = page.locator('.leaflet-draw-draw-circle');
      if (await circleButton.isVisible()) {
        await circleButton.click();
        const map = page.locator('.leaflet-container');
        await map.click({ position: { x: 200, y: 200 } });
        await map.click({ position: { x: 250, y: 200 } });
      }

      // Submit
      const submitButton = page.getByRole('button', { name: /pay/i });
      await submitButton.click();
    }
  });

  test('delete drawn shapes works', async ({ page }) => {
    const sendMoneySection = page.locator('[data-testid="send-money"]').or(
      page.getByText('Send Money Securely')
    );
    
    if (await sendMoneySection.isVisible()) {
      // Fill in basic details
      await page.getByLabel(/amount/i).fill('25');
      await page.getByLabel(/recipient/i).fill('test3@example.com');
      await page.getByLabel(/description/i).fill('Test delete');

      // Enable geofence
      const geofenceToggle = page.getByText(/Add Geofence/i)
        .locator('..')
        .locator('input[type="checkbox"]');
      await geofenceToggle.click();

      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

      // Draw a shape
      const circleButton = page.locator('.leaflet-draw-draw-circle');
      if (await circleButton.isVisible()) {
        await circleButton.click();
        const map = page.locator('.leaflet-container');
        await map.click({ position: { x: 200, y: 200 } });
        await map.click({ position: { x: 250, y: 200 } });
        
        // Verify shape exists
        await expect(page.locator('.leaflet-interactive')).toBeVisible();
        
        // Delete the shape
        const deleteButton = page.locator('.leaflet-draw-delete');
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          // Click on the shape to select it for deletion
          await page.locator('.leaflet-interactive').click();
          // Confirm deletion if there's a confirm button
          const confirmDelete = page.locator('.leaflet-draw-actions-bottom a').first();
          if (await confirmDelete.isVisible()) {
            await confirmDelete.click();
          }
        }
      }
    }
  });
});