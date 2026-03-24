import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#ff9066',
        'primary-dim': '#ff743b',
        secondary: '#ff8d44',
        background: '#0e0e0e',
        surface: '#0e0e0e',
        'surface-container': '#1a1919',
        'surface-container-high': '#201f1f',
        'surface-container-highest': '#262626',
        'on-surface': '#ffffff',
        'on-surface-variant': '#adaaaa',
        'outline-variant': '#484847',
      },
      fontFamily: {
        headline: ['Lexend', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
