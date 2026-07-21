/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_API_KEY_PROVIDERS?: string
  readonly VITE_ENABLE_EXPERIMENTAL_SOURCES?: string
  readonly VITE_ENABLE_OPEN_METEO_DEV_PROXY?: string
  readonly VITE_OPEN_METEO_DEV_PROXY?: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css?url' {
  const href: string
  export default href
}
