/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'sm': '320px',
        'md': '480px',
      },
      colors: {
        dark: '#0A0A0F',
        card: '#14141C',
        accent: '#7C3AED',
        gold: '#F59E0B',
      }
    },
  },
  plugins: [],
}