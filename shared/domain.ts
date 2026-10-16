import { z } from 'zod';

// Employee-reported records, never evidence of independently verified attendance.
export const roles = ['employee', 'manager', 'admin'] as const;
export type Role = typeof roles[number];
export const reportStatuses = ['Draft', 'Submitted', 'Under Review', 'Changes Requested', 'Approved'] as const;
export type Status = typeof reportStatuses[number];
export interface UserProfile {
  id: string; fullName: string; email: string; employeeId: string; departmentId: string;
  teamId: string; managerId: string; role: Role; active: boolean; createdAt: string;
}
export interface Group { id: string; name: string }
export interface Project {
  id: string; name: string; description: string; ownerId: string; teamId: string;
  memberIds: string[]; startDate: string; endDate: string;
  status: 'Planned' | 'Active' | 'On Hold' | 'Completed' | 'Archived';
}
export interface Policy {
  id?: string; regularLimit: number; additionalLimit: number; descriptionWords: number;
  deadline: string; timezone: string; workingDays: number[]; holidays: string[];
  attendanceOptions: string[]; historicalDays: number; editSubmitted: boolean;
  requireApproval: boolean; leaveRequiresHours: boolean; allowArchived: boolean;
  requiredFields: string[]; reminders: boolean;
}
export const defaultPolicy: Policy = {
  regularLimit: 8, additionalLimit: 6, descriptionWords: 10, deadline: '18:00', timezone: 'UTC',
  workingDays: [1, 2, 3, 4, 5], holidays: [], attendanceOptions: ['In Office', 'Work From Home', 'Half Day', 'On Leave / Off'],
  historicalDays: 7, editSubmitted: false, requireApproval: true, leaveRequiresHours: false,
  allowArchived: false, requiredFields: [], reminders: true,
};
const text = z.string().max(10000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date');
const url = z.string().max(2048).refine(v => !v || /^https?:\/\//i.test(v) && URL.canParse(v), 'Use a valid http(s) URL');
export const entrySchema = z.object({
  id: z.string().min(1).max(100), projectId: z.string().min(1).max(128),
  regularHours: z.number().finite().min(0).max(24), additionalHours: z.number().finite().min(0).max(24),
  description: text, questionCount: z.number().int().min(0).max(1000000), miscellaneous: text,
  deliverableUrl: url, blockers: text,
});
export const secondarySchema = z.object({ assigned: z.boolean(), name: z.string().max(200), description: text,
  hours: z.number().finite().min(0).max(24), status: z.enum(['Not Started', 'In Progress', 'Completed']), deliverableUrl: url });
export const reportInputSchema = z.object({
  date, attendance: z.string().min(1).max(100), entries: z.array(entrySchema).max(30), secondary: secondarySchema,
  blockers: text, dependencies: text, nextDay: text, miscellaneous: text, managerNotes: text,
});
export type ReportInput = z.infer<typeof reportInputSchema>;
export interface Report extends ReportInput {
  id: string; employeeId: string; employeeName: string; teamId: string; departmentId: string; managerId: string;
  projectIds: string[]; status: Status; version: number; createdAt: string; updatedAt: string;
  submittedAt: string; late: boolean; feedback: string; reviewerId: string;
}
export interface Notice { id: string; userId: string; title: string; body: string; href: string; read: boolean; createdAt: string }
export interface Revision { id: string; version: number; report: Report; actorId: string; action: string; createdAt: string }
export const projectSchema = z.object({ name: z.string().trim().min(2).max(200), description: text,
  ownerId: z.string().max(128), teamId: z.string().max(128), memberIds: z.array(z.string().min(1).max(128)).max(100),
  startDate: date, endDate: z.union([date, z.literal('')]), status: z.enum(['Planned', 'Active', 'On Hold', 'Completed', 'Archived'])
}).refine(p => !p.endDate || p.endDate >= p.startDate, 'End date must be after start date');
export const policySchema = z.object({
  regularLimit: z.number().min(0).max(24), additionalLimit: z.number().min(0).max(24), descriptionWords: z.number().int().min(0).max(200),
  deadline: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), holidays: z.array(date).max(366),
  attendanceOptions: z.array(z.string().trim().min(1).max(100)).min(1).max(10).refine(a => new Set(a).size === a.length, 'Duplicate attendance choices'),
  historicalDays: z.number().int().min(0).max(366), editSubmitted: z.boolean(), requireApproval: z.boolean(), leaveRequiresHours: z.boolean(),
  allowArchived: z.boolean(), requiredFields: z.array(z.enum(['blockers', 'dependencies', 'nextDay', 'miscellaneous', 'managerNotes', 'deliverableUrl', 'questionCount'])), reminders: z.boolean(),
}).refine(p => p.regularLimit + p.additionalLimit <= 24, 'Combined hour limits cannot exceed 24');
export const profileSchema = z.object({ fullName: z.string().trim().min(2).max(200), email: z.email().max(254), employeeId: z.string().trim().min(1).max(100), departmentId: z.string().max(128), teamId: z.string().max(128), managerId: z.string().max(128), role: z.enum(roles), active: z.boolean() });
export function zonedNow(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export const hours = (r: ReportInput) => ({ regular: r.entries.reduce((n, e) => n + e.regularHours, 0) + (r.secondary.assigned ? r.secondary.hours : 0), additional: r.entries.reduce((n, e) => n + e.additionalHours, 0) });
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export function workingDay(day: string, policy: Policy) { return policy.workingDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay()) && !policy.holidays.includes(day); }
export function previousWorkingDay(day: string, policy: Policy) { const d = new Date(`${day}T12:00:00Z`); for (let i = 0; i < 740; i++) { d.setUTCDate(d.getUTCDate() - 1); const v = d.toISOString().slice(0, 10); if (workingDay(v, policy)) return v; } throw new Error('No working day configured'); }
export function canReadReport(user: UserProfile, report: Pick<Report, 'employeeId' | 'managerId' | 'teamId'>) { return user.active && (user.role === 'admin' || report.employeeId === user.id || user.role === 'manager' && report.managerId === user.id); }
export function canReview(user: UserProfile, report: Report) { return user.active && report.employeeId !== user.id && (user.role === 'admin' || user.role === 'manager' && report.managerId === user.id); }
export function canEdit(user: UserProfile, report: Report, policy: Policy) { return user.active && report.employeeId === user.id && (['Draft', 'Changes Requested'].includes(report.status) || policy.editSubmitted && report.status === 'Submitted'); }
export function validateReport(input: ReportInput, policy: Policy, projects: Project[], employeeId: string, submit: boolean, now = new Date()) {
  const errors: string[] = []; const today = zonedNow(policy.timezone, now).date;
  const days = Math.round((Date.parse(today) - Date.parse(input.date)) / 86400000);
  if (days < 0 || days > policy.historicalDays) errors.push(`Report date must be within the last ${policy.historicalDays} days and not in the future.`);
  if (!policy.attendanceOptions.includes(input.attendance)) errors.push('Select an allowed attendance declaration.');
  if (new Set(input.entries.map(e => e.id)).size !== input.entries.length) errors.push('Project entry IDs must be unique.');
  const h = hours(input);
  if (h.regular > policy.regularLimit + 0.000001) errors.push(`Regular hours, including secondary work, exceed ${policy.regularLimit}.`);
  if (h.additional > policy.additionalLimit + 0.000001) errors.push(`Additional hours exceed ${policy.additionalLimit}.`);
  const leave = input.attendance === 'On Leave / Off';
  if (submit && (!leave || policy.leaveRequiresHours) && (!input.entries.length || h.regular + h.additional <= 0)) errors.push('Add at least one project and report positive work hours.');
  for (const [i, e] of input.entries.entries()) {
    const p = projects.find(p => p.id === e.projectId);
    if (!p || !p.memberIds.includes(employeeId) || p.status === 'Archived' && !policy.allowArchived) errors.push(`Project ${i + 1} is not an available assignment.`);
    if (p && (input.date < p.startDate || p.endDate && input.date > p.endDate)) errors.push(`Project ${i + 1} is outside its assignment dates.`);
    if (submit && wordCount(e.description) < policy.descriptionWords) errors.push(`Project ${i + 1} description needs at least ${policy.descriptionWords} words.`);
    if (submit && policy.requiredFields.includes('deliverableUrl') && !e.deliverableUrl) errors.push(`Project ${i + 1} needs a deliverable URL.`);
  }
  if (submit && input.secondary.assigned && (!input.secondary.name.trim() || !input.secondary.description.trim())) errors.push('Complete secondary task name and description.');
  for (const field of policy.requiredFields) if (submit && field in input && !String(input[field as keyof ReportInput]).trim()) errors.push(`${field} is required.`);
  return errors;
}
export const emptyReport = (date: string, attendance = 'In Office'): ReportInput => ({ date, attendance, entries: [], secondary: { assigned: false, name: '', description: '', hours: 0, status: 'Not Started', deliverableUrl: '' }, blockers: '', dependencies: '', nextDay: '', miscellaneous: '', managerNotes: '' });
export function csvCell(value: unknown) { let s = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; }
export function toCsv(rows: unknown[][]) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
export function exportReports(reports: Report[]) {
  return toCsv([['Employee', 'Date', 'Attendance declaration', 'Project ID', 'Regular hours', 'Additional hours', 'Work description', 'Questions', 'Secondary task', 'Secondary regular hours', 'Submitted at', 'Status', 'Feedback'], ...reports.flatMap(r => (r.entries.length ? r.entries : [null]).map((e, i) => [r.employeeName, r.date, r.attendance, e?.projectId ?? '', e?.regularHours ?? 0, e?.additionalHours ?? 0, e?.description ?? '', e?.questionCount ?? 0, i === 0 && r.secondary.assigned ? r.secondary.name : '', i === 0 && r.secondary.assigned ? r.secondary.hours : 0, r.submittedAt, r.status, r.feedback]))]);
}
// RFC4180 parser with quoted newlines; CSV imports are previewed before trusted invitations.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) { const c = input[i]; if (c === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else if (!quoted && cell) throw new Error('Unexpected quote'); else quoted = !quoted; } else if (c === ',' && !quoted) { row.push(cell); cell = ''; } else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && input[i + 1] === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; } else cell += c; }
  if (quoted) throw new Error('Unclosed CSV quote'); if (cell || row.length) { row.push(cell); rows.push(row); } return rows;
}
export function employeeImport(text: string) {
  const [headers, ...rows] = parseCsv(text); if (!headers) throw new Error('CSV is empty');
  const seen = new Set<string>();
  return rows.map((row, index) => { const raw = Object.fromEntries(headers.map((h, i) => [h.trim(), row[i]?.trim() ?? '']));
    const parsed = profileSchema.safeParse({ ...raw, role: raw.role || 'employee', active: raw.active !== 'false', departmentId: raw.departmentId || '', teamId: raw.teamId || '', managerId: raw.managerId || '' });
    const duplicate = seen.has((raw.email || '').toLowerCase()); seen.add((raw.email || '').toLowerCase());
    return { row: index + 2, data: parsed.success ? parsed.data : null, error: duplicate ? 'Duplicate email in import' : parsed.success ? '' : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  });
}
