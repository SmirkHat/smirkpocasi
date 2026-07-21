import { createRouter as createTanStackRouter, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { NotFoundScreen, RouteErrorScreen } from './components/StatusScreen'
import { routeTree } from './routeTree.gen'

function DefaultErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <RouteErrorScreen
      error={error}
      onRetry={() => {
        router.invalidate()
      }}
    />
  )
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    trailingSlash: 'never',
    defaultNotFoundComponent: NotFoundScreen,
    defaultErrorComponent: DefaultErrorComponent,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
