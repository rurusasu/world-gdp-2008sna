import type { CountrySeries, Point } from './report';

export interface CountryChoice {
  code: string;
  name: string;
  series: CountrySeries;
  color: string;
}

export interface DecadeAverage {
  start: number;
  mean: number;
  count: number;
  first: number;
  last: number;
}

export function countryColor(code: string): string {
  let hash = 2166136261;
  for (const character of code) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (Math.abs(hash) * 137.508) % 360;
  const saturation = 62 + (Math.abs(hash >>> 8) % 17);
  const lightness = 36 + (Math.abs(hash >>> 16) % 12);
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

export function chooseCountrySeries(series: CountrySeries[]): CountryChoice[] {
  const selected = new Map<string, CountrySeries>();
  for (const item of series) {
    const current = selected.get(item.country_code);
    if (
      !current ||
      Number(item.preferred) > Number(current.preferred) ||
      (item.preferred === current.preferred &&
        (item.last > current.last ||
          (item.last === current.last && item.id.localeCompare(current.id) < 0)))
    ) {
      selected.set(item.country_code, item);
    }
  }
  return [...selected.entries()]
    .map(([code, item]) => ({ code, name: item.country, series: item, color: countryColor(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function decadeAverages(points: Point[]): DecadeAverage[] {
  const grouped = new Map<number, Point[]>();
  for (const point of points) {
    if (point.growth === null || !Number.isFinite(point.growth)) continue;
    const start = Math.floor(point.year / 10) * 10;
    const decade = grouped.get(start) ?? [];
    decade.push(point);
    grouped.set(start, decade);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([start, values]) => {
      values.sort((a, b) => a.year - b.year);
      return {
        start,
        mean: values.reduce((total, point) => total + (point.growth ?? 0), 0) / values.length,
        count: values.length,
        first: values[0].year,
        last: values[values.length - 1].year,
      };
    });
}
