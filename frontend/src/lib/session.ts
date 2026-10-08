/**
 * Session token = the secret that proves "I'm the same player as before" after a refresh or a
 * dropped connection. The server issues it once (`session` event); we send it on every connect.
 *
 * 'session' → one identity per browser TAB. Survives refresh, but two tabs are two different
 *             players — which is what you want for testing and for opening an invite link yourself.
 * 'local'   → one identity per browser: shared by all tabs and survives closing the browser.
 *             (Two tabs would then be the SAME player.)
 */
const TOKEN_STORAGE = 'session' as 'session' | 'local';

const TOKEN_KEY = 'skribbl.token';
const NAME_KEY = 'skribbl.name';

const tokenStore = () => (TOKEN_STORAGE === 'local' ? window.localStorage : window.sessionStorage);

export function getToken(): string | undefined {
  try { return tokenStore().getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
}
export function saveToken(token: string): void {
  try { tokenStore().setItem(TOKEN_KEY, token); } catch { /* storage blocked — session lasts until refresh */ }
}

/** Display name is only a convenience prefill, so it is shared across tabs. */
export function getSavedName(): string {
  try { return window.localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function saveName(name: string): void {
  try { window.localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
}
