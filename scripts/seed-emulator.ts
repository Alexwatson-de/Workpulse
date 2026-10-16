import { services } from '../server/platform.js';
import { defaultPolicy } from '../shared/domain.js';
// Test fixtures only. Hard refusal prevents running seeds against a real project.
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_PROJECT_ID !== 'demo-workpulse') throw new Error('Local demo-workpulse emulators required.');
if (!['127.0.0.1:8088', 'localhost:8088'].includes(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Only the loopback test emulator may be reset.');
const cleared = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-workpulse/databases/(default)/documents`, { method: 'DELETE' });
if (!cleared.ok) throw new Error('Could not reset local test fixtures.');
const { auth, db } = services();
const stamp = new Date().toISOString();
for (const [id, name, role, managerId] of [['e2e-employee', 'Alex Morgan', 'employee', 'e2e-manager'], ['e2e-manager', 'Jordan Lee', 'manager', 'e2e-admin'], ['e2e-admin', 'Sam Rivera', 'admin', '']] as const) {
  const email = `${role}@workpulse.test`; const data = { uid: id, email, password: 'EmulatorOnly-WorkPulse-42', displayName: name, emailVerified: true };
  await auth.getUser(id).then(() => auth.updateUser(id, data)).catch(e => { if (e.code !== 'auth/user-not-found') throw e; return auth.createUser(data); });
  await db.doc(`users/${id}`).set({ id, fullName: name, email, employeeId: `WP-${role.toUpperCase()}`, role, managerId, teamId: 'e2e-team', departmentId: 'e2e-dept', active: true, createdAt: stamp });
}
await db.doc('teams/e2e-team').set({ name: 'Product & Engineering' });
await db.doc('departments/e2e-dept').set({ name: 'Engineering' });
await db.doc('settings/organization').set(defaultPolicy);
await db.doc('projects/e2e-project').set({ id: 'e2e-project', name: 'Customer Experience Platform', description: 'A connected, accessible experience for our customers.', ownerId: 'e2e-manager', teamId: 'e2e-team', memberIds: ['e2e-employee', 'e2e-manager'], startDate: '2020-01-01', endDate: '', status: 'Active' });
console.log('Emulator-only accounts seeded. No production writes.');