/**
 * Whether this is the page Supabase sends an AI app's sign-in to: Site URL
 * plus the Authorization Path, `/oauth/consent` (PLAN §2.10). One trailing
 * slash is the same page: if Pages ever needs the build's copy at
 * `oauth/consent/index.html` (K7), it sends `/oauth/consent` on to
 * `/oauth/consent/`. Kept apart from ConsentScreen, so main.tsx can ask
 * without loading the page.
 */
export const isConsentPath = (pathname: string): boolean => pathname === '/oauth/consent' || pathname === '/oauth/consent/'
