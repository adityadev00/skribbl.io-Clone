import { CLIENT_ORIGINS } from './constants';

/**
 * CLIENT_ORIGIN is a comma-separated allow-list. Entries may contain `*` as a single-label wildcard,
 * e.g. `https://my-app.vercel.app,https://*.vercel.app` (covers Vercel preview deployments).
 */
const toMatcher = (entry: string): ((origin: string) => boolean) => {
  const clean = entry.trim().replace(/\/+$/, '');
  if (!clean.includes('*')) return (o) => o === clean;
  const re = new RegExp('^' + clean.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+') + '$', 'i');
  return (o) => re.test(o);
};

const matchers = CLIENT_ORIGINS.filter(Boolean).map(toMatcher);

/**
 * Requests without an Origin header (curl, Render's health checker, our Node test clients) are allowed:
 * CORS only protects browsers, and this server uses no cookies — identity is a secret token.
 */
export const isOriginAllowed = (origin?: string): boolean => !origin || matchers.some((m) => m(origin.replace(/\/+$/, '')));

/** For express `cors()` and Socket.IO's `cors` option. */
export const corsOrigin = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void): void =>
  cb(null, isOriginAllowed(origin));
