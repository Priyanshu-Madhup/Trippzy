/**
 * Trippy's design tokens (src/index.css), verbatim. Solid colours are "R G B" channels so
 * Tailwind's `/opacity` works; line/tinted tokens carry their own alpha.
 */
export type Scheme = 'light' | 'dark';

const light = {
  '--bg': '247 247 245',
  '--bg-elevated': '251 251 250',
  '--surface': '255 255 255',
  '--surface-2': '241 240 236',
  '--surface-3': '232 230 224',
  '--ink': '17 17 16',
  '--ink-2': '58 57 54',
  '--muted': '119 116 108',
  '--faint': '167 164 155',
  '--primary': '17 17 16',
  '--primary-ink': '250 250 248',
  '--navy': '27 42 74',
  '--sun': '232 178 106',
  '--sun-ink': '122 77 18',
  '--success': '47 125 91',
  '--warning': '183 121 31',
  '--danger': '194 65 45',
  '--line': 'rgba(17, 17, 16, 0.08)',
  '--line-strong': 'rgba(17, 17, 16, 0.14)',
  '--warning-bg': '#fdf3e2',
  '--danger-bg': '#fbeae6',
} as const;

const dark: Record<keyof typeof light, string> = {
  '--bg': '11 11 12',
  '--bg-elevated': '17 17 19',
  '--surface': '22 22 24',
  '--surface-2': '29 29 32',
  '--surface-3': '39 39 43',
  '--ink': '244 244 241',
  '--ink-2': '214 213 208',
  '--muted': '154 152 145',
  '--faint': '106 104 98',
  '--primary': '244 244 241',
  '--primary-ink': '17 17 16',
  '--navy': '159 179 221',
  '--sun': '239 194 131',
  '--sun-ink': '243 211 163',
  '--success': '95 191 147',
  '--warning': '231 179 92',
  '--danger': '240 122 100',
  '--line': 'rgba(255, 255, 255, 0.07)',
  '--line-strong': 'rgba(255, 255, 255, 0.13)',
  '--warning-bg': 'rgba(231, 179, 92, 0.1)',
  '--danger-bg': 'rgba(240, 122, 100, 0.1)',
};

export const themeVars: Record<Scheme, Record<string, string>> = { light, dark };

/** Hex values for places JS needs a colour (icon `color`, gradients, status bar). */
export const hex = {
  light: { bg: '#f7f7f5', surface: '#ffffff', surface2: '#f1f0ec', ink: '#111110', muted: '#77746c', faint: '#a7a49b', sun: '#e8b26a', danger: '#c2412d', warning: '#b7791f', success: '#2f7d5b' },
  dark: { bg: '#0b0b0c', surface: '#161618', surface2: '#1d1d20', ink: '#f4f4f1', muted: '#9a9891', faint: '#6a6862', sun: '#efc283', danger: '#f07a64', warning: '#e7b35c', success: '#5fbf93' },
} as const;

/** Trippy's four shadow levels, as React Native `boxShadow` (two layers each). */
export const shadows = {
  soft: (dark: boolean) => `0 1px 2px rgba(${dark ? '0,0,0' : '30,25,15'},0.04), 0 4px 16px -6px rgba(${dark ? '0,0,0' : '30,25,15'},0.08)`,
  card: (dark: boolean) => `0 1px 1px rgba(${dark ? '0,0,0' : '30,25,15'},0.03), 0 8px 28px -12px rgba(${dark ? '0,0,0' : '30,25,15'},0.14)`,
  lift: (dark: boolean) => `0 2px 4px rgba(${dark ? '0,0,0' : '30,25,15'},0.04), 0 22px 48px -18px rgba(${dark ? '0,0,0' : '30,25,15'},0.28)`,
  float: (dark: boolean) => `0 10px 40px -10px rgba(${dark ? '0,0,0' : '30,25,15'},0.35)`,
};
