import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canEdit, canReview, defaultPolicy, policySchema, profileSchema, projectSchema, reportInputSchema, validateReport, workingDay, zonedNow, type Policy, type Project, type Report, type UserProfile } from '../shared/domain.js';

// Admin credentials are server-only. No API can choose its Firebase target from user input.
export function services() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(503, 'Firebase server configuration is missing.');
  if (!getApps().length) initializeApp({ projectId, credential: process.env.FIREBASE_ADMIN_PRIVATE_KEY ? cert({ projectId, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }) : applicationDefault() });
  return { db: getFirestore(), auth: getAuth() };
}
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function insist(condition: unknown, status: number, message: string): asserts condition { if (!condition) throw new HttpError(status, message); }
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const now = () => new Date().toISOString();
export async function actor(token: string) {
  const { auth, db } = services();
  const identity = await auth.verifyIdToken(token, true).catch(() => { throw new HttpError(401, 'Sign in again to continue.'); });
  const snap = await db.doc(`users/${identity.uid}`).get();
  insist(snap.exists && snap.data()?.active === true, 403, 'Your account is not activated or has been deactivated. Contact your administrator.');
  return { ...snap.data(), id: identity.uid } as UserProfile;
}
function audit(tx: Transaction, actorId: string, action: string, target: string, detail: Record<string, unknown> = {}) {
  const { db } = services(); tx.create(db.collection('auditEvents').doc(), { actorId, action, target, detail, createdAt: now() });
}
function notify(tx: Transaction, userId: string, key: string, title: string, body: string, href: string) {
  if (!userId) return; const { db } = services(); tx.set(db.doc(`notifications/${hash(`${userId}:${key}`)}`), { userId, title, body, href, read: false, createdAt: now() });
}
async function throttle(user: UserProfile) {
  const { db } = services(); const ref = db.doc(`rateLimits/${user.id}`); const minute = Math.floor(Date.now() / 60000);
  await db.runTransaction(async tx => { const s = await tx.get(ref); const count = s.data()?.minute === minute ? s.data()!.count + 1 : 1; insist(count <= 120, 429, 'Too many requests. Please wait a minute.'); tx.set(ref, { minute, count }); });
}
export async function dispatch(user: UserProfile, raw: unknown) {
  const envelope = z.object({ action: z.string().max(50), requestId: z.uuid(), payload: z.unknown() }).parse(raw);
  await throttle(user);
  const { db, auth } = services(); const { action, payload, requestId } = envelope;
  const operationRef = db.doc(`operations/${hash(`${user.id}:${requestId}`)}`);
  const fingerprint = hash(JSON.stringify({ action, payload }));
  async function transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(async tx => {
      const [op, freshActor] = await Promise.all([tx.get(operationRef), tx.get(db.doc(`users/${user.id}`))]);
      insist(freshActor.exists && freshActor.data()!.active === true && freshActor.data()!.role === user.role, 403, 'Permissions changed. Reload the application.');
      if (op.exists) { insist(op.data()!.fingerprint === fingerprint, 409, 'Retry key was already used for a different request.'); return op.data()!.result as T; }
      const result = await fn(tx); tx.create(operationRef, { userId: user.id, fingerprint, result, createdAt: now() }); return result;
    });
  }
  if (action === 'report.save') {
    const p = z.object({ input: reportInputSchema, submit: z.boolean(), version: z.number().int().min(0) }).parse(payload);
    const reportId = `${user.id}_${p.input.date}`; const ref = db.doc(`reports/${reportId}`);
    return transaction(async tx => {
      const settingsRef = db.doc('settings/organization');
      const [existing, settings, currentProfile] = await Promise.all([tx.get(ref), tx.get(settingsRef), tx.get(db.doc(`users/${user.id}`))]);
      const policy = { ...defaultPolicy, ...settings.data() } as Policy;
      const prior = existing.exists ? { ...existing.data(), id: reportId } as Report : null;
      insist((prior?.version ?? 0) === p.version, 409, 'A newer report version exists. Reload before editing; your unsaved text is retained locally.');
      insist(!prior || canEdit(user, prior, policy), 403, 'This report is locked. Request a correction from your manager.');
      const projectIds = [...new Set(p.input.entries.map(e => e.projectId))];
      const projectSnaps = await Promise.all(projectIds.map(id => tx.get(db.doc(`projects/${idSchema.parse(id)}`))));
      const projects = projectSnaps.filter(s => s.exists).map(s => ({ ...s.data(), id: s.id }) as Project);
      const errors = validateReport(p.input, policy, projects, user.id, p.submit);
      insist(!errors.length, 422, errors.join('\n'));
      const stamp = now(); const clock = zonedNow(policy.timezone); const profile = currentProfile.data() as UserProfile;
      const report: Report = { ...p.input, secondary: p.input.secondary.assigned ? p.input.secondary : { assigned: false, name: '', description: '', hours: 0, status: 'Not Started', deliverableUrl: '' }, id: reportId, employeeId: user.id, employeeName: profile.fullName, teamId: profile.teamId, departmentId: profile.departmentId, managerId: profile.managerId, projectIds,
        status: p.submit ? policy.requireApproval ? 'Submitted' : 'Approved' : 'Draft', version: p.version + 1, createdAt: prior?.createdAt ?? stamp, updatedAt: stamp,
        submittedAt: p.submit ? stamp : prior?.submittedAt ?? '', late: p.submit ? p.input.date < clock.date || clock.time > policy.deadline : prior?.late ?? false,
        feedback: prior?.feedback ?? '', reviewerId: prior?.reviewerId ?? '' };
      if (prior) tx.create(ref.collection('revisions').doc(String(prior.version)), { version: prior.version, report: prior, actorId: user.id, action: p.submit ? 'Resubmitted' : 'Edited', createdAt: stamp });
      tx.set(ref, report);
      audit(tx, user.id, p.submit ? 'report.submitted' : 'report.draft_saved', reportId, { version: report.version });
      if (p.submit) { notify(tx, user.id, `${reportId}:${report.version}:submitted`, 'Report submitted', `Your ${report.date} report was saved successfully.`, `/history/${reportId}`); notify(tx, report.managerId, `${reportId}:${report.version}:review`, 'Report ready for review', `${report.employeeName} submitted a report for ${report.date}.`, `/reviews/${reportId}`); }
      return report;
    });
  }
  if (action === 'report.review') {
    const p = z.object({ id: idSchema, version: z.number().int(), status: z.enum(['Under Review', 'Approved', 'Changes Requested']), comment: z.string().trim().max(10000) }).parse(payload);
    return transaction(async tx => {
      const ref = db.doc(`reports/${p.id}`); const s = await tx.get(ref); insist(s.exists, 404, 'Report not found.'); const report = s.data() as Report;
      insist(canReview(user, report), 403, 'You cannot review this employee report.');
      insist(report.version === p.version, 409, 'Report changed. Reload before reviewing.');
      insist(['Submitted', 'Under Review', 'Changes Requested'].includes(report.status), 409, 'This report cannot be reviewed in its current state.');
      insist(p.status !== 'Changes Requested' || p.comment.length >= 3, 422, 'Explain the requested corrections.');
      tx.create(ref.collection('revisions').doc(String(report.version)), { version: report.version, report, actorId: user.id, action: p.status, createdAt: now() });
      const updated = { ...report, status: p.status, feedback: p.comment || report.feedback, reviewerId: user.id, version: report.version + 1, updatedAt: now() };
      tx.set(ref, updated); if (p.comment) tx.create(ref.collection('comments').doc(), { authorId: user.id, authorName: user.fullName, text: p.comment, createdAt: now(), version: updated.version });
      audit(tx, user.id, 'report.reviewed', p.id, { status: p.status, version: updated.version });
      notify(tx, report.employeeId, `${p.id}:${updated.version}:${p.status}`, `Report ${p.status.toLowerCase()}`, p.comment || `Your ${report.date} report is ${p.status.toLowerCase()}.`, `/history/${p.id}`);
      return updated;
    });
  }
  if (action === 'project.save') {
    insist(user.role !== 'employee', 403, 'Project management requires a manager or administrator.');
    const p = z.object({ id: idSchema.optional(), project: projectSchema }).parse(payload); const id = p.id ?? randomUUID();
    return transaction(async tx => {
      const ref = db.doc(`projects/${id}`); const old = await tx.get(ref);
      insist(user.role === 'admin' || p.project.ownerId === user.id && p.project.teamId === user.teamId && (!old.exists || old.data()!.ownerId === user.id), 403, 'Managers can manage only their own team projects.');
      const memberIds = [...new Set(p.project.memberIds)]; const checkedIds = [...new Set([...memberIds, p.project.ownerId].filter(Boolean))];
      const roster = await Promise.all(checkedIds.map(uid => tx.get(db.doc(`users/${idSchema.parse(uid)}`))));
      const team = p.project.teamId ? await tx.get(db.doc(`teams/${idSchema.parse(p.project.teamId)}`)) : null;
      insist(!p.project.teamId || team?.exists, 422, 'Select an existing team.');
      insist(roster.every(s => s.exists && s.data()!.active && (user.role === 'admin' || s.id === user.id || s.data()!.managerId === user.id)), 403, 'Project contains unavailable or unauthorized members.');
      const updated = { ...p.project, memberIds, id, updatedAt: now(), createdAt: old.data()?.createdAt ?? now() };
      const previous: string[] = old.data()?.memberIds ?? [];
      const assignments = await Promise.all(memberIds.map(uid => tx.get(db.doc(`memberships/${id}_${uid}`))));
      const assignedAt = new Map(assignments.map(s => [s.data()?.userId, s.data()?.assignedAt]));
      tx.set(ref, updated);
      for (const uid of new Set([...previous, ...memberIds])) {
        const memberRef = db.doc(`memberships/${id}_${uid}`);
        if (memberIds.includes(uid)) tx.set(memberRef, { projectId: id, userId: uid, ownerId: p.project.ownerId, assignedAt: assignedAt.get(uid) ?? now(), startDate: p.project.startDate, endDate: p.project.endDate });
        else tx.delete(memberRef);
        if (previous.includes(uid) !== memberIds.includes(uid)) notify(tx, uid, `${id}:${requestId}:membership`, memberIds.includes(uid) ? 'New project assignment' : 'Project membership changed', p.project.name, `/projects/${id}`);
      }
      audit(tx, user.id, 'project.saved', id); return updated;
    });
  }
  if (action === 'user.profile') {
    const p = z.object({ fullName: z.string().trim().min(2).max(200) }).parse(payload);
    return transaction(async tx => { tx.update(db.doc(`users/${user.id}`), p); audit(tx, user.id, 'profile.updated', user.id); return { ok: true }; });
  }
  if (action === 'notification.read') {
    const p = z.object({ id: idSchema }).parse(payload);
    return transaction(async tx => { const ref = db.doc(`notifications/${p.id}`); const s = await tx.get(ref); insist(s.exists && s.data()!.userId === user.id, 403, 'Notification is not yours.'); tx.update(ref, { read: true }); return { ok: true }; });
  }
  if (action === 'notifications.preferences') {
    const p = z.object({ reminders: z.boolean() }).parse(payload);
    return transaction(async tx => { tx.set(db.doc(`notificationPreferences/${user.id}`), p); return { ok: true }; });
  }
  if (action === 'notifications.refresh') {
    return transaction(async tx => {
      const [s, prefs] = await Promise.all([tx.get(db.doc('settings/organization')), tx.get(db.doc(`notificationPreferences/${user.id}`))]); const policy = { ...defaultPolicy, ...s.data() } as Policy;
      const clock = zonedNow(policy.timezone);
      const report = await tx.get(db.doc(`reports/${user.id}_${clock.date}`));
      if (!policy.reminders || prefs.data()?.reminders === false || !workingDay(clock.date, policy) || report.exists && report.data()!.status !== 'Draft') return { ok: true };
      const diff = Number(policy.deadline.slice(0, 2)) * 60 + Number(policy.deadline.slice(3)) - Number(clock.time.slice(0, 2)) * 60 - Number(clock.time.slice(3));
      if (diff > 60) return { ok: true };
      const type = diff >= 0 ? 'deadline' : 'missing'; const key = `${clock.date}:${type}`; const ref = db.doc(`notifications/${hash(`${user.id}:${key}`)}`); const existing = await tx.get(ref);
      if (!existing.exists) notify(tx, user.id, key, type === 'deadline' ? 'Reporting deadline approaching' : 'Daily report missing', `Report for ${clock.date}; deadline ${policy.deadline} (${policy.timezone}). Attendance and hours are self-declared.`, '/daily');
      return { ok: true };
    });
  }
  insist(user.role === 'admin', 403, 'Administrator permission required.');
  if (action === 'settings.save') {
    const p = policySchema.parse(payload);
    return transaction(async tx => { tx.set(db.doc('settings/organization'), p); audit(tx, user.id, action, 'organization', p); return { ok: true }; });
  }
  if (action === 'group.save') {
    const p = z.object({ type: z.enum(['teams', 'departments']), id: idSchema.optional(), name: z.string().trim().min(2).max(200) }).parse(payload); const id = p.id ?? randomUUID();
    return transaction(async tx => { tx.set(db.doc(`${p.type}/${id}`), { name: p.name, id }); audit(tx, user.id, action, id); return { ok: true, id }; });
  }
  if (action === 'user.save') {
    const p = z.object({ id: idSchema, profile: profileSchema }).parse(payload);
    return transaction(async tx => {
      const ref = db.doc(`users/${p.id}`); const existing = await tx.get(ref); insist(existing.exists, 404, 'Employee not found.');
      insist(existing.data()!.email === p.profile.email, 422, 'Work email is immutable; invite a new account to change identity.');
      insist(p.id !== user.id || p.profile.active && p.profile.role === 'admin', 409, 'You cannot deactivate or demote yourself.');
      const refs = [['teams', p.profile.teamId], ['departments', p.profile.departmentId], ['users', p.profile.managerId]].filter(([, id]) => id);
      const related = await Promise.all(refs.map(([collection, id]) => tx.get(db.doc(`${collection}/${idSchema.parse(id)}`))));
      insist(related.every(s => s.exists), 422, 'Team, department or manager does not exist.');
      const manager = related.find(s => s.ref.parent.id === 'users');
      insist(!manager || manager.id !== p.id && manager.data()!.active && ['manager', 'admin'].includes(manager.data()!.role), 422, 'Select an active manager or administrator other than the employee.');
      tx.update(ref, p.profile); audit(tx, user.id, 'user.updated', p.id, { role: p.profile.role, active: p.profile.active }); return { ok: true };
    });
  }
  if (action === 'user.invite') {
    const p = profileSchema.parse(payload); const origin = process.env.APP_ORIGIN;
    insist(origin && /^https?:\/\//.test(origin), 503, 'APP_ORIGIN must be configured for invitations.');
    // Idempotent by work email. Never overwrite an existing account's privileges on an invitation retry.
    const managedUid = `wp_${hash(p.email.toLowerCase()).slice(0, 40)}`;
    let identity = await auth.getUserByEmail(p.email).catch((e: { code?: string }) => { if (e.code === 'auth/user-not-found') return null; throw e; });
    if (!identity) { try { identity = await auth.createUser({ uid: managedUid, email: p.email, displayName: p.fullName, emailVerified: false }); } catch (e) { identity = await auth.getUserByEmail(p.email).catch(() => { throw e; }); } }
    const uid = identity.uid;
    // Public Firebase signup must not let an attacker squat on an unverified work email,
    // then inherit invited privileges with a password they chose. Managed UIDs can only
    // be created by an Admin SDK operator and allow recovery from partial provisioning.
    if (uid !== managedUid && !identity.emailVerified) {
      const existingProfile = await db.doc(`users/${uid}`).get();
      insist(existingProfile.exists, 409, 'An unverified, unmanaged Auth account already uses this email. The owner must verify their email or an authorized operator must resolve that identity before invitation.');
    }
    await transaction(async tx => {
      const ref = db.doc(`users/${uid}`); const old = await tx.get(ref);
      insist(!old.exists || old.data()!.email.toLowerCase() === p.email.toLowerCase(), 409, 'Employee identity conflict.');
      if (old.exists) return { ok: true, id: uid };
      const refs = [['teams', p.teamId], ['departments', p.departmentId], ['users', p.managerId]].filter(([, id]) => id);
      const related = await Promise.all(refs.map(([c, id]) => tx.get(db.doc(`${c}/${idSchema.parse(id)}`))));
      insist(related.every(s => s.exists), 422, 'Team, department or manager does not exist.');
      const manager = related.find(s => s.ref.parent.id === 'users'); insist(!manager || manager.data()!.active && ['manager', 'admin'].includes(manager.data()!.role), 422, 'Select an active manager.');
      tx.create(ref, { ...p, email: p.email.toLowerCase(), id: uid, createdAt: now() }); audit(tx, user.id, 'user.invited', uid, { role: p.role }); return { ok: true, id: uid };
    });
    const activationUrl = await auth.generatePasswordResetLink(p.email, { url: `${origin}/login` });
    return { ok: true, id: uid, activationUrl };
  }
  throw new HttpError(404, 'Unknown operation.');
}
