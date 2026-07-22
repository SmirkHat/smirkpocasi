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
      // iOS splash screens (portrait). media matches device CSS pixel size × DPR.
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/iphone-14-pro-max.png',
        media:
          '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/iphone-14-pro.png',
        media:
          '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/iphone-12.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/iphone-12-pro-max.png',
        media:
          '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/iphone-x.png',
        media:
          '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/iphone-se.png',
        media:
          '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)',
      },
      {
        rel: 'apple-touch-startup-image',
        href: '/splash/ipad-pro-12.png',
        media:
          '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)',
      },
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
        {/* Immediate /sw.js registration so PWABuilder (headless) detects the SW before React hydrates. */}
        {import.meta.env.DEV ? null : (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}",
            }}
          />
        )}
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
