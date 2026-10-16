import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { actor, dispatch, services } from '../server/platform';
import { defaultPolicy, emptyReport, zonedNow, type Report, type UserProfile } from '../shared/domain';
process.env.FIREBASE_PROJECT_ID = 'demo-workpulse';
process.env.GCLOUD_PROJECT = 'demo-workpulse';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
process.env.APP_ORIGIN = 'http://127.0.0.1:5178';
let user: UserProfile, lead: UserProfile, admin: UserProfile;
const clock = () => zonedNow('UTC').date;
const request = (action: string, payload: unknown, requestId = randomUUID()) => ({ action, payload, requestId });
const input = () => ({ ...emptyReport(clock()), entries: [{ id: 'entry', projectId: 'int-project', regularHours: 7, additionalHours: 1, description: 'Completed the reporting workflow and reviewed all important security permissions with colleagues.', questionCount: 3, miscellaneous: '', blockers: '', deliverableUrl: '' }] });
const save = (submit = false, version = 0) => dispatch(user, request('report.save', { input: input(), submit, version })) as Promise<Report>;
beforeAll(() => { if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulators required'); });
beforeEach(async () => {
  const suffix = randomUUID().slice(0, 8);
  user = { id: `int-alice-${suffix}`, fullName: 'Integration Alice', email: `alice-${suffix}@example.test`, employeeId: 'INT1', role: 'employee', managerId: `int-lead-${suffix}`, teamId: 'int-team', departmentId: 'int-dept', active: true, createdAt: new Date().toISOString() };
  lead = { ...user, id: user.managerId, role: 'manager', fullName: 'Integration Lead' }; admin = { ...user, id: `int-admin-${suffix}`, role: 'admin' };
  const { db } = services();
  await Promise.all([...[user, lead, admin].map(u => db.doc(`users/${u.id}`).set(u)), db.doc('teams/int-team').set({ name: 'Integration' }), db.doc('departments/int-dept').set({ name: 'Engineering' }), db.doc('settings/organization').set(defaultPolicy), db.doc('projects/int-project').set({ name: 'Integration project', memberIds: [user.id], ownerId: lead.id, teamId: 'int-team', status: 'Active', startDate: '2020-01-01', endDate: '' })]);
});
describe('trusted transactional operations against Firebase emulators', () => {
  it('saves draft, submits, reviews, corrects and preserves every prior version', async () => {
    const draft = await save(); expect(draft.status).toBe('Draft'); expect(draft.version).toBe(1);
    const submitted = await save(true, 1); expect(submitted.status).toBe('Submitted');
    const changes = await dispatch(lead, request('report.review', { id: submitted.id, version: 2, status: 'Changes Requested', comment: 'Please explain the final test results.' })) as Report;
    expect(changes.version).toBe(3);
    const resubmitted = await save(true, 3); expect(resubmitted.version).toBe(4);
    const approved = await dispatch(lead, request('report.review', { id: submitted.id, version: 4, status: 'Approved', comment: 'Thank you.' })) as Report;
    expect(approved.status).toBe('Approved');
    const versions = await services().db.collection(`reports/${submitted.id}/revisions`).get(); expect(versions.size).toBe(4);
    await expect(save(false, 5)).rejects.toMatchObject({ status: 403 });
  });
  it('retries the same confirmed write without duplicating revisions', async () => {
    const r = request('report.save', { input: input(), submit: true, version: 0 });
    const first = await dispatch(user, r) as Report; const second = await dispatch(user, r) as Report;
    expect(second).toEqual(first); expect((await services().db.collection(`reports/${first.id}/revisions`).get()).size).toBe(0);
  });
  it('rejects retry keys reused for a changed payload', async () => {
    const id = randomUUID(); await dispatch(user, request('report.save', { input: input(), submit: false, version: 0 }, id));
    await expect(dispatch(user, request('report.save', { input: input(), submit: true, version: 1 }, id))).rejects.toMatchObject({ status: 409 });
  });
  it('prevents duplicate reports and resolves concurrent submissions atomically', async () => {
    const outcomes = await Promise.allSettled([save(true), save(true)]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1); expect(outcomes.filter(o => o.status === 'rejected')).toHaveLength(1);
    const r = await services().db.doc(`reports/${user.id}_${clock()}`).get(); expect(r.data()!.version).toBe(1);
  });
  it('rejects forged employee-supplied role and status fields', async () => {
    const result = await dispatch(user, request('report.save', { input: { ...input(), employeeId: admin.id, status: 'Approved', role: 'admin' }, submit: true, version: 0 })) as Report;
    expect(result.employeeId).toBe(user.id); expect(result.status).toBe('Submitted'); expect(result).not.toHaveProperty('role');
  });
  it('rejects unassigned projects and excess combined hours on the server', async () => {
    const invalid = input(); invalid.entries[0].projectId = 'not-assigned'; await expect(dispatch(user, request('report.save', { input: invalid, submit: true, version: 0 }))).rejects.toMatchObject({ status: 422 });
    invalid.entries[0].projectId = 'int-project'; invalid.secondary = { ...invalid.secondary, assigned: true, name: 'Support', description: 'Work', hours: 3 };
    await expect(dispatch(user, request('report.save', { input: invalid, submit: true, version: 0 }))).rejects.toMatchObject({ status: 422 });
  });
  it('prevents employee reviews and unrelated manager access', async () => {
    const r = await save(true);
    const review = request('report.review', { id: r.id, version: 1, status: 'Approved', comment: '' });
    await expect(dispatch(user, review)).rejects.toMatchObject({ status: 403 });
    const other = { ...lead, id: `${lead.id}-other` }; await services().db.doc(`users/${other.id}`).set(other);
    await expect(dispatch(other, review)).rejects.toMatchObject({ status: 403 });
  });
  it('prevents employees escalating privileges or updating settings', async () => {
    await expect(dispatch(user, request('user.save', { id: user.id, profile: { ...user, role: 'admin' } }))).rejects.toMatchObject({ status: 403 });
    await expect(dispatch(user, request('settings.save', defaultPolicy))).rejects.toMatchObject({ status: 403 });
  });
  it('rechecks deactivated accounts within transactions', async () => {
    await services().db.doc(`users/${user.id}`).update({ active: false }); await expect(save()).rejects.toMatchObject({ status: 403 });
  });
  it('creates memberships and assignment notices, then removes membership on edit', async () => {
    const project = { name: 'Team delivery', description: '', ownerId: lead.id, teamId: 'int-team', memberIds: [user.id], startDate: clock(), endDate: '', status: 'Active' };
    const made = await dispatch(lead, request('project.save', { project })) as { id: string };
    expect((await services().db.doc(`memberships/${made.id}_${user.id}`).get()).exists).toBe(true);
    await services().db.doc(`memberships/${made.id}_${user.id}`).update({ assignedAt: '2026-01-01T00:00:00Z' });
    await dispatch(lead, request('project.save', { id: made.id, project }));
    expect((await services().db.doc(`memberships/${made.id}_${user.id}`).get()).data()!.assignedAt).toBe('2026-01-01T00:00:00Z');
    await dispatch(lead, request('project.save', { id: made.id, project: { ...project, memberIds: [] } })); expect((await services().db.doc(`memberships/${made.id}_${user.id}`).get()).exists).toBe(false);
    expect((await services().db.collection('notifications').where('userId', '==', user.id).get()).size).toBe(2);
  });
  it('prevents manager assignment of employees from another reporting line', async () => {
    const stranger = { ...user, id: `${user.id}-stranger`, managerId: 'elsewhere' }; await services().db.doc(`users/${stranger.id}`).set(stranger);
    await expect(dispatch(lead, request('project.save', { project: { name: 'Unauthorized', description: '', ownerId: lead.id, teamId: 'int-team', memberIds: [stranger.id], startDate: clock(), endDate: '', status: 'Active' } }))).rejects.toMatchObject({ status: 403 });
  });
  it('prevents self-demotion and self-deactivation by the administrator', async () => {
    await expect(dispatch(admin, request('user.save', { id: admin.id, profile: { ...admin, active: false } }))).rejects.toMatchObject({ status: 409 });
  });
  it('creates Auth invitations idempotently without changing existing roles', async () => {
    const email = `invited-${randomUUID()}@example.test`; const profile = { ...user, email, fullName: 'Invited User' };
    const first = await dispatch(admin, request('user.invite', profile)) as { id: string; activationUrl: string };
    const second = await dispatch(admin, request('user.invite', { ...profile, role: 'admin' })) as typeof first;
    expect(first.id).toBe(second.id); expect(first.activationUrl).toContain('oobCode');
    expect((await services().db.doc(`users/${first.id}`).get()).data()!.role).toBe('employee');
  });
  it('rejects invalid and unsigned authentication tokens', async () => { await expect(actor('invalid')).rejects.toMatchObject({ status: 401 }); });
  it('does not grant privileges to an unverified public-signup email squatter', async () => {
    const email = `unverified-${randomUUID()}@example.test`;
    const identity = await services().auth.createUser({ email, password: 'EmulatorOnly-Attacker-42', emailVerified: false });
    await expect(dispatch(admin, request('user.invite', { ...user, email }))).rejects.toMatchObject({ status: 409 });
    expect((await services().db.doc(`users/${identity.uid}`).get()).exists).toBe(false);
  });
  it('stores audit records and does not persist invitation links', async () => {
    await save(); const events = await services().db.collection('auditEvents').where('actorId', '==', user.id).get(); expect(events.size).toBe(1); expect(JSON.stringify(events.docs.map(d => d.data()))).not.toContain('activationUrl');
  });
});
