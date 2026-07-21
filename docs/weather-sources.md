# Weather data source candidates

This document tracks possible data sources for future SmirkPočasí integrations. User-facing labels remain Czech in the app; this technical catalog is English.

## Current direction

For Czech forecast quality, the best default strategy is still:

1. Use **Aladin / ČHMÚ** for Czech short-range and nowcasting.
2. Use **Open-Meteo model endpoints** as independent NWP inputs for consensus.
3. Use **Open-Meteo Ensemble Mean** sources for probabilistic model guidance without pulling every ensemble member.
4. Use **Yr.no / MET Norway** as an additional external provider through a User-Agent proxy.
5. Add API-key providers only as optional self-hosted integrations.

Community feedback from Python/weather API discussions strongly favors Open-Meteo for free forecast work. Tomorrow.io, Visual Crossing, OpenWeatherMap, Weatherbit, Meteomatics, Meteosource, GribStream, and Google Weather API are worth tracking, but most require keys, have small limits, or solve a different product problem.

## Open-Meteo NWP model endpoints

Each row can be treated as a separate model source in the consensus engine, if the endpoint is available for the selected location and returns the required variables.

| Model | Operator | Czech resolution | Update | Range | Endpoint | Czech weight | Status |
| --- | --- | ---: | --- | --- | --- | ---: | --- |
| ECMWF IFS HRES | ECMWF | 9 km | 6h | 15 days | `/v1/ecmwf` | 5 | Active, use hourly fallback because `current` may be absent. |
| ECMWF AIFS | ECMWF | 25 km | 6h | 15 days | `/v1/ecmwf?models=ecmwf_aifs025` | 4 | Active. Open-Meteo model id is `ecmwf_aifs025`, not `aifs025`. |
| DWD ICON-EU | DWD | 7 km | 3h | 5 days | `/v1/dwd-icon` | 5 | Active. |
| DWD ICON-D2 | DWD | 2 km | 3h | 2 days | `/v1/dwd-icon?models=icon_d2` | 5 | Active where data exists. |
| DWD ICON-EU EPS Mean | DWD | 13 km | 6h | 5 days | `https://ensemble-api.open-meteo.com/v1/ensemble?models=dwd_icon_eu_eps_ensemble_mean` | 4 | Active. Ensemble mean source with `temperature_2m_spread` for uncertainty. |
| Aladin / ČHMÚ | ČHMÚ | 2.3 km | 6h | 54 hours | `/api/aladin` | 5 | Active through proxy because browser CORS is unreliable. |
| Météo-France AROME | Météo-France | 1.3 km | 3h | 2 days | `/v1/meteofrance` | 4 | Active. |
| Météo-France ARPEGE | Météo-France | 11 km | 6h | 4 days | `/v1/meteofrance?models=arpege_europe` | 3 | Active. |
| KNMI HARMONIE | KNMI | 2 km | 1h | 2.5 days | `/v1/knmi` | 4 | Disabled: current Open-Meteo public endpoint returned 404 during testing. |
| DMI HARMONIE | DMI | 2 km | 3h | 2.5 days | `/v1/dmi` | 4 | Disabled: current Open-Meteo public endpoint returned 404 during testing. |
| MET Norway | MET Norway | 1 km | 1h | 2.5 days | `/v1/metno` | 3 | Disabled via Open-Meteo for Czech locations; use Yr.no proxy instead. |
| UK Met Office | UKMO | 2 km | 6h | 7 days | `/v1/ukmo` | 3 | Disabled: current Open-Meteo public endpoint returned 404 during testing. |
| NOAA GFS | NOAA | 13–25 km | 6h | 16 days | `/v1/gfs` | 3 | Active as a broad global baseline. |
| NOAA HRRR | NOAA | US only | 1h | 2 days | `/v1/gfs?models=hrrr` | 1 | Not useful for Czech locations. |
| AI GFS GraphCast | NOAA + Google | 25 km | 6h | 10 days | `/v1/gfs?models=gfs_graphcast025` | 3 | Active. Tested for Czech locations through Open-Meteo. |
| NOAA GEFS 0.25° Mean | NOAA | 25 km | 6h | 10 days | `https://ensemble-api.open-meteo.com/v1/ensemble?models=ncep_gefs025_ensemble_mean` | 2 | Active. Low-weight global ensemble mean. |
| GEM Global | MSC Canada | Global | 6h | 10 days | `/v1/gem` | 2 | Active as a low-weight independent global model. |
| GEM GEPS Mean | MSC Canada | 25 km | 12h | 16 days | `https://ensemble-api.open-meteo.com/v1/ensemble?models=cmc_gem_geps_ensemble_mean` | 2 | Active. Low-weight global ensemble mean. |
| ECMWF IFS EPS Mean | ECMWF | 25 km | 6h | 15 days | `https://ensemble-api.open-meteo.com/v1/ensemble?models=ecmwf_ifs025_ensemble_mean` | 3 | Active. Ensemble mean, separate from deterministic IFS HRES. |
| JMA GSM/MSM | JMA | Coarse over CZ | 3–6h | 4 days | `/v1/jma` | 2 | Active as a low-weight independent global/regional model. |
| CMA GRAPES | CMA | 15 km | 6h | 10 days | `/v1/cma` | 2 | Active as a low-weight independent global model. |
| BOM ACCESS-G | BOM Australia | 12 km | 6h | 10 days | `/v1/bom` | 2 | Disabled: tested endpoint returned null for Czech current forecast. |

## Good candidates without API keys

| Source | Data | Access | CORS | Notes |
| --- | --- | --- | --- | --- |
| Open-Meteo | Forecast models and selected historical data | Free, no key | Yes | Already used. Best base for model consensus. Community feedback is consistently positive. |
| Yr.no / MET Norway | Forecast, weather symbol, cloud layers, fog fraction, UV clear-sky | Free, no key | Proxy recommended | Already used through `/api/yr` because of User-Agent policy. Uses official MET Norway Locationforecast `complete` JSON, not Yr.no HTML scraping. |
| Aladin / ČHMÚ mirror | Nowcasting and model data | Free, no key | Proxy used | Already used through `/api/aladin`; browser CORS was unreliable. |
| DWD / Brightsky | Observations and DWD data wrapper | Free, no key | Yes | Good future source for station observations near Czech border and ICON context. |
| ČHMÚ open data | Stations, hydro, radar, lightning, AQI, warnings | Free, no key | Proxy likely | Highest priority for replacing scraping once stable endpoints are confirmed. |
| AviationWeather / NOAA | METAR, TAF, aviation weather | Free, no key | Proxy | Used through `/api/aviation`. METAR feeds consensus; TAF is shown in source attribution. |
| US National Weather Service | US-only forecast and alerts | Free, no key | Yes | Not useful for Czech locations, but good API design reference. |
| openSenseMap | Personal weather stations | Free, no key | Yes | Interesting future layer for community observations. |
| 7Timer! | Astro/weather forecast | Free, no key | Unknown | Niche source; lower priority. |
| wttr.in | Simple weather output, text/JSON formats | Free, no key | Likely usable | Good fallback/demo source, not a precision provider for Czech consensus. |

## ForecastWatch benchmark references

The ForecastWatch table from the Živě.cz article ranks global forecast providers by first-place finishes across high temperature, low temperature, precipitation probability, wind speed, and sky cover metrics. Lower rank is better.

| Provider | Overall | High temp | Low temp | POP | Wind speed | Sky cover | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Microsoft Weather | 1 | 1 | 1 | 3 | 1 | 2 | Best overall in the cited table. Proprietary aggregator using multiple sources and ML; no simple open API for this project. |
| The Weather Channel | 2 | 2 | 2 | 2 | 2 | 11 | Strong all-around. Commercial/proprietary through The Weather Company. |
| Foreca/Vaisala | 3 | 5 | 5 | 1 | 6 | 8 | Best POP rank in the table. Paid/enterprise candidate. |
| Wetter | 4 | 21 | 20 | 13 | 4 | 1 | Strong sky cover and wind, weak temperature ranks. |
| AccuWeather | 5 | 4 | 3 | 15 | 3 | 14 | Good temperature/wind, weak POP/sky cover. MinuteCast is interesting but free tier is constrained. |
| Dark Sky | 7 | 8 | 8 | 4 | 5 | 13 | Dead; useful only as historical reference. |
| Weerplaza | 8 | 18 | 15 | 5 | 9 | 3 | Dutch-focused provider, not currently a priority. |
| Weather Trends | 9 | 6 | 6 | 7 | 16 | 10 | Commercial reference. |
| World Weather Online | 11 | 23 | 18 | 17 | 13 | 4 | Weak overall in the table despite sky-cover rank. |
| AerisWeather | 13 | 12 | 12 | 12 | 14 | 7 | Commercial reference. |
| OpenWeather | 15 | 22 | 22 | 8 | 12 | 12 | Not a precision upgrade based on this benchmark. Keep as fallback only. |
| Pelmorex | 16 | 17 | 17 | 10 | 8 | 15 | Commercial reference. |
| Weatherbit | 17 | 14 | 20 | 9 | 11 | 16 | Useful for AQI later, but not a top forecast source in the table. |

## API-key and freemium candidates

| Source | Data | Free tier | CORS | Notes |
| --- | --- | --- | --- | --- |
| WeatherAPI.com | Forecast, astronomy, marine, geolocation | Large free tier reported | Yes | Good optional self-host integration; users report it is easy to use. |
| Visual Crossing | Forecast and historical timeline | No free tier currently | Yes | Strong history/timeline product, but not suitable for default or optional free setup. |
| Windy.com Point Forecast | Forecast model data | Testing key only for development; production is paid | Server-side recommended | Not suitable as a default consensus source. The testing tier intentionally returns modified/shuffled data, and the professional tier is paid. |
| Windy.com Map Forecast | Map layers | Testing tier, paid production | Browser SDK | Better for a map/radar experience than raw consensus data. |
| The Weather Channel / The Weather Company | Forecast, radar, alerts | Commercial | Unknown | Rank 2 in the ForecastWatch table. Strong but proprietary/enterprise. |
| Microsoft Weather | Forecast, radar, alerts, AI summaries | No public simple API | Unknown | Rank 1 in the ForecastWatch table. Treat as strategy reference, not an integration target. |
| Foreca/Vaisala | Forecast | Paid/enterprise | Unknown | Rank 3 overall and rank 1 for POP in the ForecastWatch table. Strong paid candidate. |
| OpenWeatherMap | Forecast and observations | Around 1,000 calls/day reported | Unknown | Popular and cheap for hobby usage, but not better than current free model stack; weak in the cited ForecastWatch table. |
| Weatherbit | Forecast and AQI | Free tier varies; some reports mention low daily limits | Unknown | Publishes forecast metrics; candidate for AQI later. |
| Tomorrow.io | Proprietary forecast and layers | Commonly reported 25 requests/hour, 500/day | Unknown | Slick API, but strict free limit and mixed accuracy reports. |
| Pirate Weather | Dark Sky-compatible forecast | Free key, generous daily limit reported | Proxy recommended | Interesting open-source Dark Sky-style API. |
| Meteomatics | Many parameters, commercial-grade API | Trial/freemium | Unknown | Powerful but pricing needs evaluation. |
| Meteosource | ML-enhanced forecast | Limited freemium | Unknown | Candidate if API-key integrations are accepted. |
| Meteoblue | Many variables and models | Freemium/paid | Yes | Good quality, likely paid for serious use. |
| Oikolab | Historical and forecast data | API key | Yes | Strong historical archive; future history feature. |
| GribStream | Bulk model pulls, NBM/GFS | Free tier reported | Unknown | Potential server-side bulk ingestion source, not a client provider. |
| NOAA NOMADS / GRIB | Raw model data files | Free | Server-side only | Powerful but requires GRIB parsing and storage. Better for a future ingestion worker than for Vercel functions. |
| Google Weather API | Google Maps Weather | 10k/month reported | Yes via Google platform | New candidate, requires billing setup and Google Maps Platform dependency. |
| QWeather | Weather forecast | API key | Yes | Lower priority for Czech-focused app. |
| Storm Glass | Marine and multi-source weather | Very small free tier reported | Yes | Marine-specific, not relevant for MVP. |
| IQAir | Air quality and weather | API key | Unknown | Candidate when AQI is in scope. |
| AEMET | Spain weather | API key | Unknown | Not relevant for Czech coverage. |
| KMA | Korea weather | API key | Unknown | Not relevant for Czech coverage. |
| Foreca | Forecast | OAuth/paid | Unknown | Paid/enterprise; keep as reference only. |
| Apple WeatherKit | Forecast and current weather | Requires Apple Developer account | Apple auth | Good quality but not open-source friendly for this project. |
| AccuWeather | Forecast and MinuteCast | Very small free tier | Unknown | Strong temperature/wind ranks in the cited table; MinuteCast is interesting, but free tier is too constrained. |
| Wetter | Forecast | Commercial/freemium unclear | Unknown | Excellent sky-cover rank in the cited table, weak temperature ranks. |
| Weerplaza | Forecast | Commercial/freemium unclear | Unknown | Dutch-focused; good POP/sky-cover ranks in the cited table. |
| World Weather Online | Forecast and historical weather | API key | Unknown | Present in benchmark but weak overall. |
| AerisWeather | Forecast, maps, alerts | API key | Unknown | Commercial weather platform; mid/low benchmark rank. |
| Pelmorex | Forecast | Commercial | Unknown | The Weather Network parent company; low benchmark rank. |

## Internal or undocumented web APIs

| Source | What we found | Status |
| --- | --- | --- |
| Počasí.cz / Seznam `wapi.pocasi.seznam.cz` | `pocasicz.html` embeds cached calls to `/v2/place`, `/v2/forecast`, `/v2/weatherInCR`, and POI endpoints. `/v2/forecast?lat=...&lon=...&include=current,place,entries,daily` returns JSON with current temperature, apparent temperature, pressure, UV, wind, gusts, precipitation, icon id, hourly-ish entries, and daily summaries. CORS currently allows browser access. | Implemented only as an opt-in experimental provider because it is not a documented public API and usage terms/data redistribution are unclear. Keep it server-side, cached, attributed, low volume, and removable. |

## Czech open-data and hydrology notes

The Živě.cz poradna thread about weather and hydrology APIs adds several practical Czech-specific points:

- ČHMÚ historical station metadata and historical datasets are usable, but they are not enough for real-time app weather.
- The dataset **"Naměřená hydrologická data – now"** existed with only a small subset of stations, reportedly around 8 navigation-related stations at the time of the discussion.
- A response attributed to the National Open Data Catalog administrator said broader hydrological open-data publishing was expected around late 2024 or after the public hydrometeorological service law took effect in early 2025.
- ČHMÚ can deliver current data by contract, but this is paid and not suitable for a hobby/open-source default.
- Scraping ČHMÚ pages may be legally nuanced and operationally fragile. It should stay a fallback, not the main architecture.
- Server-side caching is mandatory for any scraping or high-volume upstream use. The client should fetch from our server/cache, not hammer upstream sources per user.
- For hydrology, basin authorities such as Povodí Labe, Povodí Moravy, Povodí Vltavy, etc. may expose more practical current data than ČHMÚ pages in some cases.
- The Czech open-data portal/ArcGIS hub `https://open-data-chmi.hub.arcgis.com/` is worth evaluating before adding more scraping.
- `wttr.in` is useful as a simple machine-readable weather source, but not a precision provider for SmirkPočasí.
- GRIB/NOMADS NOAA data is an option for bulk model ingestion, but it is a different server-side pipeline, not a simple client API.

| Dataset | Data | Priority |
| --- | --- | --- |
| Meteorological stations | Temperature, precipitation, wind, pressure, snow, near real time | High |
| Hydrology | Water levels, flow, water temperature, flood stages | High; should replace current HTML scraping. First check `open-data-chmi.hub.arcgis.com`, `Naměřená hydrologická data – now`, and basin authority endpoints. |
| Radar and lightning | Official radar frames and lightning network | High; could reduce RainViewer and Blitzortung dependency. |
| Air quality | AQI, PM2.5, PM10, O3, NO2 | Medium; out of current scope. |
| Floods | Warnings, historical events, soil saturation | Medium |
| Phenology | Plant phases, flowering, harvest signals | Low but uniquely Czech/EU-interesting. |
| Climate | Normals, records, historical measurements | Low until history pages are planned. |

## Low-priority or not suitable

| Source | Reason |
| --- | --- |
| APIXU | Replaced by WeatherAPI branding in practice. |
| ODWeather | HTTPS unavailable in public catalog. |
| weather-api | CORS unavailable in public catalog. |
| Yandex.Weather | CORS unavailable and key required. |
| ColorfulClouds | Regional focus outside Czech/EU use case. |
| HG Weather | Brazil-focused. |
| Hong Kong Observatory | Local HK weather only. |
| Korea Meteorological Administration | Korea-focused. |
| Met Office DataPoint | UK-focused and legacy API-key flow. |
| Weatherstack | Very small free tier and aggregator positioning. |
| Dark Sky | Dead; acquired by Apple and shut down. |
| Xiaomi Data | Proprietary/device-focused. |
| Weathernews Inc. | Enterprise/proprietary. |
| Weather Trends | Commercial/proprietary long-range provider. |
| Wetter | Commercial/regional provider; interesting sky-cover benchmark, not a priority. |
| Weerplaza | Dutch/regional provider; not a Czech priority. |
| World Weather Online | API-key provider with weak benchmark rank. |
| AerisWeather | Commercial platform with mid/low benchmark rank. |
| Pelmorex | Commercial provider with low benchmark rank. |

## Suggested future integrations

1. **ČHMÚ open data first**: replace hydro scraping and evaluate `open-data-chmi.hub.arcgis.com`, official `now` hydrology datasets, and basin authority endpoints before adding more global providers.
2. **openSenseMap observations**: add nearby community stations to map and current weather detail.
3. **Brightsky / DWD observations**: add station observations and potentially compare with Czech border regions.
4. **Optional API-key providers**: WeatherAPI.com, Visual Crossing, Pirate Weather, or Google Weather API as self-host-only extensions.
5. **AviationWeather**: add METAR/TAF cards for nearby Czech airports.
6. **AQI later**: IQAir, Weatherbit, or ČHMÚ AQI when air quality becomes in scope.

## Implemented provider tiers

### Enabled by default

These providers need no user API key and are included in the consensus or source table by default:

| Provider | Type | Implementation | Notes |
| --- | --- | --- | --- |
| Aladin / ČHMÚ | Model + nowcasting | `/api/aladin`, `src/api/aladin.js` | Proxied because browser CORS was unreliable. |
| ČHMÚ stations | Observation | `/api/chmi` | OpenData 10-minute station feed; weight 0. |
| Aviation METAR/TAF | Observation | `/api/aviation` | METAR in consensus; TAF surfaced in attribution. |
| Brightsky / DWD | Observation | `src/api/brightsky.js` | Border DE stations; weight 0. |
| SHMÚ | Observation | `/api/shmu` | Slovak AWS near CZ–SK border; weight 0. |
| GeoSphere Austria | Observation | `/api/geosphere` | TAWES current; weight 0 near AT border. |
| IMGW-PIB | Observation | `/api/imgw` | Polish synop; weight 0 near PL border. |
| Open-Meteo NWP models | Independent model endpoints | `src/api/openmeteo.js` | ECMWF IFS/AIFS, ICON, AROME/ARPEGE, GFS, GraphCast, GEM, JMA, CMA. |
| Open-Meteo Ensemble Mean | Probabilistic model mean | `src/api/openmeteo.js` | ICON-EU EPS, GEFS 0.25, GEM GEPS, ECMWF IFS EPS. Uses mean values plus temperature spread. |
| Yr.no / MET Norway | Forecast provider | `/api/yr`, `src/api/yr.js` | Proxied for required User-Agent. Uses Locationforecast `complete` and normalizes symbol code, precipitation range/probability, cloud layers, fog fraction, wind, pressure, dew point, and UV clear-sky. |
| wttr.in | Simple forecast/current fallback | `/api/wttr`, `src/api/wttr.js` | Low weight. Good fallback, not a precision source. |
| openSenseMap | Nearby station observations | direct client fetch | Observation source only; excluded from forecast median unless it is the only usable data. |
| ČHMÚ radar | Map layer | `/api/chmi-radar` | Default Czech radar; RainViewer remains a toggle. |
| ČHMÚ warnings | CAP alerts | `/api/warnings` | Home banner + radar badge. |
| ČHMÚ AQI | Air quality | `/api/chmi-aqi` | Primary; Open-Meteo CAMS fallback. |
| Hydro HPPS | Hydrology | `/api/hydro` | OpenData-first (nearest stations), scrape fallback. |

### Optional API-key providers

These are implemented but disabled unless `VITE_ENABLE_API_KEY_PROVIDERS=true` and the corresponding server-side key exists.

| Provider | Env key | Implementation | Why optional |
| --- | --- | --- | --- |
| WeatherAPI.com | `WEATHERAPI_KEY` | `/api/weatherapi`, `src/api/weatherapi.js` | Generous free tier, useful self-host option. |
| Pirate Weather | `PIRATEWEATHER_KEY` | `/api/pirateweather`, `src/api/pirateweather.js` | Dark Sky-style API, key required. |
| OpenWeatherMap | `OPENWEATHERMAP_KEY` | `/api/openweathermap`, `src/api/openweathermap.js` | Popular fallback, but not a precision upgrade. |
| Netatmo PWS | `NETATMO_CLIENT_ID`, `NETATMO_CLIENT_SECRET`, `NETATMO_REFRESH_TOKEN` | `/api/netatmo` | Public weathermap PWS; weight 0. |
| Weather Underground PWS | `WUNDERGROUND_KEY` | `/api/wunderground` | Nearby PWS observation; weight 0. |
| Meteostat | `METEOSTAT_KEY` | `/api/meteostat` | Last 7 daily values on Settings (not consensus). |

### Experimental no-key providers

These are implemented but disabled unless `VITE_ENABLE_EXPERIMENTAL_SOURCES=true`.

| Provider | Env flag | Implementation | Why experimental |
| --- | --- | --- | --- |
| Počasí.cz / Seznam | `VITE_ENABLE_EXPERIMENTAL_SOURCES` | `/api/pocasicz`, `src/api/pocasicz.js` | Uses Seznam's undocumented `wapi.pocasi.seznam.cz` forecast JSON. Seznam publicly described Počasí.cz as using data from Windy.com, but this is not the same as a public Windy API grant. Keep low-volume, server-side cached, attributed, and removable. |

### Derived fields

The app normalizes provider output and fills safe missing fields where the source exposes enough base data:

| Field | Inputs | Notes |
| --- | --- | --- |
| Weather condition | Precipitation, temperature, dew point, cloud cover, visibility | Heuristic fallback only. Direct WMO `weatherCode` is preferred when present. |
| Apparent temperature | Temperature, humidity, wind speed | Uses wind chill in cold/windy conditions and apparent-temperature approximation otherwise. |
| Dew point | Temperature, relative humidity | Magnus formula fallback. |
| Wet-bulb temperature | Temperature, relative humidity | Stull approximation for quick current-condition display. |
| Vapor pressure deficit | Temperature, relative humidity | Useful dryness/stress indicator, shown as kPa. |
| Absolute humidity | Temperature, relative humidity | Shown as approximate g/m³. |

### Deliberately not implemented

| Provider | Reason |
| --- | --- |
| Microsoft Weather | No simple legal public API; proprietary benchmark reference only. |
| The Weather Channel / Weather.com | Enterprise/proprietary. |
| Foreca/Vaisala | Strong benchmark, but paid/enterprise. |
| AccuWeather | Interesting MinuteCast, but very small free tier. |
| Windy.com Point Forecast | Production tier is paid and ECMWF is excluded; testing tier data is intentionally unsuitable for production. |
| Počasí.cz / Seznam `wapi` | Undocumented/internal API. Technically easy to consume, but not safe as a default source until Seznam’s usage terms and attribution requirements are confirmed. |
| Tomorrow.io | Strict free limits and mixed accuracy reports. |
| Weatherbit | Better saved for AQI scope; not a top forecast source in benchmark. |
| Visual Crossing | No current free tier; keep as documentation only. |
| Meteomatics, Meteoblue, Oikolab, GribStream | Powerful but better suited for paid/server-side ingestion features. |
