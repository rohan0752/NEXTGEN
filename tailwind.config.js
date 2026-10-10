/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        campus: {
          50: '#f0f5ff',
          100: '#e0ebff',
          200: '#c7d8fe',
          300: '#a4bcfc',
          400: '#809cf9',
          500: '#5c78f4',
          600: '#435be9',
          700: '#3445d4',
          800: '#2b39ab',
          900: '#1e295d',
          950: '#0f172a',
        },
        navy: {
          800: '#111827',
          900: '#0b1120',
          950: '#030712',
        }
      },
    },
  },
  plugins: [],
}
