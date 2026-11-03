/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#111827',
        midnight: '#0B1120',
        purple: { DEFAULT: '#7563D9', soft: '#F0EDFF' },
        lavender: '#B9AEF5',
        ink: '#202438',
        muted: '#778096',
        canvas: '#F7F8FC',
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      boxShadow: { card: '0 12px 32px rgba(32, 36, 56, .07)' },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
};
