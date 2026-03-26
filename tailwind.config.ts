import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'primary': '#ffb9a0',
        'primary-container': '#ff9066',
        'on-primary': '#5b1b00',
        'on-primary-container': '#752805',
        'secondary': '#f7b8a2',
        'secondary-container': '#6a3e2d',
        'tertiary': '#4bdece',
        'tertiary-container': '#1bc2b3',
        'on-tertiary': '#003732',
        'background': '#131313',
        'surface': '#131313',
        'surface-dim': '#131313',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1c1b1b',
        'surface-container': '#201f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353534',
        'surface-bright': '#3a3939',
        'surface-variant': '#353534',
        'on-surface': '#e5e2e1',
        'on-surface-variant': '#dcc1b8',
        'on-background': '#e5e2e1',
        'outline': '#a48b83',
        'outline-variant': '#56423c',
        'inverse-surface': '#e5e2e1',
        'inverse-on-surface': '#313030',
        'inverse-primary': '#9c4420',
        'error': '#ffb4ab',
        'error-container': '#93000a',
      },
      fontFamily: {
        headline: ['Lexend', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        label: ['Manrope', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-out': { '0%': { opacity: '1', transform: 'translateY(0)' }, '100%': { opacity: '0', transform: 'translateY(6px)' } },
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out both',
        'fade-out': 'fade-out 0.18s ease-out both',
        'slide-up': 'slide-up 0.25s cubic-bezier(0.32,0.72,0,1) both',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '0.75rem',
      },
    },
  },
  plugins: [],
}

export default config
