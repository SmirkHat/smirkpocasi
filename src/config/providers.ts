import { fetchAccuweather } from '../api/accuweather';
import { fetchAladin } from '../api/aladin';
import { fetchAviation } from '../api/aviation';
import { fetchBmkg } from '../api/bmkg';
import { fetchBrightsky } from '../api/brightsky';
import { fetchCHMI } from '../api/chmi';
import { fetchFmi } from '../api/fmi';
import { fetchGeosphere } from '../api/geosphere';
import { fetchImgw } from '../api/imgw';
import { fetchInpocasiStations } from '../api/inpocasi';
import { fetchMeteoam } from '../api/meteoam';
import { fetchMeteosource } from '../api/meteosource';
import { fetchNws } from '../api/nws';
import { fetchOpenMeteoEnsembleMean, fetchOpenMeteoModel } from '../api/openmeteo';
import { fetchOpenSenseMap } from '../api/opensensemap';
import { fetchNetatmo } from '../api/netatmo';
import { fetchOpenWeatherMap } from '../api/openweathermap';
import { fetchPirateWeather } from '../api/pirateweather';
import { fetchPocasiCz } from '../api/pocasicz';
import { fetchShmu } from '../api/shmu';
import { fetchSmhi } from '../api/smhi';
import { fetchTomorrowio } from '../api/tomorrowio';
import { fetchWeatherApi } from '../api/weatherapi';
import { fetchWeatherbit } from '../api/weatherbit';
import { fetchWeatherCom } from '../api/weathercom';
import { fetchWttr } from '../api/wttr';
import { fetchWunderground } from '../api/wunderground';
import { fetchXweather } from '../api/xweather';
import { fetchYr } from '../api/yr';

const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const OPTIONAL_API_PROVIDERS_ENABLED =
  viteEnv.VITE_ENABLE_API_KEY_PROVIDERS === 'true' ||
  (typeof process !== 'undefined' && process.env?.VITE_ENABLE_API_KEY_PROVIDERS === 'true') ||
  (typeof process !== 'undefined' && process.env?.ENABLE_API_KEY_PROVIDERS === 'true');
const EXPERIMENTAL_SOURCES_ENABLED =
  viteEnv.VITE_ENABLE_EXPERIMENTAL_SOURCES === 'true' ||
  (typeof process !== 'undefined' && process.env?.VITE_ENABLE_EXPERIMENTAL_SOURCES === 'true') ||
  (typeof process !== 'undefined' && process.env?.ENABLE_EXPERIMENTAL_SOURCES === 'true');

export const PROVIDERS = [
  {
    id: 'chmi',
    name: 'ČHMÚ Stanice',
    enabled: true,
    weight: 0,
    url: 'https://opendata.chmi.cz/',
    coverage: { latMin: 48.3, latMax: 51.2, lonMin: 11.8, lonMax: 19.1 },
    fetchFn: fetchCHMI
  },
  {
    id: 'aviation',
    name: 'Letecké METAR/TAF',
    enabled: true,
    weight: 0,
    url: 'https://aviationweather.gov/',
    coverage: { latMin: 48.3, latMax: 51.2, lonMin: 11.8, lonMax: 19.1 },
    fetchFn: fetchAviation
  },
  {
    id: 'brightsky',
    name: 'DWD Brightsky',
    enabled: true,
    weight: 0,
    url: 'https://brightsky.dev/',
    coverage: { latMin: 47, latMax: 55.5, lonMin: 5.5, lonMax: 15.5 },
    fetchFn: fetchBrightsky
  },
  {
    id: 'shmu',
    name: 'SHMÚ Stanice',
    type: 'Pozorování',
    enabled: true,
    weight: 0,
    url: 'https://www.shmu.sk/',
    coverage: { latMin: 47.5, latMax: 49.8, lonMin: 16.5, lonMax: 22.8 },
    fetchFn: fetchShmu
  },
  {
    id: 'geosphere',
    name: 'GeoSphere Austria',
    type: 'Pozorování',
    enabled: true,
    weight: 0,
    url: 'https://data.hub.geosphere.at/',
    coverage: { latMin: 46.2, latMax: 49.2, lonMin: 9.4, lonMax: 17.3 },
    fetchFn: fetchGeosphere
  },
  {
    id: 'imgw',
    name: 'IMGW-PIB Synop',
    type: 'Pozorování',
    enabled: true,
    weight: 0,
    url: 'https://danepubliczne.imgw.pl/',
    coverage: { latMin: 49.0, latMax: 55.0, lonMin: 14.0, lonMax: 24.5 },
    fetchFn: fetchImgw
  },
  {
    id: 'aladin',
    name: 'Aladin (ČHMÚ)',
    enabled: true,
    weight: 5,
    url: 'https://www.chmi.cz/',
    coverage: { latMin: 48.3, latMax: 51.2, lonMin: 11.8, lonMax: 19.1 },
    fetchFn: fetchAladin
  },
  {
    id: 'ecmwf_ifs',
    name: 'ECMWF IFS',
    enabled: true,
    weight: 5,
    endpoint: '/v1/ecmwf',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'ecmwf_aifs',
    name: 'ECMWF AIFS',
    enabled: true,
    weight: 4,
    endpoint: '/v1/ecmwf',
    model: 'ecmwf_aifs025',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'icon_eu',
    name: 'DWD ICON-EU',
    enabled: true,
    weight: 5,
    endpoint: '/v1/dwd-icon',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'icon_d2',
    name: 'DWD ICON-D2',
    enabled: true,
    weight: 5,
    endpoint: '/v1/dwd-icon',
    model: 'icon_d2',
    coverage: { latMin: 34, latMax: 72, lonMin: -12, lonMax: 45 },
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'icon_eu_eps_mean',
    name: 'DWD ICON-EU EPS Mean',
    type: 'Ensemble mean',
    enabled: true,
    weight: 4,
    model: 'dwd_icon_eu_eps_ensemble_mean',
    coverage: { latMin: 34, latMax: 72, lonMin: -12, lonMax: 45 },
    fetchFn: fetchOpenMeteoEnsembleMean
  },
  {
    id: 'arome',
    name: 'Météo-France AROME',
    enabled: true,
    weight: 4,
    endpoint: '/v1/meteofrance',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'arpege',
    name: 'Météo-France ARPEGE',
    enabled: true,
    weight: 3,
    endpoint: '/v1/meteofrance',
    model: 'arpege_europe',
    coverage: { latMin: 20, latMax: 75, lonMin: -20, lonMax: 50 },
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'gfs',
    name: 'NOAA GFS',
    enabled: true,
    weight: 3,
    endpoint: '/v1/gfs',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'graphcast',
    name: 'AI GFS GraphCast',
    enabled: true,
    weight: 1,
    endpoint: '/v1/gfs',
    model: 'gfs_graphcast025',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'gefs025_mean',
    name: 'NOAA GEFS 0.25° Mean',
    type: 'Ensemble mean',
    enabled: true,
    weight: 2,
    model: 'ncep_gefs025_ensemble_mean',
    fetchFn: fetchOpenMeteoEnsembleMean
  },
  {
    id: 'gem',
    name: 'GEM Global',
    enabled: true,
    weight: 2,
    endpoint: '/v1/gem',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'gem_geps_mean',
    name: 'GEM GEPS Mean',
    type: 'Ensemble mean',
    enabled: true,
    weight: 2,
    model: 'cmc_gem_geps_ensemble_mean',
    fetchFn: fetchOpenMeteoEnsembleMean
  },
  {
    id: 'ecmwf_ifs_eps_mean',
    name: 'ECMWF IFS EPS Mean',
    type: 'Ensemble mean',
    enabled: true,
    weight: 3,
    model: 'ecmwf_ifs025_ensemble_mean',
    fetchFn: fetchOpenMeteoEnsembleMean
  },
  {
    id: 'jma',
    name: 'JMA GSM/MSM',
    enabled: true,
    weight: 2,
    endpoint: '/v1/jma',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'cma',
    name: 'CMA GRAPES',
    enabled: true,
    weight: 2,
    endpoint: '/v1/cma',
    fetchFn: fetchOpenMeteoModel
  },
  {
    id: 'yr',
    name: 'Yr.no',
    enabled: true,
    weight: 3,
    url: 'https://www.yr.no/',
    fetchFn: fetchYr
  },
  {
    id: 'smhi',
    name: 'SMHI',
    type: 'Národní služba',
    attribution: 'SMHI open data (snow1g) — Nordics',
    enabled: true,
    weight: 3,
    url: 'https://opendata.smhi.se/',
    coverage: { latMin: 54.5, latMax: 71.5, lonMin: 4, lonMax: 32 },
    fetchFn: fetchSmhi
  },
  {
    id: 'fmi',
    name: 'FMI',
    type: 'Národní služba',
    attribution: 'Finnish Meteorological Institute open data',
    enabled: true,
    weight: 3,
    url: 'https://en.ilmatieteenlaitos.fi/',
    coverage: { latMin: 55, latMax: 72, lonMin: 5, lonMax: 32 },
    fetchFn: fetchFmi
  },
  {
    id: 'nws',
    name: 'NWS',
    type: 'Národní služba',
    attribution: 'US National Weather Service (api.weather.gov)',
    enabled: true,
    weight: 3,
    url: 'https://www.weather.gov/',
    coverage: { latMin: 18, latMax: 72, lonMin: -180, lonMax: -65 },
    fetchFn: fetchNws
  },
  {
    id: 'meteoam',
    name: 'Meteo AM',
    type: 'Neoficiální',
    attribution: 'Meteorologia Aeronautica Militare (api.meteoam.it)',
    enabled: true,
    weight: 2,
    url: 'https://www.meteoam.it/',
    coverage: { latMin: 35.5, latMax: 47.5, lonMin: 6.2, lonMax: 19.2 },
    fetchFn: fetchMeteoam
  },
  {
    id: 'bmkg',
    name: 'BMKG',
    type: 'Národní služba',
    attribution: 'BMKG Indonesia',
    enabled: true,
    weight: 2,
    url: 'https://www.bmkg.go.id/',
    coverage: { latMin: -11.5, latMax: 6.5, lonMin: 94.5, lonMax: 141.5 },
    fetchFn: fetchBmkg
  },
  {
    id: 'weathercom',
    name: 'Weather.com',
    type: 'Neoficiální',
    attribution: 'Weather.com / The Weather Channel (neoficiální web API)',
    enabled: true,
    weight: 2,
    url: 'https://weather.com/',
    fetchFn: fetchWeatherCom
  },
  {
    id: 'wttr',
    name: 'wttr.in',
    enabled: true,
    weight: 1,
    url: 'https://wttr.in/',
    fetchFn: fetchWttr
  },
  {
    id: 'pocasicz',
    name: 'Počasí.cz / Seznam',
    type: 'Experimentální',
    attribution: 'Počasí.cz / Seznam.cz, podle Seznam blogu data z Windy.com',
    enabled: EXPERIMENTAL_SOURCES_ENABLED,
    weight: 1,
    url: 'https://www.pocasi.cz/',
    fetchFn: fetchPocasiCz
  },
  {
    id: 'opensensemap',
    name: 'openSenseMap',
    type: 'Kontrolní data',
    enabled: true,
    weight: 0,
    url: 'https://opensensemap.org/',
    fetchFn: fetchOpenSenseMap
  },
  {
    id: 'inpocasi',
    name: 'In-počasí stanice',
    type: 'Kontrolní data',
    attribution: 'In-počasí (agregace stanic)',
    enabled: true,
    weight: 0,
    url: 'https://www.in-pocasi.cz/',
    coverage: { latMin: 48.3, latMax: 51.2, lonMin: 11.8, lonMax: 19.1 },
    fetchFn: fetchInpocasiStations
  },
  {
    id: 'weatherapi',
    name: 'WeatherAPI.com',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://www.weatherapi.com/',
    fetchFn: fetchWeatherApi
  },
  {
    id: 'pirateweather',
    name: 'Pirate Weather',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://pirateweather.net/',
    fetchFn: fetchPirateWeather
  },
  {
    id: 'openweathermap',
    name: 'OpenWeatherMap',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://openweathermap.org/',
    fetchFn: fetchOpenWeatherMap
  },
  {
    id: 'tomorrowio',
    name: 'Tomorrow.io',
    type: 'API klíč',
    attribution: 'Tomorrow.io Weather API (free tier: ~3 rps / 25 req/h / 500/day)',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://www.tomorrow.io/',
    fetchFn: fetchTomorrowio
  },
  {
    id: 'meteosource',
    name: 'Meteosource',
    type: 'API klíč',
    attribution: 'Meteosource Weather API',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://www.meteosource.com/',
    fetchFn: fetchMeteosource
  },
  {
    id: 'xweather',
    name: 'Xweather',
    type: 'API klíč',
    attribution: 'Xweather Weather API (formerly AerisWeather)',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://www.xweather.com/',
    fetchFn: fetchXweather
  },
  {
    id: 'weatherbit',
    name: 'Weatherbit',
    type: 'API klíč',
    attribution: 'Weatherbit (Free: current + 7d daily, 50 req/day — no hourly)',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 2,
    url: 'https://www.weatherbit.io/',
    fetchFn: fetchWeatherbit
  },
  {
    id: 'accuweather',
    name: 'AccuWeather',
    type: 'Neoficiální',
    attribution: 'AccuWeather (neoficiální web klíč · current + 24 h; ACCUWEATHER_KEY → až 120 h)',
    enabled: true,
    weight: 2,
    url: 'https://www.accuweather.com/',
    fetchFn: fetchAccuweather
  },
  {
    id: 'netatmo',
    name: 'Netatmo PWS',
    type: 'Kontrolní data',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 0,
    url: 'https://dev.netatmo.com/',
    fetchFn: fetchNetatmo
  },
  {
    id: 'wunderground',
    name: 'Weather Underground PWS',
    type: 'Kontrolní data',
    enabled: OPTIONAL_API_PROVIDERS_ENABLED,
    weight: 0,
    url: 'https://www.wunderground.com/',
    fetchFn: fetchWunderground
  }
];
