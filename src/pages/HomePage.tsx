import { HiArrowsPointingOut } from 'react-icons/hi2'
import { ClientOnly, useNavigate } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AppPage } from '../components/AppChrome'
import AirQuality from '../components/AirQuality'
import ForecastExplorer from '../components/ForecastExplorer'
import MetricsGrid, { HumidityPrecipTiles } from '../components/MetricsGrid'
import NerdZone from '../components/NerdZone'
import RadarMap from '../components/RadarMap'
import WarningBanner from '../components/WarningBanner'
import WeatherHero, { WeatherHeroSkeleton } from '../components/WeatherHero'
import { usePlaceImage } from '../hooks/usePlaceImage'
import { useWarnings } from '../hooks/useWarnings'
import { useWeather } from '../hooks/useWeather'
import { useWeatherConsensus } from '../hooks/useWeatherConsensus'
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
        <ClientOnly fallback={<div className="aspect-square animate-pulse rounded-md bg-muted" />}>
          <div className="relative aspect-square overflow-hidden rounded-md [&_.leaflet-container]:!absolute [&_.leaflet-container]:!inset-0 [&_.leaflet-container]:!h-full [&_.leaflet-container]:!min-h-0 [&_.leaflet-container]:!w-full [&_.leaflet-container]:!rounded-md">
            <RadarMap location={location} />
          </div>
        </ClientOnly>
      </CardPanel>
    </Card>
  )
}

export default function HomePage() {
  const location = useWeatherStore((state) => state.location)
  const weather = useWeather(location)
  const consensus = useWeatherConsensus(location)
  const placeImage = usePlaceImage(location)
  const warnings = useWarnings(location)

  const weatherData: any = weather.data
  const current = weatherData?.current
  const daily = weatherData?.daily
  const consensusValues = consensus?.consensus
  const info = getWeatherInfo(consensusValues?.weatherCode ?? current?.weathercode)

  const hero = weather.loading && !current ? (
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
      offline={weather.offline}
    />
  )

  return (
    <AppPage hero={hero}>
      <WarningBanner attribution={warnings.attribution} warnings={warnings.warnings} />

      {weather.error && !weather.data ? (
        <Alert className="mb-4" variant="error">
          <AlertTitle>Počasí se nepodařilo načíst</AlertTitle>
          <AlertDescription>{weather.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-4">
        <section
          className="anim-rise lg:col-span-8 lg:row-span-2"
          aria-label="Podrobná předpověď"
          style={{ animationDelay: '60ms' }}
        >
          <ForecastExplorer
            hourly={weather.data?.hourly}
            daily={weather.data?.daily}
            forecastSeries={consensus.forecastSeries}
          />
        </section>

        <aside className="anim-rise lg:col-span-4" aria-label="Radar" style={{ animationDelay: '100ms' }}>
          <RadarPreviewCard location={location} />
        </aside>

        <aside className="anim-rise flex flex-col gap-3 lg:col-span-4" aria-label="Kvalita ovzduší a srážky" style={{ animationDelay: '140ms' }}>
          <AirQuality />
          <HumidityPrecipTiles weather={weather.data} consensusValues={consensusValues} />
        </aside>

        <section
          className="anim-rise grid grid-cols-2 gap-3 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4 lg:gap-4"
          aria-label="Aktuální podmínky"
          style={{ animationDelay: '200ms' }}
        >
          <MetricsGrid weather={weather.data} consensusValues={consensusValues} />
        </section>
      </div>

      <div className="anim-rise mt-5" style={{ animationDelay: '260ms' }}>
        <NerdZone consensus={consensus} updatedAt={weather.updatedAt} offline={weather.offline} />
      </div>
    </AppPage>
  )
}
