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
          bg: '#090314',
          surface: '#130924',
          surfaceLight: '#1d0f36',
          border: '#2c194f',
          accent: '#8b5cf6',
          accentHover: '#7c3aed',
          plusGold: '#f59e0b',
          plusRose: '#ec4899',
          cyan: '#06b6d4',
        }
      }
    },
  },
  plugins: [],
};
