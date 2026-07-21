import { HiArrowsPointingOut } from 'react-icons/hi2'
import { ClientOnly, useNavigate } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AppPage } from '../components/AppChrome'
import AirQuality from '../components/AirQuality'
import ForecastExplorer, { ForecastExplorerSkeleton } from '../components/ForecastExplorer'
import MetricsGrid, { HumidityPrecipTiles, HumidityPrecipTilesSkeleton, MetricsGridSkeleton } from '../components/MetricsGrid'
import NerdZone from '../components/NerdZone'
import RadarMap from '../components/RadarMap'
import VodaPreview from '../components/VodaPreview'
import WarningBanner from '../components/WarningBanner'
import WeatherHero, { WeatherHeroSkeleton } from '../components/WeatherHero'
import { useHomeBundle } from '../hooks/useHomeBundle'
import { usePlaceImage } from '../hooks/usePlaceImage'
import { useWeatherStore } from '../store/weatherStore'
import { firstDailyValue } from '../utils/forecast'
import { getWeatherInfo } from '../utils/weatherCodes'

function photoCredit(image) {
  if (!image) return null
  const credit = String(image.author || image.title || '')
    .replace(/\s+/g, ' ')
    .trim()
  const license = image.license || image.source
  return [credit, license].filter(Boolean).join(' · ')
}

function RadarPreviewCard({ location, className }: { location: { lat?: number; lon?: number; name?: string }; className?: string }) {
  const navigate = useNavigate()

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <CardHeader className="pb-0">
        <CardTitle>Radar</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ to: '/radar' })}>
            <HiArrowsPointingOut aria-hidden="true" />
            Otevřít
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel className="pt-3">
        <ClientOnly fallback={<div className="aspect-square animate-pulse rounded-md bg-[#0b0f14]" />}>
          <div className="relative aspect-square overflow-hidden rounded-md bg-[#0b0f14] [&_.leaflet-container]:!absolute [&_.leaflet-container]:!inset-0 [&_.leaflet-container]:!h-full [&_.leaflet-container]:!min-h-0 [&_.leaflet-container]:!w-full [&_.leaflet-container]:!rounded-md">
            <RadarMap location={location} />
          </div>
        </ClientOnly>
      </CardPanel>
    </Card>
  )
}

export default function HomePage() {
  const location = useWeatherStore((state) => state.location)
  const home = useHomeBundle(location)
  const placeImage = usePlaceImage(location)

  const weatherData: any = home.weather
  const current = weatherData?.current
  const daily = weatherData?.daily
  const consensus = home.consensus
  const consensusValues = consensus?.consensus
  const info = getWeatherInfo(consensusValues?.weatherCode ?? current?.weathercode)
  const showPageSkeleton = home.loading && !home.weather

  const hero = home.loading && !current ? (
    <WeatherHeroSkeleton />
  ) : (
    <WeatherHero
      location={location}
      info={info}
      WeatherIcon={info.Icon}
      temperature={consensusValues?.temperature ?? current?.temperature_2m}
      tempMax={firstDailyValue(daily, 'temperature_2m_max')}
      tempMin={firstDailyValue(daily, 'temperature_2m_min')}
      image={placeImage}
      credit={photoCredit(placeImage)}
      offline={home.offline}
    />
  )

  return (
    <AppPage hero={hero}>
      <WarningBanner attribution={home.warningsAttribution} warnings={home.warnings} />

      {home.error && !home.weather ? (
        <Alert className="mb-4" variant="error">
          <AlertTitle>Počasí se nepodařilo načíst</AlertTitle>
          <AlertDescription>{home.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-4">
        <section
          className="anim-rise lg:col-span-8 lg:row-span-2"
          aria-label="Podrobná předpověď"
          style={{ animationDelay: '60ms' }}
        >
          {showPageSkeleton ? (
            <ForecastExplorerSkeleton />
          ) : (
            <ForecastExplorer
              hourly={home.weather?.hourly}
              daily={home.weather?.daily}
              forecastSeries={consensus.forecastSeries}
              fallback={home.error ? null : <ForecastExplorerSkeleton />}
            />
          )}
        </section>

        <aside className="anim-rise lg:col-span-4" aria-label="Radar" style={{ animationDelay: '100ms' }}>
          <RadarPreviewCard location={location} />
        </aside>

        <aside className="anim-rise flex flex-col gap-3 lg:col-span-4" aria-label="Kvalita ovzduší a srážky" style={{ animationDelay: '140ms' }}>
          <AirQuality data={home.aqi} loading={home.loading && !home.aqi} error={null} />
          {showPageSkeleton ? (
            <HumidityPrecipTilesSkeleton />
          ) : (
            <HumidityPrecipTiles weather={home.weather} consensusValues={consensusValues} />
          )}
        </aside>

        <section
          className="anim-rise grid grid-cols-2 gap-3 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4 lg:gap-4"
          aria-label="Aktuální podmínky"
          style={{ animationDelay: '200ms' }}
        >
          {showPageSkeleton ? (
            <MetricsGridSkeleton />
          ) : (
            <MetricsGrid weather={home.weather} consensusValues={consensusValues} />
          )}
        </section>

        <section className="anim-rise lg:col-span-12" aria-label="Voda" style={{ animationDelay: '230ms' }}>
          <VodaPreview location={location} />
        </section>
      </div>

      {!showPageSkeleton ? (
        <div className="anim-rise mt-5" style={{ animationDelay: '260ms' }}>
          <NerdZone consensus={consensus} updatedAt={home.weatherUpdatedAt} offline={home.offline} />
        </div>
      ) : null}
    </AppPage>
  )
}
