import { expect, test, type Page } from '@playwright/test';
// Google UI itself is not automated; Firebase's local provider emulator exercises
// the real popup SDK and existing profile gate without external Google credentials.
async function googlePopup(page: Page, email: string) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL(/127\.0\.0\.1:9098/);
  await popup.locator('.js-new-account').click();
  await popup.locator('#email-input').fill(email);
  await popup.locator('#display-name-input').fill('Google emulator user');
  await popup.locator('#sign-in').click();
}
test('Google sign-in retains an invited employee identity and existing records', async ({ page }) => {
  await page.goto('/login'); await googlePopup(page, 'employee@workpulse.test');
  await expect(page.getByRole('heading', { name: /Good to see you, Alex/ })).toBeVisible({ timeout: 30000 });
  await page.goto('/profile'); await expect(page.getByText('WP-EMPLOYEE', { exact: true })).toBeVisible();
  await page.goto('/employees'); await expect(page.getByRole('heading', { name: 'This page requires additional permission' })).toBeVisible();
});
test('uninvited Google identities cannot enter the workspace', async ({ page }) => {
  await page.goto('/login'); await googlePopup(page, `uninvited-${Date.now()}@workpulse.test`);
  await expect(page.getByText('This account has not been invited. Contact your administrator.', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});
test('closing Google popup preserves the existing password form', async ({ page }) => {
  await page.goto('/login'); await page.getByLabel('Work email').fill('manager@workpulse.test');
  const opened = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Continue with Google' }).click(); const popup = await opened; await popup.close();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page.getByLabel('Work email')).toHaveValue('manager@workpulse.test'); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});
