import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { ArchiveRestore, ShieldCheck, Trash2 } from 'lucide-react';
import { removableCollections, type RemovableCollection, type Removal } from '../shared/domain';
import { api, db, useSession } from './data';
import { Badge, Busy, Empty, Field, Modal, Pagination, useToast } from './ui';

export interface RemovalTarget extends Removal { id: string; collection: RemovableCollection; label: string }
const labels: Record<RemovableCollection, string> = { users: 'Employee', projects: 'Project', reports: 'Report', teams: 'Team', departments: 'Department' };
const consequences: Record<RemovableCollection, string> = {
  users: 'The account loses WorkPulse access immediately, leaves the employee list, and is removed from project memberships. Reassign direct reports and owned projects first. Report history and the Firebase sign-in identity are retained; this is not permanent identity erasure.',
  projects: 'The project leaves normal views and selectors. Memberships are removed. Existing reports and their revisions remain unchanged and retain the project reference.',
  reports: 'The report is excluded from normal reports, dashboards, analytics and exports. Its date stays reserved to prevent duplicates. All versions and comments remain available for audit and recovery.',
  teams: 'The team leaves normal views and selectors. Associated employees and projects must be reassigned or removed first. Historical report references are preserved.',
  departments: 'The department leaves normal views and selectors. Associated employees must be reassigned or removed first. Historical report references are preserved.',
};
export function RemovalDialog({ target, close, done }: { target: RemovalTarget; close: () => void; done?: () => void }) {
  const [confirmation, setConfirmation] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const toast = useToast();
  const restore = !!target.deletedAt;
  const submit = async () => { setBusy(true); setError(''); try { await api(restore ? 'record.restore' : 'record.remove', { ...target, confirmation, reason }); toast(restore ? `${labels[target.collection]} restored.` : `${labels[target.collection]} moved to Recycle Bin.`); close(); done?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <Modal title={`${restore ? 'Restore' : 'Remove'} ${labels[target.collection].toLowerCase()}`} close={() => { if (!busy) close(); }}>
    <div className={`lifecycle-symbol ${restore ? 'restore' : ''}`}>{restore ? <ArchiveRestore size={26}/> : <Trash2 size={26}/>}</div><h3 className="removal-name">{target.label}</h3>
    <p>{restore ? target.collection === 'users' ? 'Restore as an inactive employee, with no team, manager or project memberships. An administrator must review the role and explicitly reactivate the account.' : target.collection === 'projects' ? 'Restore as an archived project with no owner, team or members. Review its configuration before reactivating.' : 'Restore this record to normal views. Previous removal and restoration events remain in the audit trail.' : consequences[target.collection]}</p>
    {!restore && <div className="retention-note"><ShieldCheck size={18}/><span>Recoverable removal — no report history or audit log is permanently deleted.</span></div>}
    {error && <div className="alert error" role="alert">{error}</div>}
    <fieldset className="form-fieldset" disabled={busy}><Field label="Reason" hint="Required. Saved to the audit trail."><textarea aria-label="Reason" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder={restore ? 'Why is this record being restored?' : 'Why should this record be removed?'}/></Field><Field label={`Type ${target.label} to confirm`}><input autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)}/></Field></fieldset>
    <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={close}>Cancel</button><button className={`button ${restore ? '' : 'danger'}`} disabled={busy || confirmation !== target.label || reason.trim().length < 3} onClick={submit}><Busy busy={busy}>{restore ? 'Restore record' : 'Move to Recycle Bin'}</Busy></button></div>
  </Modal>;
}
export function RemoveButton({ collection, id, label, done }: { collection: RemovableCollection; id: string; label: string; done?: () => void }) {
  const { user } = useSession(); const [open, setOpen] = useState(false);
  if (user?.role !== 'admin' || collection === 'users' && id === user.id) return null;
  return <><button className="remove-button" aria-label={`Remove ${label}`} onClick={() => setOpen(true)}><Trash2 size={15}/><span>Remove</span></button>{open && <RemovalDialog target={{ collection, id, label }} close={() => setOpen(false)} done={done}/>}</>;
}
export function RecycleBin() {
  const [type, setType] = useState<RemovableCollection>('users'); const [rows, setRows] = useState<RemovalTarget[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState<RemovalTarget | null>(null);
  useEffect(() => { setLoading(true); setError(''); setPage(1); return onSnapshot(query(collection(db!, type), where('deletedAt', '>', ''), orderBy('deletedAt', 'desc'), limit(500)), s => { setRows(s.docs.map(d => { const v = d.data(); return { id: d.id, collection: type, label: type === 'users' ? v.fullName : type === 'reports' ? `${v.employeeName} · ${v.date}` : v.name, deletedAt: v.deletedAt, deletedBy: v.deletedBy, deletionReason: v.deletionReason }; })); setLoading(false); }, e => { setError(e.message); setLoading(false); }); }, [type]);
  const filtered = rows.filter(r => `${r.label} ${r.deletionReason}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => setPage(p => Math.min(p, Math.max(1, Math.ceil(filtered.length / 10)))), [filtered.length]);
  return <><div className="page-heading"><div><div className="eyebrow">CONTROL WITHOUT LOSING CONTEXT</div><h1>Recycle Bin</h1><p>Recover removed records. Keep the history that matters.</p></div><span className="glass-label"><ShieldCheck size={16}/>Administrator only</span></div>
    <div className="retention-note"><ArchiveRestore size={21}/><span>Employees restore inactive; projects restore archived and unassigned. Reports, revisions, and audit logs are never cascade-deleted.</span></div>
    <section className="card"><div className="toolbar"><Field label="Record type"><select aria-label="Record type" value={type} onChange={e => setType(e.target.value as RemovableCollection)}>{removableCollections.map(k => <option key={k} value={k}>{labels[k]}s</option>)}</select></Field><Field label="Search removed records"><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Name or removal reason…"/></Field></div>
    {error && <div className="alert error">{error}</div>}{rows.length === 500 && <div className="alert">Showing the latest 500 removed records for this type.</div>}
    {loading ? <p role="status">Loading removed records…</p> : !filtered.length ? <Empty title="Nothing in the bin">Removed records will appear here. No changes are made until you confirm.</Empty> : <div className="table-wrap"><table><thead><tr><th>Record</th><th>Removed</th><th>Reason</th><th>Action</th></tr></thead><tbody>{filtered.slice((page - 1) * 10, page * 10).map(r => <tr key={r.id}><td><b>{r.label}</b><small><Badge status="Removed"/></small></td><td>{new Date(r.deletedAt!).toLocaleString()}</td><td>{r.deletionReason}</td><td><button className="button secondary small" onClick={() => setSelected(r)}><ArchiveRestore size={15}/>Restore</button>{type === 'reports' && <Link className="text-button" to={`/history/${r.id}`}>View preserved report</Link>}</td></tr>)}</tbody></table></div>}
    <Pagination page={page} setPage={setPage} total={filtered.length}/></section>{selected && <RemovalDialog target={selected} close={() => setSelected(null)}/>}</>;
}
