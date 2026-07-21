import {
  WiCloud,
  WiDayCloudy,
  WiDayFog,
  WiDayRain,
  WiDayShowers,
  WiDaySunny,
  WiRain,
  WiRainMix,
  WiSnow,
  WiStormShowers,
  WiThermometer
} from 'react-icons/wi';

const WEATHER_CODES = {
  0: ['Jasno', WiDaySunny],
  1: ['Převážně jasno', WiDaySunny],
  2: ['Polojasno', WiDayCloudy],
  3: ['Zataženo', WiCloud],
  45: ['Mlha', WiDayFog],
  48: ['Namrzající mlha', WiDayFog],
  51: ['Slabé mrholení', WiDayShowers],
  53: ['Mrholení', WiDayShowers],
  55: ['Silné mrholení', WiRain],
  56: ['Slabé namrzající mrholení', WiRainMix],
  57: ['Namrzající mrholení', WiRainMix],
  61: ['Slabý déšť', WiDayRain],
  63: ['Déšť', WiRain],
  65: ['Silný déšť', WiRain],
  66: ['Slabý namrzající déšť', WiRainMix],
  67: ['Namrzající déšť', WiRainMix],
  71: ['Slabé sněžení', WiSnow],
  73: ['Sněžení', WiSnow],
  75: ['Silné sněžení', WiSnow],
  77: ['Sněhová zrna', WiSnow],
  80: ['Slabé přeháňky', WiDayShowers],
  81: ['Přeháňky', WiDayShowers],
  82: ['Silné přeháňky', WiStormShowers],
  85: ['Slabé sněhové přeháňky', WiSnow],
  86: ['Sněhové přeháňky', WiSnow],
  95: ['Bouřka', WiStormShowers],
  96: ['Bouřka s krupami', WiStormShowers],
  99: ['Silná bouřka s krupami', WiStormShowers]
};

export function getWeatherInfo(code) {
  const [label, Icon] = WEATHER_CODES[code] || ['Neznámé počasí', WiThermometer];
  return { label, Icon };
}
