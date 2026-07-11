/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}', './app.html', './index.html'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          900: '#0c3040',
        },
        site: {
          bg:       '#040E12',
          bgAlt:    '#061419',
          text:     '#EEF5F7',
          textSub:  '#B2C4C8',
          textMuted:'#7A9099',
          accent:   '#0EC4D8',
        },
      },
      boxShadow: {
        panel: '0 4px 24px 0 rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};
