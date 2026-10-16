import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ popup: vi.fn(), parameters: vi.fn() }));
vi.mock('firebase/auth', () => ({ GoogleAuthProvider: class { providerId = 'google.com'; setCustomParameters = mocks.parameters; }, signInWithPopup: mocks.popup }));
import { googleSignInError, signInWithGoogle } from '../src/google-sign-in';
import type { Auth } from 'firebase/auth';
beforeEach(() => vi.clearAllMocks());
describe('Google authentication without authorization changes', () => {
  it('uses the existing Firebase Auth instance and Google account chooser', async () => { const auth = {} as Auth; const credential = { user: { uid: 'existing-invited-user' } }; mocks.popup.mockResolvedValue(credential); expect(await signInWithGoogle(auth)).toBe(credential); expect(mocks.popup).toHaveBeenCalledTimes(1); expect(mocks.popup.mock.calls[0][0]).toBe(auth); expect(mocks.popup.mock.calls[0][1].providerId).toBe('google.com'); expect(mocks.parameters).toHaveBeenCalledWith({ prompt: 'select_account' }); });
  it('passes failures back without creating profiles or granting access', async () => { const failure = { code: 'auth/popup-closed-by-user' }; mocks.popup.mockRejectedValue(failure); await expect(signInWithGoogle({} as Auth)).rejects.toBe(failure); });
  it.each([
    ['auth/popup-closed-by-user', 'cancelled'], ['auth/cancelled-popup-request', 'latest window'], ['auth/popup-blocked', 'Allow pop-ups'],
    ['auth/account-exists-with-different-credential', 'another sign-in method'], ['auth/network-request-failed', 'connection'],
    ['auth/unauthorized-domain', 'website address'], ['auth/operation-not-allowed', 'email and password'], ['auth/user-disabled', 'disabled'],
  ])('provides safe actionable feedback for %s', (code, text) => expect(googleSignInError({ code, message: 'SENSITIVE PROVIDER DATA' })).toContain(text));
  it('does not surface raw provider details on unknown errors', () => { expect(googleSignInError(new Error('SENSITIVE PROVIDER DATA'))).toBe('Google sign-in failed. Please try again or use email and password.'); expect(googleSignInError(null)).not.toContain('null'); });
});
