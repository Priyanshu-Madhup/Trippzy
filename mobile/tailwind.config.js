/** Trippy's design system, ported. Colours come from CSS variables set by ThemeProvider
 *  (see src/theme/tokens.ts), so every class is theme-aware without `dark:` variants.
 *  Solid tokens are RGB channels (supports `/opacity`); tokens that carry their own alpha
 *  (lines, tinted backgrounds) are full rgba() strings. */
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        'bg-elevated': c('bg-elevated'),
        surface: c('surface'),
        'surface-2': c('surface-2'),
        'surface-3': c('surface-3'),
        ink: c('ink'),
        'ink-2': c('ink-2'),
        muted: c('muted'),
        faint: c('faint'),
        primary: c('primary'),
        'primary-ink': c('primary-ink'),
        navy: c('navy'),
        sun: c('sun'),
        'sun-ink': c('sun-ink'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        // alpha baked in
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        'warning-bg': 'var(--warning-bg)',
        'danger-bg': 'var(--danger-bg)',
      },
      // React Native needs one font family per weight (no variable-font weight axis).
      fontFamily: {
        geist: ['Geist_400Regular'],
        'geist-medium': ['Geist_500Medium'],
        'geist-semibold': ['Geist_600SemiBold'],
        'geist-bold': ['Geist_700Bold'],
        'geist-mono': ['GeistMono_500Medium'],
        'geist-mono-semibold': ['GeistMono_600SemiBold'],
        'serif-italic': ['InstrumentSerif_400Regular_Italic'],
        serif: ['InstrumentSerif_400Regular'],
      },
      borderRadius: {
        card: '26px',
        trip: '28px',
        hero: '30px',
        'hero-lg': '32px',
        sheet: '28px',
      },
    },
  },
  plugins: [],
};
