import data from './countries.json';

export interface Country {
  code: string;
  name: string;
}

/** All ISO 3166-1 countries, alphabetical (generated from the backend's `pycountry`). */
export const COUNTRIES: Country[] = (data as [string, string][]).map(([code, name]) => ({ code, name }));

export function countryName(code: string | null | undefined): string | null {
  return COUNTRIES.find((c) => c.code === code)?.name ?? null;
}

/** 🇮🇳 from "IN" (regional-indicator letters). */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
