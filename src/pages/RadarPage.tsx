import { ClientOnly } from '@tanstack/react-router'
import { AppPage } from '../components/AppChrome'
import RadarMap from '../components/RadarMap'
import { useWeatherStore } from '../store/weatherStore'

export default function RadarPage() {
  const location = useWeatherStore((state) => state.location)

  return (
    <AppPage fillViewport contentClassName="max-w-none">
      <ClientOnly fallback={<div className="min-h-0 flex-1 animate-pulse bg-muted" />}>
        <div className="flex min-h-0 flex-1 flex-col">
          <RadarMap location={location} fullscreen />
        </div>
      </ClientOnly>
    </AppPage>
  )
}
