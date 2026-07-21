import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { StoreHydration } from '@/components/StoreHydration'
import { PwaRegister } from '@/components/PwaRegister'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
      },
      { name: 'theme-color', content: '#171717' },
      {
        name: 'description',
        content: 'Česká počasí aplikace od SmirkHat.org',
      },
      { title: 'SmirkPočasí' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/icon-32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/icons/icon-16.png' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

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
