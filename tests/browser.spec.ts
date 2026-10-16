import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
async function signIn(page: Page, role: string) { await page.goto('/login'); await page.getByLabel('Work email').fill(`${role}@workpulse.test`); await page.getByLabel('Password', { exact: true }).fill('EmulatorOnly-WorkPulse-42'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible(); }
test('protected routes send unauthenticated users to sign in', async ({ page }) => { await page.goto('/employees'); await expect(page).toHaveURL(/login/); await expect(page.getByRole('heading', { name: 'Your workday, in rhythm.' })).toBeVisible(); });
test('employee saves draft, validates hours, submits and manager approves', async ({ page }) => {
  await signIn(page, 'employee'); await page.getByRole('link', { name: 'Daily report', exact: true }).click();
  await page.getByRole('button', { name: 'Add project' }).click(); await page.getByLabel('Regular hours', { exact: true }).fill('9');
  await page.getByLabel('What did you work on?').fill('Implemented the reporting workflow and tested the project assignment permissions with the team.');
  await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByRole('alert')).toContainText('exceed');
  await page.getByLabel('Regular hours', { exact: true }).fill('7'); await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByRole('status')).toContainText('Saved at');
  await page.reload(); await expect(page.getByLabel('Regular hours', { exact: true })).toHaveValue('7');
  await page.getByRole('button', { name: 'Preview & submit' }).click(); await expect(page.getByRole('dialog')).toContainText('7 regular'); await page.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(page).toHaveURL(/history\//); await expect(page.locator('main').getByText('Submitted', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Sign out' }).click();
  // Wait for Firebase's asynchronous sign-out before navigating to another sign-in.
  await expect(page).toHaveURL(/login/); await expect(page.getByLabel('Work email')).toBeVisible();
  await signIn(page, 'manager'); await page.getByRole('link', { name: 'Review queue', exact: true }).click();
  await page.getByRole('link', { name: 'View →' }).first().click(); await page.getByLabel('Review comment').fill('Clear progress. Thank you for the update.'); await page.getByRole('button', { name: 'Approve report', exact: true }).click();
  await expect(page.locator('main').getByText('Approved', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Version 1', exact: false })).toBeVisible();
});
test('employee cannot navigate to admin controls', async ({ page }) => { await signIn(page, 'employee'); await page.goto('/employees'); await expect(page.getByRole('heading', { name: 'This page requires additional permission' })).toBeVisible(); });
test('admin settings, employee management, projects and audit are real modules', async ({ page }) => {
  await signIn(page, 'admin'); await page.getByRole('link', { name: 'Employees', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your people' })).toBeVisible(); await page.getByLabel('Search', { exact: true }).fill('Alex Morgan'); await expect(page.locator('tbody')).toContainText('Alex Morgan');
  await page.getByRole('link', { name: 'Settings', exact: true }).click(); await page.getByLabel('Description minimum words').fill('10'); await page.getByRole('button', { name: 'Save policy' }).click(); await expect(page.getByText('Organization policy saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Projects', exact: true }).click(); await page.getByRole('button', { name: 'Create project', exact: true }).click(); await page.getByLabel('Project name').fill('Browser test initiative'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Browser test initiative' })).toBeVisible();
  await page.getByRole('link', { name: 'Audit logs', exact: true }).click(); await expect(page.locator('tbody')).toContainText('settings.save');
});
test('mobile navigation and modal keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await signIn(page, 'admin');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click(); await page.getByRole('link', { name: 'Projects', exact: true }).click(); await page.getByRole('button', { name: 'Create project', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('multiple entries, secondary task and a network failure preserve input for safe retry', async ({ page }) => {
  await signIn(page, 'employee'); await page.goto('/daily'); await page.getByRole('button', { name: 'Previous working day' }).click();
  await page.getByRole('button', { name: 'Add project' }).click(); await page.getByRole('button', { name: 'Add project' }).click();
  const descriptions = page.getByLabel('What did you work on?');
  await descriptions.nth(0).fill('Implemented the project reporting features and verified the full authorization workflow with colleagues.');
  await descriptions.nth(1).fill('Reviewed the customer experience requirements and documented the next iteration of our improvements.');
  await page.getByLabel('Regular hours', { exact: true }).nth(0).fill('3'); await page.getByLabel('Regular hours', { exact: true }).nth(1).fill('4');
  await page.getByLabel('Were you assigned a secondary task?').selectOption('true'); await page.getByLabel('Task name', { exact: true }).fill('Team support');
  await page.getByLabel('Description', { exact: true }).fill('Assisted colleagues with the daily reporting rollout.'); await page.getByLabel('Time spent (regular hours)').fill('1');
  await page.route('**/api/platform', route => route.request().postDataJSON()?.action === 'report.save' ? route.abort() : route.continue());
  await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByRole('alert')).toContainText('Network unavailable'); await expect(descriptions.nth(0)).toHaveValue('Implemented the project reporting features and verified the full authorization workflow with colleagues.');
  await expect(page.getByLabel('Task name', { exact: true })).toHaveValue('Team support'); await page.unroute('**/api/platform');
  await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByRole('status')).toContainText('Saved at');
  await page.getByRole('button', { name: 'Preview & submit' }).click(); await expect(page.getByRole('dialog')).toContainText('8 regular'); await expect(page.getByRole('dialog')).toContainText('Team support');
  await page.getByRole('button', { name: 'Confirm submission' }).click(); await expect(page).toHaveURL(/history\//);
});
test('CSV validation preview blocks invalid employees', async ({ page }) => {
  await signIn(page, 'admin'); await page.goto('/employees');
  await page.locator('input[type="file"]').setInputFiles({ name: 'employees.csv', mimeType: 'text/csv', buffer: Buffer.from('fullName,email,employeeId\nInvalid User,not-an-email,E123') });
  await expect(page.getByRole('dialog')).toContainText('Invalid email'); await expect(page.getByRole('button', { name: 'Invite validated employees' })).toBeDisabled();
});
test('analytics and Excel-compatible report export use authorized records', async ({ page }) => {
  await signIn(page, 'manager'); await page.goto('/analytics'); await expect(page.getByRole('heading', { name: 'Reporting insights' })).toBeVisible();
  await page.getByLabel('Group by').selectOption('weekly'); await expect(page.getByRole('heading', { name: 'Employee drill-down' })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export filtered reports' }).click(); expect((await download).suggestedFilename()).toBe('workpulse-analytics.csv');
});
test('notification preferences persist across a reload', async ({ page }) => {
  await signIn(page, 'employee'); await page.goto('/notifications'); await page.getByRole('button', { name: 'Disable personal reminders' }).click();
  await expect(page.getByRole('button', { name: 'Enable personal reminders' })).toBeVisible(); await page.reload(); await expect(page.getByRole('button', { name: 'Enable personal reminders' })).toBeVisible();
});
test('capture verified responsive application screens', async ({ page }) => {
  mkdirSync('artifacts/ui', { recursive: true }); await page.setViewportSize({ width: 1440, height: 1050 }); await signIn(page, 'admin');
  await page.screenshot({ path: 'artifacts/ui/admin-overview.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'artifacts/ui/mobile-overview.png', fullPage: true });
});