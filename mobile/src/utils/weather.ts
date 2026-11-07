import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, Wind, type LucideIcon } from 'lucide-react-native';

/** WeatherKit-style condition names ("PartlyCloudy", "Rain"…) → icon. */
export function weatherIcon(condition: string, daylight = true): LucideIcon {
  const c = condition.toLowerCase();
  if (c.includes('thunder') || c.includes('storm')) return CloudLightning;
  if (c.includes('snow') || c.includes('sleet') || c.includes('flurr') || c.includes('blizzard')) return CloudSnow;
  if (c.includes('drizzle')) return CloudDrizzle;
  if (c.includes('rain') || c.includes('shower')) return CloudRain;
  if (c.includes('fog') || c.includes('haze') || c.includes('smok') || c.includes('dust')) return CloudFog;
  if (c.includes('wind') || c.includes('breez')) return Wind;
  if (c.includes('partly') || c.includes('mostlyclear')) return daylight ? CloudSun : CloudMoon;
  if (c.includes('cloud')) return Cloud;
  return daylight ? Sun : Moon;
}

/** "PartlyCloudy" → "Partly cloudy" */
export function weatherLabel(condition: string): string {
  const words = condition.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function temp(value: number): string {
  return `${Math.round(value)}°`;
}
