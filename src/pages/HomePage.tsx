import type { ReactNode } from 'react'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { HiArrowsPointingOut } from 'react-icons/hi2'
import { ClientOnly, useNavigate } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AppPage } from '../components/AppChrome'
import AirQuality from '../components/AirQuality'
import { DataUpdateFooter } from '../components/DataUpdateFooter'
import { ForecastExplorerSkeleton } from '../components/ForecastExplorerSkeleton'
import MetricsGrid, { HumidityPrecipTiles, HumidityPrecipTilesSkeleton, MetricsGridSkeleton } from '../components/MetricsGrid'
import NerdZone from '../components/NerdZone'
import VodaPreview from '../components/VodaPreview'
import WarningBanner from '../components/WarningBanner'
import WeatherHero, { WeatherHeroSkeleton } from '../components/WeatherHero'
import { useHomeBundle } from '../hooks/useHomeBundle'
import { usePlaceImage } from '../hooks/usePlaceImage'
import { useShowFieldSources } from '../hooks/useShowFieldSources'
import { useWeatherStore } from '../store/weatherStore'
import { firstDailyValue } from '../utils/forecast'
import { buildMergedForecastDays } from '../utils/hourlyForecast'
import { getWeatherInfo } from '../utils/weatherCodes'

const loadForecastExplorer = () => import('../components/ForecastExplorer')
const loadNowcastBar = () => import('../components/NowcastBar')
const loadRadarMap = () => import('../components/RadarMap')
const ForecastExplorer = lazy(loadForecastExplorer)
const NowcastBar = lazy(loadNowcastBar)
const RadarMap = lazy(loadRadarMap)

const RADAR_PLACEHOLDER = <div className="aspect-square animate-pulse rounded-md bg-[#0b0f14]" />

function photoCredit(image) {
  if (!image) return null
  const credit = String(image.author || image.title || '')
    .replace(/\s+/g, ' ')
    .trim()
  const license = image.license || image.source
  return [credit, license].filter(Boolean).join(' · ')
}

/** Mounts its children shortly before they scroll into view, so their requests don't compete with the first paint. */
function WhenNearViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true)
      },
      { rootMargin: '400px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className="min-h-48">{near ? children : null}</div>
}

function RadarPreviewCard({ location, className }: { location: { lat?: number; lon?: number; name?: string } | null; className?: string }) {
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
        <ClientOnly fallback={RADAR_PLACEHOLDER}>
          {location ? (
            <div className="relative aspect-square overflow-hidden rounded-md bg-[#0b0f14] [&_.leaflet-container]:!absolute [&_.leaflet-container]:!inset-0 [&_.leaflet-container]:!h-full [&_.leaflet-container]:!min-h-0 [&_.leaflet-container]:!w-full [&_.leaflet-container]:!rounded-md">
              <Suspense fallback={RADAR_PLACEHOLDER}>
                <RadarMap location={location} />
              </Suspense>
            </div>
          ) : (
            RADAR_PLACEHOLDER
          )}
        </ClientOnly>
      </CardPanel>
    </Card>
  )
}

export default function HomePage() {
  const hydrated = useWeatherStore((state) => state.hydrated)
  const location = useWeatherStore((state) => state.location)
  // Before hydration the store holds the default city; nothing may load for it.
  const readyLocation = hydrated ? location : null
  const home = useHomeBundle(readyLocation)
  const placeImage = usePlaceImage(readyLocation)
  const { enabled: showFieldSources, setEnabled: setShowFieldSources } = useShowFieldSources()

  const weatherData: any = home.weather
  const current = weatherData?.current
  const daily = weatherData?.daily
  const hourly = weatherData?.hourly
  const consensus = home.consensus
  const consensusValues = consensus?.consensus
  const fieldSources = showFieldSources ? consensus?.fieldSources : null
  const info = getWeatherInfo(consensusValues?.weatherCode ?? current?.weathercode)
  const showPageSkeleton = home.loading && !home.weather

  // Same merged days for the hero, the temperature chart and the week overview.
  const { days: forecastDays, sourceNames: forecastSourceNames } = useMemo(
    () => buildMergedForecastDays({ hourly, daily, forecastSeries: consensus?.forecastSeries }),
    [hourly, daily, consensus?.forecastSeries],
  )
  const todayForecast = forecastDays[0] ?? null

  useEffect(() => {
    void loadForecastExplorer()
    void loadRadarMap()
  }, [])

  const hero = home.loading && !current ? (
    <WeatherHeroSkeleton />
  ) : (
    <WeatherHero
      location={location}
      info={info}
      WeatherIcon={info.Icon}
      temperature={consensusValues?.temperature ?? current?.temperature_2m}
      tempMax={todayForecast?.tempMax ?? firstDailyValue(daily, 'temperature_2m_max')}
      tempMin={todayForecast?.tempMin ?? firstDailyValue(daily, 'temperature_2m_min')}
      image={placeImage}
      credit={photoCredit(placeImage)}
      offline={home.offline}
      temperatureSources={fieldSources?.temperature}
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
          style={{ animationDelay: '30ms' }}
        >
          {showPageSkeleton ? (
            <ForecastExplorerSkeleton />
          ) : (
            <Suspense fallback={<ForecastExplorerSkeleton />}>
              <ForecastExplorer
                days={forecastDays}
                seriesNames={forecastSourceNames}
                sourceMeta={consensus?.sources}
                showCalculations={showFieldSources}
                fallback={home.error ? null : <ForecastExplorerSkeleton />}
              />
            </Suspense>
          )}
        </section>

        <aside className="anim-rise flex flex-col gap-4 lg:col-span-4" aria-label="Radar a krátkodobý výhled srážek" style={{ animationDelay: '50ms' }}>
          <RadarPreviewCard location={readyLocation} />
          {consensus.aladin ? (
            <Suspense fallback={null}>
              <NowcastBar aladin={consensus.aladin} />
            </Suspense>
          ) : null}
        </aside>

        <aside className="anim-rise flex flex-col gap-3 lg:col-span-4" aria-label="Kvalita ovzduší a srážky" style={{ animationDelay: '70ms' }}>
          <AirQuality data={home.aqi} loading={home.loading && !home.aqi} error={null} />
          {showPageSkeleton ? (
            <HumidityPrecipTilesSkeleton />
          ) : (
            <HumidityPrecipTiles
              weather={home.weather}
              consensusValues={consensusValues}
              todayPrecipMm={todayForecast?.precipSum}
              currentRain={consensus?.currentRain}
              fieldSources={fieldSources}
            />
          )}
        </aside>

        <section
          className="anim-rise grid grid-cols-2 gap-3 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4 lg:gap-4"
          aria-label="Aktuální podmínky"
          style={{ animationDelay: '100ms' }}
        >
          {showPageSkeleton ? (
            <MetricsGridSkeleton />
          ) : (
            <MetricsGrid weather={home.weather} consensusValues={consensusValues} fieldSources={fieldSources} />
          )}
        </section>

        <section className="anim-rise lg:col-span-12" aria-label="Voda" style={{ animationDelay: '115ms' }}>
          <WhenNearViewport>
            <VodaPreview location={readyLocation} />
          </WhenNearViewport>
        </section>
      </div>

      {!showPageSkeleton ? (
        <div className="anim-rise mt-5" style={{ animationDelay: '130ms' }}>
          <NerdZone
            consensus={consensus}
            updatedAt={home.weatherUpdatedAt}
            offline={home.offline}
            showFieldSources={showFieldSources}
            onShowFieldSourcesChange={setShowFieldSources}
          />
        </div>
      ) : null}

      <DataUpdateFooter
        updatedAt={home.updatedAt}
        clientMeta={home.clientMeta}
        offline={home.offline}
        className="anim-rise mb-2"
      />
    </AppPage>
  )
}
