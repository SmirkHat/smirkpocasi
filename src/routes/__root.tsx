import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { NotFoundScreen, RouteErrorScreen } from '@/components/StatusScreen'
import { StoreHydration } from '@/components/StoreHydration'
import { PwaRegister } from '@/components/PwaRegister'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'shortcut icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
      },
      { name: 'theme-color', content: '#181818' },
      { name: 'color-scheme', content: 'dark' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'SmirkPočasí' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'format-detection', content: 'telephone=no' },
      {
        name: 'description',
        content: 'Česká počasí aplikace od SmirkHat.org',
      },
      { title: 'SmirkPočasí' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundScreen,
  errorComponent: RootErrorComponent,
})

function RootErrorComponent({ error }: ErrorComponentProps) {
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

function RootComponent() {
  return (
    <ErrorBoundary>
      <StoreHydration />
      <PwaRegister />
      <Outlet />
    </ErrorBoundary>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              {
                name: 'TanStack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
