import { test, expect } from '@playwright/test';

test.describe('Money Buddy smoke', () => {
  test('home loads and auth toggle works', async ({ page, baseURL }) => {
    await page.goto(baseURL || '/');

    // App subtitle present
    await expect(page.getByText(/Money Buddy - Geo Safe/i)).toBeVisible();

    // Primary CTA should exist depending on initial view
    const submit = page.getByRole('button', { name: /sign in securely|create my account/i });
    await expect(submit).toBeVisible();

    // Toggle link switches between Sign In and Sign Up views
    const toggle = page.getByRole('button', { name: /don't have an account\? sign up|already have an account\? sign in/i });
    await expect(toggle).toBeVisible();

    const beforeText = await toggle.innerText();
    await toggle.click();
    const afterText = await toggle.innerText();
    expect(beforeText).not.toEqual(afterText);

    // Email and password inputs are present
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });
});
