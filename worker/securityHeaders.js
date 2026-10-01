// Same baseline security headers public/_headers already applies to every
// static response (see that file's own comments) - applied here too so the
// Worker-handled /api/* responses carry the same defense-in-depth instead of
// falling back to Cloudflare's bare defaults. Low risk either way (these are
// read-only JSON proxy endpoints, not pages that render content), but cheap
// and consistent to add. CSP/Permissions-Policy are page-rendering concerns
// and genuinely don't apply to a JSON response, so only the headers that
// make sense for any response are included here.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

export function withSecurityHeaders(response) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
