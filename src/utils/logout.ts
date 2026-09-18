import { logoutGoogle } from '../services/googleAuth';

/**
 * Handles user logout:
 * 1. Clears Firebase Auth state if active
 * 2. Clears sessionStorage
 * 3. Clears localStorage auth tokens and cached inbox state
 * 4. Performs a full-page browser navigation to /logout,
 *    allowing the Cloudflare Worker to clear the HttpOnly __inbox_auth cookie
 *    and redirect to /login.
 */
export const handleLogout = async (e?: React.MouseEvent) => {
  if (e) {
    e.preventDefault();
  }

  // 1. Sign out of Firebase if initialized
  try {
    await logoutGoogle().catch(() => {});
  } catch {
    // Ignore errors during Firebase sign-out
  }

  // 2. Clear all sessionStorage
  try {
    sessionStorage.clear();
  } catch {
    // Ignore storage errors
  }

  // 3. Clear all client-side auth state, tokens, and cached inbox state from localStorage
  try {
    const authKeywords = [
      'auth',
      'token',
      'user',
      'session',
      'firebase',
      'login',
      'projectinbox_',
    ];

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key) {
        const lower = key.toLowerCase();
        if (
          authKeywords.some((w) => lower.includes(w)) ||
          lower.startsWith('firebase:')
        ) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {
    // Ignore storage errors
  }

  // 4. Perform a real full-page browser navigation to /logout
  // DO NOT use fetch/AJAX — the Cloudflare Worker needs to clear the HttpOnly cookie via redirect.
  window.location.href = '/logout';
};
