/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        violet: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e11d48',
          600: '#be123c',
          700: '#9f1239',
          800: '#881337',
          900: '#4c0519',
          950: '#28030d',
        },
        purple: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e11d48',
          600: '#be123c',
          700: '#9f1239',
          800: '#881337',
          900: '#4c0519',
          950: '#28030d',
        },
        wine: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e11d48',
          600: '#be123c',
          700: '#9f1239',
          800: '#881337',
          900: '#4c0519',
          950: '#28030d',
        },
        thea: {
          bg: 'rgb(var(--thea-bg) / <alpha-value>)',
          surface: 'rgb(var(--thea-surface) / <alpha-value>)',
          surfaceLight: 'rgb(var(--thea-surface-light) / <alpha-value>)',
          border: 'rgb(var(--thea-border) / <alpha-value>)',
          accent: 'rgb(var(--thea-accent) / <alpha-value>)',
          accentHover: 'rgb(var(--thea-accent-hover) / <alpha-value>)',
          plusGold: 'rgb(var(--thea-plus-gold) / <alpha-value>)',
          plusRose: 'rgb(var(--thea-plus-rose) / <alpha-value>)',
          cyan: 'rgb(var(--thea-cyan) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
};
