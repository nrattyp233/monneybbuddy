import { test, expect } from '@playwright/test';

test.describe('Geofencing Drawing Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('text=Money Buddy - Geo Safe')).toBeVisible();
  });

  test('displays drawing controls when geofence is enabled', async ({ page }) => {
    // Navigate to send money section (assuming it's visible on load or requires interaction)
    const sendMoneySection = page.locator('text=Send Money Securely').locator('..');
    await expect(sendMoneySection).toBeVisible();
    
    // Enable geofence toggle
    const geofenceToggle = sendMoneySection.locator('input[type="checkbox"]').first();
    await geofenceToggle.click();
    
    // Check that map container appears
    const mapContainer = sendMoneySection.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
    
    // Check that drawing controls appear
    const drawingControls = mapContainer.locator('.leaflet-draw');
    await expect(drawingControls).toBeVisible();
  });

  test('allows user to draw a circle geofence', async ({ page }) => {
    const sendMoneySection = page.locator('text=Send Money Securely').locator('..');
    
    // Enable geofence
    const geofenceToggle = sendMoneySection.locator('input[type="checkbox"]').first();
    await geofenceToggle.click();
    
    // Wait for map to load
    const mapContainer = sendMoneySection.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
    
    // Click on circle drawing tool
    const circleDrawTool = mapContainer.locator('.leaflet-draw-draw-circle');
    await circleDrawTool.click();
    
    // Draw a circle on the map (click to set center, drag to set radius)
    const mapCenter = mapContainer.locator('.leaflet-pane').first();
    await mapCenter.click({ position: { x: 200, y: 150 } });
    
    // Click again to complete the circle (simulating the circle drawing interaction)
    await mapCenter.click({ position: { x: 250, y: 150 } });
    
    // Check if confirmation message appears
    await expect(sendMoneySection.locator('text=✓ Geofence drawn')).toBeVisible();
  });

  test('allows user to draw a polygon geofence', async ({ page }) => {
    const sendMoneySection = page.locator('text=Send Money Securely').locator('..');
    
    // Enable geofence
    const geofenceToggle = sendMoneySection.locator('input[type="checkbox"]').first();
    await geofenceToggle.click();
    
    // Wait for map to load
    const mapContainer = sendMoneySection.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
    
    // Click on polygon drawing tool
    const polygonDrawTool = mapContainer.locator('.leaflet-draw-draw-polygon');
    await polygonDrawTool.click();
    
    // Draw a polygon by clicking multiple points
    const mapCenter = mapContainer.locator('.leaflet-pane').first();
    await mapCenter.click({ position: { x: 150, y: 100 } });
    await mapCenter.click({ position: { x: 250, y: 100 } });
    await mapCenter.click({ position: { x: 200, y: 200 } });
    
    // Complete the polygon by clicking the first point or double-clicking
    await mapCenter.dblclick({ position: { x: 150, y: 100 } });
    
    // Check if confirmation message appears
    await expect(sendMoneySection.locator('text=✓ Geofence drawn')).toBeVisible();
  });

  test('submits transaction with drawn geofence', async ({ page }) => {
    const sendMoneySection = page.locator('text=Send Money Securely').locator('..');
    
    // Fill out the form
    await sendMoneySection.locator('input[name="recipient"]').fill('test@example.com');
    await sendMoneySection.locator('input[name="amount"]').fill('50');
    await sendMoneySection.locator('input[name="description"]').fill('Test payment with geofence');
    
    // Enable geofence and draw a simple circle
    const geofenceToggle = sendMoneySection.locator('input[type="checkbox"]').first();
    await geofenceToggle.click();
    
    const mapContainer = sendMoneySection.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
    
    // Draw a circle
    const circleDrawTool = mapContainer.locator('.leaflet-draw-draw-circle');
    await circleDrawTool.click();
    
    const mapCenter = mapContainer.locator('.leaflet-pane').first();
    await mapCenter.click({ position: { x: 200, y: 150 } });
    await mapCenter.click({ position: { x: 250, y: 150 } });
    
    // Wait for geofence confirmation
    await expect(sendMoneySection.locator('text=✓ Geofence drawn')).toBeVisible();
    
    // Submit the form
    await sendMoneySection.locator('button[type="submit"]').click();
    
    // Should show processing state or success message
    // (This would depend on the actual backend integration)
    await expect(sendMoneySection.locator('text=Processing...')).toBeVisible();
  });

  test('can delete drawn geofence and redraw', async ({ page }) => {
    const sendMoneySection = page.locator('text=Send Money Securely').locator('..');
    
    // Enable geofence
    const geofenceToggle = sendMoneySection.locator('input[type="checkbox"]').first();
    await geofenceToggle.click();
    
    const mapContainer = sendMoneySection.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
    
    // Draw a circle
    const circleDrawTool = mapContainer.locator('.leaflet-draw-draw-circle');
    await circleDrawTool.click();
    
    const mapCenter = mapContainer.locator('.leaflet-pane').first();
    await mapCenter.click({ position: { x: 200, y: 150 } });
    await mapCenter.click({ position: { x: 250, y: 150 } });
    
    // Confirm geofence is drawn
    await expect(sendMoneySection.locator('text=✓ Geofence drawn')).toBeVisible();
    
    // Use delete tool to remove the geofence
    const deleteTool = mapContainer.locator('.leaflet-draw-edit-remove');
    await deleteTool.click();
    
    // Select and delete the shape
    const drawnShape = mapContainer.locator('.leaflet-interactive');
    await drawnShape.click();
    
    const deleteButton = mapContainer.locator('.leaflet-draw-actions-bottom a').last();
    await deleteButton.click();
    
    // Confirmation message should disappear
    await expect(sendMoneySection.locator('text=✓ Geofence drawn')).not.toBeVisible();
  });
});