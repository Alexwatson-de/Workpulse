import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getFirestore, limit, onSnapshot, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { defaultPolicy, zonedNow, type Group, type Notice, type Policy, type Project, type Report, type UserProfile } from '../shared/domain';

const env = import.meta.env;
export const configured = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
const app = configured ? initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID }) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
if (auth && db && env.DEV && env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, `http://127.0.0.1:${env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9098}`, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8088));
}
const unconfirmedRequests = new Map<string, string>();
export async function api<T = Record<string, unknown>>(action: string, payload: unknown, requestId?: string): Promise<T> {
  if (!auth?.currentUser) throw new Error('Sign in required.');
  const signature = JSON.stringify([auth.currentUser.uid, action, payload]);
  const retryId = requestId ?? unconfirmedRequests.get(signature) ?? crypto.randomUUID();
  unconfirmedRequests.set(signature, retryId);
  const token = await auth.currentUser.getIdToken();
  let res: Response;
  try { res = await fetch('/api/platform', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, payload, requestId: retryId }) }); }
  catch { throw new Error('Network unavailable. Your changes have not been confirmed. Keep this page open and retry.'); }
  const body = await res.json().catch(() => ({ error: 'API unavailable. Start the Vercel API locally or check the deployment.' }));
  if (!res.ok || body.error) throw new Error(body.error || 'Operation failed.'); unconfirmedRequests.delete(signature); return body;
}
interface Session { identity: User | null; user: UserProfile | null; loading: boolean; error: string }
const SessionContext = createContext<Session>({ identity: null, user: null, loading: true, error: '' });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, set] = useState<Session>({ identity: null, user: null, loading: configured, error: '' });
  useEffect(() => { if (!auth || !db) return; let stopProfile = () => {};
    const stop = onAuthStateChanged(auth, identity => {
      stopProfile(); set({ identity, user: null, loading: !!identity, error: '' });
      if (identity) stopProfile = onSnapshot(doc(db!, 'users', identity.uid), s => {
        const user = s.exists() ? { ...s.data(), id: s.id } as UserProfile : null;
        set({ identity, user: user?.active ? user : null, loading: false, error: !user ? 'This account has not been invited. Contact your administrator.' : !user.active ? 'Your account is inactive. Contact your administrator.' : '' });
      }, () => set({ identity, user: null, loading: false, error: 'Could not load your employee profile. Check permissions or contact your administrator.' }));
    }); return () => { stop(); stopProfile(); };
  }, []); return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);
export async function logout() {
  const uid = auth?.currentUser?.uid;
  if (auth) await signOut(auth);
  unconfirmedRequests.clear();
  if (uid) {
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(`workpulse.draft.${uid}.`)) sessionStorage.removeItem(key); }
    catch { /* Storage can be unavailable in restricted browsers. */ }
  }
}
interface Data { reports: Report[]; projects: Project[]; users: UserProfile[]; teams: Group[]; departments: Group[]; notices: Notice[]; policy: Policy; loading: boolean; error: string; from: string; to: string; setRange: (from: string, to: string) => void; capped: boolean }
const DataContext = createContext<Data>(null!);
export const useData = () => useContext(DataContext);
export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useSession(); const today = new Date().toISOString().slice(0, 10);
  const [range, setRangeState] = useState({ from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), to: today });
  const [values, setValues] = useState<Record<string, unknown[]>>({}); const [policy, setPolicy] = useState(defaultPolicy); const [error, setError] = useState(''); const [pending, setPending] = useState(1);
  useEffect(() => {
    if (!user || !db) return; const stops: (() => void)[] = []; const loaded = new Set<string>(); let count = 0; setValues({}); setError('');
    const listen = (key: string, name: string, constraints: QueryConstraint[] = []) => {
      count++; stops.push(onSnapshot(query(collection(db!, name), ...constraints, limit(1000)), snap => { setValues(v => ({ ...v, [key]: snap.docs.map(d => ({ ...d.data(), id: d.id })) })); loaded.add(key); setPending(count - loaded.size); }, e => { setError(`Database query failed (${name}): ${e.message}`); loaded.add(key); setPending(count - loaded.size); }));
    };
    const dates = [where('date', '>=', range.from), where('date', '<=', range.to), orderBy('date', 'desc')];
    listen('reports', 'reports', [...(user.role === 'admin' ? [] : [where(user.role === 'manager' ? 'managerId' : 'employeeId', '==', user.id)]), ...dates]);
    if (user.role === 'manager') listen('ownReports', 'reports', [where('employeeId', '==', user.id), ...dates]);
    listen('projects', 'projects', user.role === 'admin' ? [] : [where('memberIds', 'array-contains', user.id)]);
    if (user.role === 'manager') listen('ownedProjects', 'projects', [where('ownerId', '==', user.id)]);
    if (user.role !== 'employee') listen('users', 'users', user.role === 'admin' ? [] : [where('managerId', '==', user.id)]);
    listen('teams', 'teams'); listen('departments', 'departments'); listen('notices', 'notifications', [where('userId', '==', user.id), orderBy('createdAt', 'desc')]);
    count++;
    stops.push(onSnapshot(doc(db, 'settings', 'organization'), s => { const nextPolicy = { ...defaultPolicy, ...s.data() }; setPolicy(nextPolicy); loaded.add('policy'); setPending(count - loaded.size); if (range.to === today) { const localToday = zonedNow(nextPolicy.timezone).date; if (localToday !== today) setRangeState(r => ({ ...r, to: localToday })); } }, e => { setError(e.message); loaded.add('policy'); setPending(count - loaded.size); }));
    setPending(count);
    return () => stops.forEach(s => s());
  }, [user, range.from, range.to]);
  useEffect(() => { if (!user) return; const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) api('notifications.refresh', {}).catch(() => {}); }; refresh(); const timer = setInterval(refresh, 300000); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); }; }, [user]);
  const merge = <T extends { id: string }>(...lists: T[][]) => [...new Map(lists.flat().map(v => [v.id, v])).values()];
  const value: Data = { reports: merge((values.reports ?? []) as Report[], (values.ownReports ?? []) as Report[]), projects: merge((values.projects ?? []) as Project[], (values.ownedProjects ?? []) as Project[]), users: merge((values.users ?? []) as UserProfile[], user ? [user] : []), teams: (values.teams ?? []) as Group[], departments: (values.departments ?? []) as Group[], notices: (values.notices ?? []) as Notice[], policy, loading: pending > 0, error, ...range, setRange: (from, to) => { if (!from || !to || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) { setError('Choose a valid date range of at most 366 days.'); return; } setRangeState({ from, to }); }, capped: Object.values(values).some(v => v.length >= 1000) };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
