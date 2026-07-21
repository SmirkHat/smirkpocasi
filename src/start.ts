import { createMiddleware, createStart } from '@tanstack/react-start'

function isApiOnlyEnabled() {
  const raw = String(process.env.API_ONLY || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/** When API_ONLY=true, only `/api/*` is served (Dokploy API host). */
const apiOnlyMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next, request }) => {
    if (!isApiOnlyEnabled()) return next()

    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return next()
    }

    const frontend = String(process.env.FRONTEND_URL || '')
      .trim()
      .replace(/\/$/, '')
    if (frontend) {
      return Response.redirect(`${frontend}${url.pathname}${url.search}`, 302)
    }

    return Response.json(
      {
        error: 'API-only host',
        hint: 'Use /api/* on this origin, or set FRONTEND_URL to redirect browsers.',
      },
      { status: 404 },
    )
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [apiOnlyMiddleware],
}))
