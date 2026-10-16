import { GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';

// Authentication only: the existing UID profile and Firestore/API checks remain
// authoritative. Never create a profile, infer a role, or authorize an email domain.
export async function signInWithGoogle(auth: Auth) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
export function googleSignInError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'auth/popup-closed-by-user': return 'Google sign-in was cancelled. You can try again or use your password.';
    case 'auth/cancelled-popup-request': return 'Another sign-in window was opened. Complete the latest window or try again.';
    case 'auth/popup-blocked': return 'Your browser blocked the Google sign-in window. Allow pop-ups for WorkPulse and try again.';
    case 'auth/account-exists-with-different-credential': return 'This email already uses another sign-in method. Sign in using that method; contact your administrator if you need help.';
    case 'auth/network-request-failed': return 'Could not connect to Google sign-in. Check your connection and try again.';
    case 'auth/unauthorized-domain': return 'Google sign-in is not enabled for this website address. Contact your administrator.';
    case 'auth/operation-not-allowed': return 'Google sign-in is not enabled for this workspace. You can still use email and password.';
    case 'auth/user-disabled': return 'This account is disabled. Contact your administrator.';
    default: return 'Google sign-in failed. Please try again or use email and password.';
  }
}
