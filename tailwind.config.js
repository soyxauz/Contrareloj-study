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
