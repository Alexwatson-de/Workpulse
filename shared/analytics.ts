import { hours, workingDay, type Policy, type Report, type UserProfile } from './domain';
export function dateRange(from: string, to: string) { const dates: string[] = []; if (from > to) return dates; const d = new Date(`${from}T12:00:00Z`); for (let i = 0; i < 367 && d.toISOString().slice(0, 10) <= to; i++, d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10)); return dates; }
export function summarize(reports: Report[], roster: UserProfile[], policy: Policy, from: string, to: string) {
  const employees = roster.filter(u => u.active); const dates = dateRange(from, to); const days = dates.filter(d => workingDay(d, policy));
  const eligible = (date: string) => employees.filter(u => u.createdAt.slice(0, 10) <= date);
  const confirmed = reports.filter(r => r.date >= from && r.date <= to && r.status !== 'Draft');
  const series = dates.map(date => { const expected = workingDay(date, policy) ? eligible(date).length : 0; const today = confirmed.filter(r => r.date === date); const eligibleIds = new Set(eligible(date).map(u => u.id)); const complete = expected ? new Set(today.filter(r => eligibleIds.has(r.employeeId)).map(r => r.employeeId)).size : 0;
    return { date, expected, submitted: today.length, completed: complete, missing: Math.max(0, expected - complete), rate: expected ? Math.round(complete / expected * 100) : 0, regular: today.reduce((n, r) => n + hours(r).regular, 0), additional: today.reduce((n, r) => n + hours(r).additional, 0), late: today.filter(r => r.late).length };
  });
  const expected = series.reduce((n, d) => n + d.expected, 0); const completed = series.reduce((n, d) => n + d.completed, 0);
  const attendance = [...new Set(confirmed.map(r => r.attendance))].map(name => ({ name, value: confirmed.filter(r => r.attendance === name).length }));
  const byEmployee = employees.map(u => { const rs = confirmed.filter(r => r.employeeId === u.id); const due = days.filter(d => u.createdAt.slice(0, 10) <= d).length; return { id: u.id, name: u.fullName, teamId: u.teamId, reports: rs.length, expected: due, regular: rs.reduce((n, r) => n + hours(r).regular, 0), additional: rs.reduce((n, r) => n + hours(r).additional, 0), questions: rs.flatMap(r => r.entries).reduce((n, e) => n + e.questionCount, 0), late: rs.filter(r => r.late).length }; });
  const byProject = [...new Set(confirmed.flatMap(r => r.projectIds))].map(id => { const rs = confirmed.filter(r => r.projectIds.includes(id)); const entries = rs.flatMap(r => r.entries.filter(e => e.projectId === id)); return { id, regular: entries.reduce((n, e) => n + e.regularHours, 0), additional: entries.reduce((n, e) => n + e.additionalHours, 0), questions: entries.reduce((n, e) => n + e.questionCount, 0), participants: new Set(rs.map(r => r.employeeId)).size }; });
  return { confirmed, series, attendance, byEmployee, byProject, expected, completed, rate: expected ? Math.round(completed / expected * 100) : 0, regular: series.reduce((n, d) => n + d.regular, 0), additional: series.reduce((n, d) => n + d.additional, 0), missing: series.reduce((n, d) => n + d.missing, 0), late: confirmed.filter(r => r.late).length };
}
export function aggregateSeries(series: ReturnType<typeof summarize>['series'], mode: string) {
  const groups = new Map<string, typeof series[number]>();
  for (const day of series) { const d = new Date(`${day.date}T12:00:00Z`); if (mode === 'weekly') d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); const key = mode === 'monthly' ? day.date.slice(0, 7) : mode === 'weekly' ? d.toISOString().slice(0, 10) : day.date;
    const old = groups.get(key); groups.set(key, old ? { ...old, expected: old.expected + day.expected, submitted: old.submitted + day.submitted, completed: old.completed + day.completed, missing: old.missing + day.missing, regular: old.regular + day.regular, additional: old.additional + day.additional, late: old.late + day.late } : { ...day, date: key }); }
  return [...groups.values()].map(v => ({ ...v, rate: v.expected ? Math.round(v.completed / v.expected * 100) : 0 }));
}
