import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { services } from '../server/platform.js';
import { emptyReport, zonedNow, type Report, type UserProfile } from '../shared/domain.js';

// Explicit opt-in only. Never modify an existing user's password or delete reports.
// Generated credentials/tokens remain in memory. Test accounts are disabled in finally.
if (process.env.WORKPULSE_ALLOW_PRODUCTION_SMOKE !== '1' || process.env.FIREBASE_PROJECT_ID !== 'workpulse-13227' || process.env.APP_ORIGIN !== 'https://workpulse-lake-three.vercel.app') throw new Error('Explicit WorkPulse production smoke-test authorization required.');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Remove emulator variables for this production-only check.');
const { db, auth } = services();
const origin = process.env.APP_ORIGIN;
const apiKey = process.env.VITE_FIREBASE_API_KEY!;
const run = randomUUID().slice(0, 8), stamp = new Date().toISOString();
const password = randomBytes(32).toString('base64url');
const profiles: UserProfile[] = [];
let projectId = '', adminToken = '';
async function signIn(email: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await response.json(); if (!response.ok) throw new Error(`Firebase sign-in failed: ${data.error?.message}`); return data.idToken as string;
}
async function call<T>(token: string, action: string, payload: unknown, expected = 200) {
  const response = await fetch(`${origin}/api/platform`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: origin }, body: JSON.stringify({ action, payload, requestId: randomUUID() }) });
  const text = await response.text(); let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(`API ${action}: HTTP ${response.status}, non-JSON response`); }
  if (response.status !== expected) throw new Error(`API ${action}: HTTP ${response.status}; ${(data as { error?: string }).error ?? 'unexpected response'}`);
  return data as T;
}
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ['admin', 'manager', 'employee'] as const) {
    const uid = `wp_smoke_${run}_${role}`;
    const profile: UserProfile = { id: uid, fullName: `[SMOKE TEST ${run}] ${role}`, email: `${uid}@example.invalid`, employeeId: uid, departmentId: '', teamId: '', managerId: role === 'employee' ? `wp_smoke_${run}_manager` : '', role, active: true, createdAt: stamp };
    await auth.createUser({ uid, email: profile.email, password, emailVerified: true, displayName: profile.fullName });
    profiles.push(profile); await db.doc(`users/${uid}`).create(profile);
  }
  const [admin, manager, employee] = profiles;
  adminToken = await signIn(admin.email); const managerToken = await signIn(manager.email), employeeToken = await signIn(employee.email);
  console.log('PASS: production Firebase Auth sign-in for synthetic administrator, manager and employee.');
  const project = await call<{ id: string }>(adminToken, 'project.save', { project: { name: `[SMOKE TEST ${run}] Deployment verification`, description: 'Synthetic deployment verification; not actual employee work.', ownerId: manager.id, teamId: '', memberIds: [employee.id], startDate: zonedNow('UTC').date, endDate: '', status: 'Active' } });
  projectId = project.id;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/employees`); await expect(page).toHaveURL(/login/, { timeout: 30000 });
  await page.getByLabel('Work email').fill(employee.email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible({ timeout: 30000 });
  await page.getByRole('link', { name: 'Daily report', exact: true }).click(); await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByLabel('Regular hours', { exact: true }).fill('1');
  await page.getByLabel('What did you work on?').fill('Synthetic deployment verification only; tested authentication reporting authorization and review workflows without representing real work.');
  await page.getByRole('button', { name: 'Save draft' }).click(); await expect(page.getByRole('status')).toContainText('Saved at', { timeout: 30000 });
  await page.getByRole('button', { name: 'Preview & submit' }).click(); await page.getByRole('button', { name: 'Confirm submission' }).click(); await expect(page).toHaveURL(/history\//, { timeout: 30000 });
  const reportId = page.url().split('/').at(-1)!;
  const stored = await db.doc(`reports/${reportId}`).get(); let report = stored.data() as Report;
  console.log('PASS: live browser protected routes, employee sign-in, draft, preview and confirmed submission.');
  await call(employeeToken, 'settings.save', {}, 403);
  await call(employeeToken, 'report.review', { id: reportId, version: report.version, status: 'Approved', comment: 'Attempted self approval' }, 403);
  const denied = await fetch(`https://firestore.googleapis.com/v1/projects/workpulse-13227/databases/(default)/documents/users/${admin.id}`, { headers: { Authorization: `Bearer ${employeeToken}` } });
  if (denied.status !== 403) throw new Error('Cross-employee Firestore read was not denied.');
  report = await call<Report>(managerToken, 'report.review', { id: reportId, version: report.version, status: 'Changes Requested', comment: 'Synthetic test: confirm corrected submission and immutable history.' });
  report = await call<Report>(employeeToken, 'report.save', { input: { ...report, managerNotes: 'Synthetic correction verified.' }, submit: true, version: report.version });
  report = await call<Report>(managerToken, 'report.review', { id: reportId, version: report.version, status: 'Approved', comment: 'Synthetic deployment verification complete. Not real work.' });
  const revisions = await db.collection(`reports/${reportId}/revisions`).get(); if (revisions.size < 4) throw new Error('Revision history missing.');
  console.log('PASS: live manager corrections/resubmission/approval, revision preservation, API escalation and database isolation checks.');
  await page.reload(); await expect(page.locator('main').getByText('Approved', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.setViewportSize({ width: 390, height: 844 }); if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error('Mobile horizontal overflow.');
  if (errors.length) throw new Error(`Browser runtime errors: ${errors.join('; ')}`);
  console.log('PASS: production mobile layout and zero uncaught browser runtime errors.');
  await call(adminToken, 'user.save', { id: employee.id, profile: { ...employee, active: false } });
  await call(employeeToken, 'user.profile', { fullName: 'Inactive attempt' }, 403);
  console.log('PASS: deactivated employee denied by live API.');
} finally {
  if (projectId && adminToken) {
    const s = await db.doc(`projects/${projectId}`).get();
    if (s.exists) await call(adminToken, 'project.save', { id: projectId, project: { ...s.data(), status: 'Archived', memberIds: [] } }).catch(() => console.log('WARNING: synthetic project archive failed; operator review required.'));
  }
  for (const p of profiles) { await db.doc(`users/${p.id}`).set({ active: false }, { merge: true }); await auth.updateUser(p.id, { disabled: true }); await auth.revokeRefreshTokens(p.id); }
  await db.collection('auditEvents').add({ actorId: 'trusted-deployment-verifier', action: 'deployment.smoke_cleanup', target: run, detail: { disabledSyntheticUids: profiles.map(p => p.id), archivedProjectId: projectId }, createdAt: new Date().toISOString() });
  await browser.close();
  console.log('Synthetic accounts disabled and refresh tokens revoked. Test records retained, clearly labeled; no production records deleted.');
}
