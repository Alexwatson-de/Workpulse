import { services } from '../server/platform.js';
import { defaultPolicy } from '../shared/domain.js';
import { createHash } from 'node:crypto';
// Operator-only: Application Default Credentials or server environment required.
const email = process.env.WORKPULSE_BOOTSTRAP_EMAIL;
const fullName = process.env.WORKPULSE_BOOTSTRAP_NAME;
if (!email || !fullName) throw new Error('Set WORKPULSE_BOOTSTRAP_EMAIL and WORKPULSE_BOOTSTRAP_NAME.');
const { db, auth } = services();
const existingAdmins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
if (!existingAdmins.empty) throw new Error('An administrator already exists. Use the admin UI; bootstrap refuses to modify existing administrators.');
const managedUid = `wp_bootstrap_${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 40)}`;
const identity = await auth.getUserByEmail(email).catch(async e => { if (e.code !== 'auth/user-not-found') throw e; return auth.createUser({ uid: managedUid, email, displayName: fullName }); });
if (identity.uid !== managedUid && !identity.emailVerified) throw new Error('Refusing to elevate a pre-existing unverified Auth account. Resolve email ownership securely before bootstrap.');
await db.runTransaction(async tx => {
  const lock = db.doc('system/bootstrap'); const locked = await tx.get(lock);
  const userRef = db.doc(`users/${identity.uid}`); const prior = await tx.get(userRef);
  const settingsRef = db.doc('settings/organization'); const settings = await tx.get(settingsRef);
  if (locked.exists || prior.exists) throw new Error('Bootstrap already performed or target account exists. No records changed.');
  tx.create(userRef, { id: identity.uid, fullName, email: email.toLowerCase(), employeeId: 'ADMIN-001', departmentId: '', teamId: '', managerId: '', role: 'admin', active: true, createdAt: new Date().toISOString() });
  if (!settings.exists) tx.create(settingsRef, defaultPolicy);
  tx.create(lock, { uid: identity.uid, createdAt: new Date().toISOString() });
  tx.create(db.collection('auditEvents').doc(), { actorId: identity.uid, action: 'organization.bootstrapped', target: identity.uid, createdAt: new Date().toISOString() });
});
console.log('Initial administrator created. Use Forgot password at the sign-in screen to activate. No credentials printed.');